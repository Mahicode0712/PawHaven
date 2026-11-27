from datetime import date
from typing import Optional
from fastapi import HTTPException
from app.database import db_read, db_transaction
from app.services.shelter_service import (
    evaluate_adoption_readiness,
    parse_iso_date,
    sync_vaccination_statuses_conn,
    today_date,
)


def get_adoption_certificate(placement_id: int) -> dict:
    with db_read() as conn:
        row = conn.execute(
            """
            SELECT p.*,
                   app.application_code, app.submitted_at, app.home_check_passed,
                   a.microchip_id, a.name AS animal_name, a.gender, a.age_months,
                   a.weight_kg, a.spayed_neutered, a.intake_date,
                   b.name AS breed_name, b.size_category,
                   s.name AS species_name,
                   ad.full_name AS adopter_name, ad.email AS adopter_email,
                   ad.phone AS adopter_phone, ad.address AS adopter_address,
                   ad.housing_type
            FROM adoption_placements p
            JOIN adoption_applications app ON app.id = p.application_id
            JOIN animals a ON a.id = p.animal_id
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            JOIN adopters ad ON ad.id = p.adopter_id
            WHERE p.id = ?
            """,
            (placement_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Adoption placement {placement_id} not found.")

        vaccinations = [
            dict(v)
            for v in conn.execute(
                """
                SELECT vr.administered_date, vr.next_due_date, vr.batch_number,
                       vr.administered_by, vr.status, vt.vaccine_name
                FROM vaccination_records vr
                JOIN vaccine_types vt ON vt.id = vr.vaccine_type_id
                WHERE vr.animal_id = ?
                ORDER BY vr.administered_date DESC
                """,
                (row["animal_id"],),
            ).fetchall()
        ]

        last_medical = conn.execute(
            """
            SELECT visit_date, record_type, diagnosis, vet_name, cleared_for_adoption
            FROM medical_records
            WHERE animal_id = ?
            ORDER BY visit_date DESC, id DESC
            LIMIT 1
            """,
            (row["animal_id"],),
        ).fetchone()

        followups = [
            dict(f)
            for f in conn.execute(
                """
                SELECT id, scheduled_date, completed_date, followup_type, animal_wellbeing, notes
                FROM post_adoption_followups
                WHERE placement_id = ?
                ORDER BY scheduled_date ASC
                """,
                (placement_id,),
            ).fetchall()
        ]

        return {
            **dict(row),
            "shelter_organization": "PawHaven Animal Welfare & Shelter Management",
            "vaccinations": vaccinations,
            "latest_medical_clearance": dict(last_medical) if last_medical else None,
            "scheduled_followups": followups,
        }


def get_shelter_occupancy_report(reference_date: Optional[date] = None) -> dict:
    ref = reference_date or today_date()

    with db_read() as conn:
        zones = conn.execute(
            """
            SELECT z.id, z.zone_code, z.zone_name, z.max_capacity, z.care_level,
                   s.name AS species_name,
                   COUNT(CASE WHEN a.adoption_status NOT IN ('adopted', 'deceased') THEN 1 END) AS occupied_slots,
                   COUNT(CASE WHEN a.adoption_status = 'available' THEN 1 END) AS available_pets,
                   COUNT(CASE WHEN a.adoption_status = 'pending_adoption' THEN 1 END) AS pending_pets,
                   COUNT(CASE WHEN a.adoption_status = 'medical_hold' THEN 1 END) AS medical_hold_pets
            FROM shelter_zones z
            JOIN species s ON s.id = z.species_id
            LEFT JOIN animals a ON a.zone_id = z.id
            GROUP BY z.id
            ORDER BY z.zone_code ASC
            """
        ).fetchall()

        zone_rows = []
        total_capacity = 0
        total_occupied = 0
        for z in zones:
            d = dict(z)
            d["available_slots"] = max(0, d["max_capacity"] - d["occupied_slots"])
            d["occupancy_pct"] = round((d["occupied_slots"] / d["max_capacity"]) * 100, 1)
            d["capacity_alert"] = d["occupancy_pct"] >= 80.0
            total_capacity += d["max_capacity"]
            total_occupied += d["occupied_slots"]
            zone_rows.append(d)

        active_animals = conn.execute(
            """
            SELECT a.intake_date, a.adoption_status, s.name AS species_name
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            WHERE a.adoption_status NOT IN ('adopted', 'deceased')
            """
        ).fetchall()

        stay_days_list = [max(0, (ref - parse_iso_date(a["intake_date"])).days) for a in active_animals]
        avg_stay = round(sum(stay_days_list) / len(stay_days_list), 1) if stay_days_list else 0.0

        species_breakdown = [
            dict(r)
            for r in conn.execute(
                """
                SELECT s.name AS species_name,
                       COUNT(CASE WHEN a.adoption_status NOT IN ('adopted', 'deceased') THEN 1 END) AS active_count,
                       COUNT(CASE WHEN a.adoption_status = 'adopted' THEN 1 END) AS adopted_count
                FROM species s
                LEFT JOIN breeds b ON b.species_id = s.id
                LEFT JOIN animals a ON a.breed_id = b.id
                GROUP BY s.id
                ORDER BY s.name ASC
                """
            ).fetchall()
        ]

        return {
            "generated_at": ref.isoformat(),
            "summary": {
                "total_capacity": total_capacity,
                "total_occupied": total_occupied,
                "total_available_slots": max(0, total_capacity - total_occupied),
                "overall_occupancy_pct": round((total_occupied / total_capacity) * 100, 1) if total_capacity else 0.0,
                "avg_length_of_stay_days": avg_stay,
            },
            "zones": zone_rows,
            "species_breakdown": species_breakdown,
        }


def get_animal_health_report(reference_date: Optional[date] = None) -> dict:
    ref = reference_date or today_date()

    with db_transaction() as conn:
        sync_vaccination_statuses_conn(conn, reference_date=ref)

        animals = conn.execute(
            """
            SELECT a.id, a.microchip_id, a.name, a.age_months, a.weight_kg,
                   a.intake_date, a.quarantine_until, a.medical_status,
                   a.adoption_status, a.spayed_neutered,
                   b.name AS breed_name, s.name AS species_name,
                   z.zone_code
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            JOIN shelter_zones z ON z.id = a.zone_id
            WHERE a.adoption_status != 'deceased'
            ORDER BY a.id ASC
            """
        ).fetchall()

        animal_rows = []
        kpi = {
            "total_animals": len(animals),
            "medically_cleared": 0,
            "in_quarantine": 0,
            "in_treatment_or_critical": 0,
            "adoption_ready_count": 0,
            "animals_with_overdue_vaccines": 0,
        }

        for a in animals:
            readiness = evaluate_adoption_readiness(conn, a["id"], reference_date=ref)
            vax_stats = conn.execute(
                """
                SELECT
                    COUNT(*) AS total_doses,
                    SUM(CASE WHEN status = 'valid' THEN 1 ELSE 0 END) AS valid_doses,
                    SUM(CASE WHEN status = 'due_soon' THEN 1 ELSE 0 END) AS due_soon_doses,
                    SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) AS overdue_doses
                FROM vaccination_records
                WHERE animal_id = ?
                """,
                (a["id"],),
            ).fetchone()

            last_exam = conn.execute(
                """
                SELECT visit_date, diagnosis, vet_name
                FROM medical_records
                WHERE animal_id = ?
                ORDER BY visit_date DESC, id DESC
                LIMIT 1
                """,
                (a["id"],),
            ).fetchone()

            if a["medical_status"] == "cleared":
                kpi["medically_cleared"] += 1
            elif a["medical_status"] == "quarantine":
                kpi["in_quarantine"] += 1
            else:
                kpi["in_treatment_or_critical"] += 1

            if readiness["ready"]:
                kpi["adoption_ready_count"] += 1
            if (vax_stats["overdue_doses"] or 0) > 0:
                kpi["animals_with_overdue_vaccines"] += 1

            quarantine_dt = parse_iso_date(a["quarantine_until"])
            animal_rows.append(
                {
                    **dict(a),
                    "quarantine_active": ref < quarantine_dt,
                    "mandatory_vaccines_valid": readiness["mandatory_vaccines_valid"],
                    "mandatory_vaccines_total": readiness["mandatory_vaccines_total"],
                    "total_doses": vax_stats["total_doses"] or 0,
                    "due_soon_doses": vax_stats["due_soon_doses"] or 0,
                    "overdue_doses": vax_stats["overdue_doses"] or 0,
                    "adoption_ready": readiness["ready"],
                    "readiness_blockers": readiness["blockers"],
                    "last_exam": dict(last_exam) if last_exam else None,
                }
            )

        return {
            "generated_at": ref.isoformat(),
            "summary": kpi,
            "animals": animal_rows,
        }
