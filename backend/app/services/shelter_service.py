from datetime import date, datetime, timedelta
from typing import Optional
from fastapi import HTTPException
from app.database import db_read, db_transaction


def parse_iso_date(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid date format '{value}'; expected YYYY-MM-DD.") from exc


def today_date() -> date:
    return date.today()


def next_sequential_code(conn, table: str, column: str, prefix: str, year: int) -> str:
    like_pattern = f"{prefix}-{year}-%"
    row = conn.execute(
        f"SELECT {column} FROM {table} WHERE {column} LIKE ? ORDER BY id DESC LIMIT 1",
        (like_pattern,),
    ).fetchone()
    if not row:
        seq = 1
    else:
        try:
            seq = int(row[0].split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    return f"{prefix}-{year}-{seq:04d}"


def check_zone_capacity(
    conn,
    zone_id: int,
    expected_species_id: Optional[int] = None,
    exclude_animal_id: Optional[int] = None,
) -> dict:
    zone = conn.execute(
        """
        SELECT z.*, s.name AS species_name
        FROM shelter_zones z
        JOIN species s ON s.id = z.species_id
        WHERE z.id = ?
        """,
        (zone_id,),
    ).fetchone()
    if not zone:
        raise HTTPException(status_code=404, detail=f"Shelter zone {zone_id} not found.")

    if expected_species_id is not None and zone["species_id"] != expected_species_id:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Zone {zone['zone_code']} ({zone['species_name']}) cannot house "
                f"a different species."
            ),
        )

    query = """
        SELECT COUNT(*) FROM animals
        WHERE zone_id = ?
          AND adoption_status NOT IN ('adopted', 'deceased')
    """
    params = [zone_id]
    if exclude_animal_id is not None:
        query += " AND id != ?"
        params.append(exclude_animal_id)

    current_count = conn.execute(query, tuple(params)).fetchone()[0]
    if current_count >= zone["max_capacity"]:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Shelter capacity exceeded for zone {zone['zone_code']} "
                f"({current_count}/{zone['max_capacity']} occupied)."
            ),
        )

    return dict(zone)


def register_intake_and_animal(payload) -> dict:
    intake_dt = parse_iso_date(payload.intake_date)

    with db_transaction() as conn:
        breed = conn.execute(
            """
            SELECT b.id, b.name AS breed_name, b.species_id,
                   s.name AS species_name, s.quarantine_days
            FROM breeds b
            JOIN species s ON s.id = b.species_id
            WHERE b.id = ?
            """,
            (payload.breed_id,),
        ).fetchone()
        if not breed:
            raise HTTPException(status_code=404, detail=f"Breed {payload.breed_id} not found.")

        check_zone_capacity(conn, payload.zone_id, expected_species_id=breed["species_id"])

        quarantine_until = (intake_dt + timedelta(days=breed["quarantine_days"])).isoformat()
        intake_code = next_sequential_code(conn, "intake_records", "intake_code", "INT", intake_dt.year)
        microchip_id = next_sequential_code(conn, "animals", "microchip_id", "PAW", intake_dt.year)

        cur_intake = conn.execute(
            """
            INSERT INTO intake_records (intake_code, source_type, source_name, intake_date, intake_condition, notes)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                intake_code,
                payload.source_type,
                payload.source_name,
                payload.intake_date,
                payload.intake_condition,
                payload.intake_notes,
            ),
        )
        intake_id = cur_intake.lastrowid

        initial_medical = "critical" if payload.intake_condition == "critical" else "quarantine"
        cur_animal = conn.execute(
            """
            INSERT INTO animals (
                microchip_id, name, breed_id, intake_id, zone_id, gender,
                age_months, weight_kg, intake_date, quarantine_until,
                medical_status, adoption_status, spayed_neutered,
                good_with_kids, good_with_pets, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'medical_hold', ?, ?, ?, ?)
            """,
            (
                microchip_id,
                payload.name,
                payload.breed_id,
                intake_id,
                payload.zone_id,
                payload.gender,
                payload.age_months,
                payload.weight_kg,
                payload.intake_date,
                quarantine_until,
                initial_medical,
                1 if payload.spayed_neutered else 0,
                1 if payload.good_with_kids else 0,
                1 if payload.good_with_pets else 0,
                payload.animal_notes,
            ),
        )
        animal_id = cur_animal.lastrowid

        row = conn.execute(
            """
            SELECT a.*, b.name AS breed_name, s.name AS species_name,
                   z.zone_code, z.zone_name, i.intake_code
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            JOIN shelter_zones z ON z.id = a.zone_id
            LEFT JOIN intake_records i ON i.id = a.intake_id
            WHERE a.id = ?
            """,
            (animal_id,),
        ).fetchone()
        return dict(row)


def move_animal_to_zone(animal_id: int, new_zone_id: int) -> dict:
    with db_transaction() as conn:
        animal = conn.execute(
            """
            SELECT a.*, b.species_id
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            WHERE a.id = ?
            """,
            (animal_id,),
        ).fetchone()
        if not animal:
            raise HTTPException(status_code=404, detail=f"Animal {animal_id} not found.")
        if animal["adoption_status"] in ("adopted", "deceased"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot relocate animal with status '{animal['adoption_status']}'.",
            )

        check_zone_capacity(
            conn,
            new_zone_id,
            expected_species_id=animal["species_id"],
            exclude_animal_id=animal_id,
        )
        conn.execute("UPDATE animals SET zone_id = ? WHERE id = ?", (new_zone_id, animal_id))
        updated = conn.execute(
            """
            SELECT a.*, b.name AS breed_name, s.name AS species_name, z.zone_code, z.zone_name
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            JOIN shelter_zones z ON z.id = a.zone_id
            WHERE a.id = ?
            """,
            (animal_id,),
        ).fetchone()
        return dict(updated)


def sync_vaccination_statuses_conn(conn, reference_date: Optional[date] = None) -> dict:
    ref = reference_date or today_date()
    rows = conn.execute("SELECT id, next_due_date, status FROM vaccination_records").fetchall()

    counts = {"valid": 0, "due_soon": 0, "overdue": 0, "changed": 0}
    for row in rows:
        due_dt = parse_iso_date(row["next_due_date"])
        days_left = (due_dt - ref).days
        if days_left < 0:
            new_status = "overdue"
        elif days_left <= 14:
            new_status = "due_soon"
        else:
            new_status = "valid"

        counts[new_status] += 1
        if row["status"] != new_status:
            conn.execute(
                "UPDATE vaccination_records SET status = ? WHERE id = ?",
                (new_status, row["id"]),
            )
            counts["changed"] += 1

    return {"reference_date": ref.isoformat(), **counts}


def sync_vaccination_statuses(reference_date: Optional[date] = None) -> dict:
    with db_transaction() as conn:
        return sync_vaccination_statuses_conn(conn, reference_date=reference_date)


def log_vaccination(payload) -> dict:
    admin_dt = parse_iso_date(payload.administered_date)

    with db_transaction() as conn:
        animal = conn.execute(
            """
            SELECT a.id, a.name, b.species_id, s.name AS species_name
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            WHERE a.id = ?
            """,
            (payload.animal_id,),
        ).fetchone()
        if not animal:
            raise HTTPException(status_code=404, detail=f"Animal {payload.animal_id} not found.")

        vaccine = conn.execute(
            "SELECT * FROM vaccine_types WHERE id = ?",
            (payload.vaccine_type_id,),
        ).fetchone()
        if not vaccine:
            raise HTTPException(status_code=404, detail=f"Vaccine type {payload.vaccine_type_id} not found.")

        if vaccine["species_id"] != animal["species_id"]:
            raise HTTPException(
                status_code=400,
                detail=f"Vaccine '{vaccine['vaccine_name']}' is not valid for species '{animal['species_name']}'.",
            )

        next_due = (admin_dt + timedelta(days=vaccine["booster_interval_days"])).isoformat()
        cur = conn.execute(
            """
            INSERT INTO vaccination_records (
                animal_id, vaccine_type_id, administered_date, next_due_date,
                batch_number, administered_by, status
            )
            VALUES (?, ?, ?, ?, ?, ?, 'valid')
            """,
            (
                payload.animal_id,
                payload.vaccine_type_id,
                payload.administered_date,
                next_due,
                payload.batch_number,
                payload.administered_by,
            ),
        )
        sync_vaccination_statuses_conn(conn)
        created = conn.execute(
            """
            SELECT v.*, vt.vaccine_name, vt.is_mandatory, vt.booster_interval_days,
                   a.name AS animal_name, a.microchip_id
            FROM vaccination_records v
            JOIN vaccine_types vt ON vt.id = v.vaccine_type_id
            JOIN animals a ON a.id = v.animal_id
            WHERE v.id = ?
            """,
            (cur.lastrowid,),
        ).fetchone()
        return dict(created)


def log_medical_record(payload) -> dict:
    parse_iso_date(payload.visit_date)

    with db_transaction() as conn:
        animal = conn.execute("SELECT * FROM animals WHERE id = ?", (payload.animal_id,)).fetchone()
        if not animal:
            raise HTTPException(status_code=404, detail=f"Animal {payload.animal_id} not found.")

        # Prevent veterinary clearance if quarantine period has not elapsed yet
        if payload.cleared_for_adoption or payload.update_medical_status == "cleared":
            visit_dt = parse_iso_date(payload.visit_date)
            quarantine_dt = parse_iso_date(animal["quarantine_until"])
            ref_dt = max(visit_dt, today_date())
            if ref_dt < quarantine_dt:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Cannot grant adoption medical clearance before quarantine ends "
                        f"on {animal['quarantine_until']}."
                    ),
                )

        cur = conn.execute(
            """
            INSERT INTO medical_records (
                animal_id, visit_date, record_type, diagnosis,
                treatment_notes, vet_name, cleared_for_adoption
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.animal_id,
                payload.visit_date,
                payload.record_type,
                payload.diagnosis,
                payload.treatment_notes,
                payload.vet_name,
                1 if payload.cleared_for_adoption else 0,
            ),
        )

        new_med_status = payload.update_medical_status
        if new_med_status is None and payload.cleared_for_adoption:
            new_med_status = "cleared"

        if new_med_status:
            new_adoption_status = animal["adoption_status"]
            if new_med_status == "cleared" and animal["adoption_status"] == "medical_hold":
                new_adoption_status = "available"
            elif new_med_status in ("critical", "quarantine", "treatment") and animal["adoption_status"] == "available":
                new_adoption_status = "medical_hold"

            conn.execute(
                "UPDATE animals SET medical_status = ?, adoption_status = ? WHERE id = ?",
                (new_med_status, new_adoption_status, payload.animal_id),
            )

        row = conn.execute(
            """
            SELECT m.*, a.name AS animal_name, a.microchip_id
            FROM medical_records m
            JOIN animals a ON a.id = m.animal_id
            WHERE m.id = ?
            """,
            (cur.lastrowid,),
        ).fetchone()
        return dict(row)


def evaluate_adoption_readiness(conn, animal_id: int, reference_date: Optional[date] = None) -> dict:
    ref = reference_date or today_date()
    sync_vaccination_statuses_conn(conn, reference_date=ref)

    animal = conn.execute(
        """
        SELECT a.*, b.species_id, b.name AS breed_name,
               s.name AS species_name, s.min_adoption_age_months
        FROM animals a
        JOIN breeds b ON b.id = a.breed_id
        JOIN species s ON s.id = b.species_id
        WHERE a.id = ?
        """,
        (animal_id,),
    ).fetchone()
    if not animal:
        raise HTTPException(status_code=404, detail=f"Animal {animal_id} not found.")

    blockers = []
    if animal["adoption_status"] in ("adopted", "deceased"):
        blockers.append(f"Animal status is '{animal['adoption_status']}'.")
    if animal["adoption_status"] == "medical_hold":
        blockers.append("Animal is currently on medical hold.")

    quarantine_dt = parse_iso_date(animal["quarantine_until"])
    if ref < quarantine_dt:
        days_rem = (quarantine_dt - ref).days
        blockers.append(
            f"Mandatory quarantine active until {animal['quarantine_until']} ({days_rem} day(s) remaining)."
        )

    if animal["medical_status"] != "cleared":
        blockers.append(f"Medical status is '{animal['medical_status']}' (must be 'cleared').")

    if animal["age_months"] < animal["min_adoption_age_months"]:
        blockers.append(
            f"Age ({animal['age_months']}m) is below species minimum ({animal['min_adoption_age_months']}m)."
        )

    mandatory_vaccines = conn.execute(
        """
        SELECT id, vaccine_name
        FROM vaccine_types
        WHERE species_id = ? AND is_mandatory = 1
        """,
        (animal["species_id"],),
    ).fetchall()

    valid_count = 0
    for mv in mandatory_vaccines:
        latest = conn.execute(
            """
            SELECT status, next_due_date
            FROM vaccination_records
            WHERE animal_id = ? AND vaccine_type_id = ?
            ORDER BY administered_date DESC, id DESC
            LIMIT 1
            """,
            (animal_id, mv["id"]),
        ).fetchone()
        if not latest:
            blockers.append(f"Missing mandatory vaccine: {mv['vaccine_name']}.")
        elif latest["status"] == "overdue":
            blockers.append(
                f"Mandatory vaccine '{mv['vaccine_name']}' is overdue (due {latest['next_due_date']})."
            )
        else:
            valid_count += 1

    return {
        "animal_id": animal_id,
        "ready": len(blockers) == 0,
        "blockers": blockers,
        "mandatory_vaccines_total": len(mandatory_vaccines),
        "mandatory_vaccines_valid": valid_count,
    }


def compute_smart_matches(adopter_id: Optional[int] = None, reference_date: Optional[date] = None) -> list[dict]:
    ref = reference_date or today_date()

    with db_read() as conn:
        adopter = None
        if adopter_id is not None:
            adopter = conn.execute("SELECT * FROM adopters WHERE id = ?", (adopter_id,)).fetchone()
            if not adopter:
                raise HTTPException(status_code=404, detail=f"Adopter {adopter_id} not found.")

        zone_counts = {
            r["zone_id"]: r["occ"]
            for r in conn.execute(
                """
                SELECT zone_id, COUNT(*) AS occ
                FROM animals
                WHERE adoption_status NOT IN ('adopted', 'deceased')
                GROUP BY zone_id
                """
            ).fetchall()
        }

        animals = conn.execute(
            """
            SELECT a.*, b.name AS breed_name, b.size_category, b.requires_yard,
                   s.id AS species_id, s.name AS species_name,
                   z.zone_code, z.zone_name, z.max_capacity
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            JOIN shelter_zones z ON z.id = a.zone_id
            WHERE a.adoption_status NOT IN ('adopted', 'deceased')
            ORDER BY a.intake_date ASC
            """
        ).fetchall()

        results = []
        for row in animals:
            readiness = evaluate_adoption_readiness(conn, row["id"], reference_date=ref)
            intake_dt = parse_iso_date(row["intake_date"])
            stay_days = max(0, (ref - intake_dt).days)
            occ = zone_counts.get(row["zone_id"], 0)
            occ_ratio = occ / max(1, row["max_capacity"])

            # 1. Urgency & Longest-Stay Score (0-35): prioritizes animals waiting longest & crowded zones
            stay_score = min(25, round((stay_days / 90.0) * 25))
            crowding_score = round(occ_ratio * 10)
            urgency_score = stay_score + crowding_score

            # 2. Readiness Score (0-25)
            readiness_score = 20 if readiness["ready"] else max(0, 10 - 3 * len(readiness["blockers"]))
            if row["spayed_neutered"]:
                readiness_score += 5

            # 3. Lifestyle Compatibility Score (0-40)
            compatibility_score = 30
            match_reasons = []
            warnings = []

            if adopter:
                compatibility_score = 40
                if row["requires_yard"] and not adopter["has_yard"]:
                    compatibility_score -= 18
                    warnings.append("Breed prefers yard; adopter has no yard")
                elif row["requires_yard"] and adopter["has_yard"]:
                    match_reasons.append("Yard requirement satisfied")

                if adopter["has_other_pets"] and not row["good_with_pets"]:
                    compatibility_score -= 22
                    warnings.append("Not suited for households with other pets")
                elif adopter["has_other_pets"] and row["good_with_pets"]:
                    match_reasons.append("Compatible with existing pets")

                if adopter["has_children"] and not row["good_with_kids"]:
                    compatibility_score -= 22
                    warnings.append("Not recommended for homes with children")
                elif adopter["has_children"] and row["good_with_kids"]:
                    match_reasons.append("Kid-friendly temperament")

                if row["size_category"] in ("small", "medium") and adopter["housing_type"] in ("apartment", "condo"):
                    match_reasons.append("Size fits apartment/condo living")

            if stay_days >= 30:
                match_reasons.append(f"Long-stay priority ({stay_days} days in care)")
            if occ_ratio >= 0.75:
                match_reasons.append(f"High zone occupancy ({occ}/{row['max_capacity']})")

            total_score = max(0, min(100, urgency_score + readiness_score + compatibility_score))
            results.append(
                {
                    "animal_id": row["id"],
                    "microchip_id": row["microchip_id"],
                    "name": row["name"],
                    "species_name": row["species_name"],
                    "breed_name": row["breed_name"],
                    "size_category": row["size_category"],
                    "age_months": row["age_months"],
                    "zone_code": row["zone_code"],
                    "intake_date": row["intake_date"],
                    "stay_days": stay_days,
                    "adoption_status": row["adoption_status"],
                    "medical_status": row["medical_status"],
                    "ready_for_adoption": readiness["ready"],
                    "blockers": readiness["blockers"],
                    "priority_score": total_score,
                    "score_breakdown": {
                        "urgency_stay": urgency_score,
                        "medical_readiness": readiness_score,
                        "lifestyle_compatibility": compatibility_score,
                    },
                    "match_reasons": match_reasons,
                    "warnings": warnings,
                }
            )

        results.sort(key=lambda item: (item["ready_for_adoption"], item["priority_score"]), reverse=True)
        return results
