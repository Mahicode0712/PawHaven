from datetime import date, timedelta
from typing import Optional
from fastapi import HTTPException
from app.database import db_transaction
from app.services.shelter_service import (
    evaluate_adoption_readiness,
    next_sequential_code,
    parse_iso_date,
    today_date,
)

VALID_TRANSITIONS = {
    "submitted": {"under_review", "rejected", "withdrawn"},
    "under_review": {"home_check", "approved", "rejected", "withdrawn"},
    "home_check": {"approved", "rejected", "withdrawn"},
    "approved": {"rejected", "withdrawn"},  # 'completed' is achieved atomically via finalize_adoption_placement
    "rejected": set(),
    "withdrawn": set(),
    "completed": set(),
}

REJECTION_COOLDOWN_DAYS = 30


def submit_adoption_application(payload, reference_date: Optional[date] = None) -> dict:
    ref = reference_date or today_date()

    with db_transaction() as conn:
        adopter = conn.execute("SELECT * FROM adopters WHERE id = ?", (payload.adopter_id,)).fetchone()
        if not adopter:
            raise HTTPException(status_code=404, detail=f"Adopter {payload.adopter_id} not found.")
        if adopter["status"] == "restricted":
            raise HTTPException(
                status_code=400,
                detail=f"Adopter '{adopter['full_name']}' is restricted and cannot submit applications.",
            )

        # Business Rule: 30-day cooldown after a rejected application
        recent_rejection = conn.execute(
            """
            SELECT application_code, date(updated_at) AS rejected_date
            FROM adoption_applications
            WHERE adopter_id = ? AND status = 'rejected'
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (payload.adopter_id,),
        ).fetchone()
        if recent_rejection and recent_rejection["rejected_date"]:
            rej_dt = parse_iso_date(recent_rejection["rejected_date"])
            days_since = (ref - rej_dt).days
            if days_since < REJECTION_COOLDOWN_DAYS:
                wait_days = REJECTION_COOLDOWN_DAYS - days_since
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Adopter cooldown active: previous application {recent_rejection['application_code']} "
                        f"was rejected {days_since} day(s) ago. Re-application allowed after {wait_days} more day(s)."
                    ),
                )

        animal = conn.execute("SELECT * FROM animals WHERE id = ?", (payload.animal_id,)).fetchone()
        if not animal:
            raise HTTPException(status_code=404, detail=f"Animal {payload.animal_id} not found.")
        if animal["adoption_status"] in ("adopted", "deceased"):
            raise HTTPException(
                status_code=400,
                detail=f"Animal '{animal['name']}' is already '{animal['adoption_status']}'.",
            )

        dup = conn.execute(
            """
            SELECT id, application_code FROM adoption_applications
            WHERE adopter_id = ? AND animal_id = ?
              AND status IN ('submitted', 'under_review', 'home_check', 'approved')
            """,
            (payload.adopter_id, payload.animal_id),
        ).fetchone()
        if dup:
            raise HTTPException(
                status_code=400,
                detail=f"Active application {dup['application_code']} already exists for this adopter and animal.",
            )

        app_code = next_sequential_code(conn, "adoption_applications", "application_code", "APP", ref.year)
        cur = conn.execute(
            """
            INSERT INTO adoption_applications (
                application_code, adopter_id, animal_id, status, home_check_passed, reviewer_notes
            )
            VALUES (?, ?, ?, 'submitted', 0, ?)
            """,
            (app_code, payload.adopter_id, payload.animal_id, payload.reviewer_notes or "Application submitted"),
        )

        if animal["adoption_status"] == "available":
            conn.execute(
                "UPDATE animals SET adoption_status = 'pending_adoption' WHERE id = ?",
                (payload.animal_id,),
            )

        return _fetch_application_row(conn, cur.lastrowid)


def advance_application_status(application_id: int, payload, reference_date: Optional[date] = None) -> dict:
    ref = reference_date or today_date()

    with db_transaction() as conn:
        app_row = conn.execute("SELECT * FROM adoption_applications WHERE id = ?", (application_id,)).fetchone()
        if not app_row:
            raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")

        current_status = app_row["status"]
        target_status = payload.status
        if target_status != current_status and target_status not in VALID_TRANSITIONS.get(current_status, set()):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid application transition from '{current_status}' to '{target_status}'.",
            )

        home_check = (
            (1 if payload.home_check_passed else 0)
            if payload.home_check_passed is not None
            else app_row["home_check_passed"]
        )

        if target_status == "approved":
            if not home_check:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot approve adoption application before home check is passed.",
                )
            readiness = evaluate_adoption_readiness(conn, app_row["animal_id"], reference_date=ref)
            if not readiness["ready"]:
                raise HTTPException(
                    status_code=400,
                    detail="Animal is not ready for adoption approval: " + "; ".join(readiness["blockers"]),
                )

        notes = payload.reviewer_notes if payload.reviewer_notes is not None else app_row["reviewer_notes"]
        conn.execute(
            """
            UPDATE adoption_applications
            SET status = ?, home_check_passed = ?, reviewer_notes = ?, updated_at = datetime('now')
            WHERE id = ?
            """,
            (target_status, home_check, notes, application_id),
        )

        # If rejected/withdrawn, restore animal availability if no other open applications exist
        if target_status in ("rejected", "withdrawn"):
            other_open = conn.execute(
                """
                SELECT COUNT(*) FROM adoption_applications
                WHERE animal_id = ? AND id != ?
                  AND status IN ('submitted', 'under_review', 'home_check', 'approved')
                """,
                (app_row["animal_id"], application_id),
            ).fetchone()[0]
            if other_open == 0:
                animal = conn.execute("SELECT * FROM animals WHERE id = ?", (app_row["animal_id"],)).fetchone()
                if animal and animal["adoption_status"] == "pending_adoption":
                    if animal["medical_status"] == "cleared" and ref >= parse_iso_date(animal["quarantine_until"]):
                        fallback = "available"
                    else:
                        fallback = "medical_hold"
                    conn.execute("UPDATE animals SET adoption_status = ? WHERE id = ?", (fallback, animal["id"]))

        return _fetch_application_row(conn, application_id)


def finalize_adoption_placement(application_id: int, payload) -> dict:
    adoption_dt = parse_iso_date(payload.adoption_date) if payload.adoption_date else today_date()

    with db_transaction() as conn:
        # Inside BEGIN IMMEDIATE lock: verify application, animal, and readiness
        app_row = conn.execute("SELECT * FROM adoption_applications WHERE id = ?", (application_id,)).fetchone()
        if not app_row:
            raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")
        if app_row["status"] != "approved":
            raise HTTPException(
                status_code=400,
                detail=f"Application must be 'approved' before final placement (current status: '{app_row['status']}').",
            )

        existing_placement = conn.execute(
            "SELECT certificate_number FROM adoption_placements WHERE animal_id = ?",
            (app_row["animal_id"],),
        ).fetchone()
        if existing_placement:
            raise HTTPException(
                status_code=409,
                detail=f"Animal is already adopted under certificate {existing_placement['certificate_number']}.",
            )

        readiness = evaluate_adoption_readiness(conn, app_row["animal_id"], reference_date=adoption_dt)
        if not readiness["ready"]:
            raise HTTPException(
                status_code=400,
                detail="Final placement blocked: " + "; ".join(readiness["blockers"]),
            )

        cert_no = next_sequential_code(conn, "adoption_placements", "certificate_number", "CERT", adoption_dt.year)
        cur = conn.execute(
            """
            INSERT INTO adoption_placements (
                certificate_number, application_id, animal_id, adopter_id,
                adoption_date, adoption_fee, issued_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                cert_no,
                application_id,
                app_row["animal_id"],
                app_row["adopter_id"],
                adoption_dt.isoformat(),
                payload.adoption_fee,
                payload.issued_by,
            ),
        )
        placement_id = cur.lastrowid

        conn.execute(
            "UPDATE animals SET adoption_status = 'adopted' WHERE id = ?",
            (app_row["animal_id"],),
        )
        conn.execute(
            "UPDATE adoption_applications SET status = 'completed', updated_at = datetime('now') WHERE id = ?",
            (application_id,),
        )
        conn.execute(
            """
            UPDATE adoption_applications
            SET status = 'rejected',
                reviewer_notes = COALESCE(reviewer_notes || ' | ', '') || 'Closed: animal placed with approved adopter.',
                updated_at = datetime('now')
            WHERE animal_id = ? AND id != ?
              AND status IN ('submitted', 'under_review', 'home_check', 'approved')
            """,
            (app_row["animal_id"], application_id),
        )

        # Auto-schedule post-adoption follow-ups (7-day, 30-day, 90-day)
        schedule_milestones = [
            (7, "7_day_check", "Auto-scheduled 7-day transition check-in"),
            (30, "30_day_check", "Auto-scheduled 30-day welfare & adjustment review"),
            (90, "90_day_check", "Auto-scheduled 90-day quarterly wellness check"),
        ]
        for offset_days, f_type, note in schedule_milestones:
            sched_date = (adoption_dt + timedelta(days=offset_days)).isoformat()
            conn.execute(
                """
                INSERT INTO post_adoption_followups (placement_id, scheduled_date, followup_type, animal_wellbeing, notes)
                VALUES (?, ?, ?, 'pending', ?)
                """,
                (placement_id, sched_date, f_type, note),
            )

        placement = conn.execute(
            """
            SELECT p.*, a.name AS animal_name, a.microchip_id,
                   ad.full_name AS adopter_name, app.application_code
            FROM adoption_placements p
            JOIN animals a ON a.id = p.animal_id
            JOIN adopters ad ON ad.id = p.adopter_id
            JOIN adoption_applications app ON app.id = p.application_id
            WHERE p.id = ?
            """,
            (placement_id,),
        ).fetchone()
        return dict(placement)


def create_followup(placement_id: int, payload) -> dict:
    parse_iso_date(payload.scheduled_date)
    with db_transaction() as conn:
        placement = conn.execute("SELECT id FROM adoption_placements WHERE id = ?", (placement_id,)).fetchone()
        if not placement:
            raise HTTPException(status_code=404, detail=f"Placement {placement_id} not found.")

        cur = conn.execute(
            """
            INSERT INTO post_adoption_followups (placement_id, scheduled_date, followup_type, animal_wellbeing, notes)
            VALUES (?, ?, ?, 'pending', ?)
            """,
            (placement_id, payload.scheduled_date, payload.followup_type, payload.notes),
        )
        return _fetch_followup_row(conn, cur.lastrowid)


def complete_followup(followup_id: int, payload) -> dict:
    comp_date = payload.completed_date or today_date().isoformat()
    parse_iso_date(comp_date)

    with db_transaction() as conn:
        existing = conn.execute("SELECT * FROM post_adoption_followups WHERE id = ?", (followup_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail=f"Follow-up {followup_id} not found.")

        conn.execute(
            """
            UPDATE post_adoption_followups
            SET completed_date = ?, animal_wellbeing = ?, notes = ?, conducted_by = ?
            WHERE id = ?
            """,
            (comp_date, payload.animal_wellbeing, payload.notes, payload.conducted_by, followup_id),
        )
        return _fetch_followup_row(conn, followup_id)


def _fetch_application_row(conn, application_id: int) -> dict:
    row = conn.execute(
        """
        SELECT app.*, ad.full_name AS adopter_name, ad.email AS adopter_email,
               ad.phone AS adopter_phone, ad.housing_type, ad.has_yard,
               a.name AS animal_name, a.microchip_id, a.adoption_status AS animal_adoption_status,
               b.name AS breed_name, s.name AS species_name
        FROM adoption_applications app
        JOIN adopters ad ON ad.id = app.adopter_id
        JOIN animals a ON a.id = app.animal_id
        JOIN breeds b ON b.id = a.breed_id
        JOIN species s ON s.id = b.species_id
        WHERE app.id = ?
        """,
        (application_id,),
    ).fetchone()
    return dict(row)


def _fetch_followup_row(conn, followup_id: int) -> dict:
    row = conn.execute(
        """
        SELECT f.*, p.certificate_number, p.adoption_date,
               a.name AS animal_name, a.microchip_id,
               ad.full_name AS adopter_name, ad.phone AS adopter_phone
        FROM post_adoption_followups f
        JOIN adoption_placements p ON p.id = f.placement_id
        JOIN animals a ON a.id = p.animal_id
        JOIN adopters ad ON ad.id = p.adopter_id
        WHERE f.id = ?
        """,
        (followup_id,),
    ).fetchone()
    return dict(row)
