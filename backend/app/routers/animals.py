from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_read, db_transaction
from app.models import AnimalEditUpdate, AnimalStatusUpdate, AnimalZoneMove, IntakeAndAnimalCreate
from app.services.auth_service import get_current_user, require_roles
from app.services.shelter_service import (
    evaluate_adoption_readiness,
    move_animal_to_zone,
    parse_iso_date,
    register_intake_and_animal,
    today_date,
)

router = APIRouter(prefix="/api/animals", tags=["Animals & Intake"])


@router.get("")
def list_animals(
    species: Optional[str] = Query(None),
    adoption_status: Optional[str] = Query(None),
    medical_status: Optional[str] = Query(None),
    zone_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    with db_read() as conn:
        query = """
            SELECT a.*, b.name AS breed_name, b.size_category, b.requires_yard,
                   s.id AS species_id, s.name AS species_name,
                   z.zone_code, z.zone_name,
                   i.intake_code, i.source_type, i.intake_condition
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            JOIN shelter_zones z ON z.id = a.zone_id
            LEFT JOIN intake_records i ON i.id = a.intake_id
            WHERE 1=1
        """
        params = []

        if current_user["role"] == "ADOPTER":
            adopter_id = current_user.get("adopter_id")
            query += """
                AND (
                    a.adoption_status IN ('available', 'pending_adoption')
                    OR a.id IN (SELECT animal_id FROM adoption_placements WHERE adopter_id = ?)
                )
            """
            params.append(adopter_id or -1)

        if species:
            query += " AND LOWER(s.name) = LOWER(?)"
            params.append(species)
        if adoption_status:
            query += " AND a.adoption_status = ?"
            params.append(adoption_status)
        if medical_status:
            query += " AND a.medical_status = ?"
            params.append(medical_status)
        if zone_id is not None:
            query += " AND a.zone_id = ?"
            params.append(zone_id)
        if search:
            query += " AND (LOWER(a.name) LIKE LOWER(?) OR LOWER(a.microchip_id) LIKE LOWER(?) OR LOWER(b.name) LIKE LOWER(?))"
            like_val = f"%{search}%"
            params.extend([like_val, like_val, like_val])

        query += " ORDER BY a.id DESC"
        rows = conn.execute(query, tuple(params)).fetchall()

        results = []
        for r in rows:
            d = dict(r)
            readiness = evaluate_adoption_readiness(conn, r["id"])
            d["adoption_ready"] = readiness["ready"]
            d["readiness_blockers"] = readiness["blockers"]
            results.append(d)
        return results


@router.get("/intakes")
def list_intake_records(current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF"))):
    with db_read() as conn:
        rows = conn.execute(
            """
            SELECT i.*, a.id AS animal_id, a.name AS animal_name, a.microchip_id,
                   b.name AS breed_name, s.name AS species_name
            FROM intake_records i
            LEFT JOIN animals a ON a.intake_id = i.id
            LEFT JOIN breeds b ON b.id = a.breed_id
            LEFT JOIN species s ON s.id = b.species_id
            ORDER BY i.intake_date DESC, i.id DESC
            """
        ).fetchall()
        return [dict(r) for r in rows]


@router.get("/{animal_id}")
def get_animal_detail(animal_id: int, current_user: dict = Depends(get_current_user)):
    with db_read() as conn:
        row = conn.execute(
            """
            SELECT a.*, b.name AS breed_name, b.size_category, b.requires_yard,
                   s.id AS species_id, s.name AS species_name, s.quarantine_days,
                   z.zone_code, z.zone_name,
                   i.intake_code, i.source_type, i.source_name, i.intake_condition
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            JOIN shelter_zones z ON z.id = a.zone_id
            LEFT JOIN intake_records i ON i.id = a.intake_id
            WHERE a.id = ?
            """,
            (animal_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Animal {animal_id} not found.")

        if current_user["role"] == "ADOPTER":
            adopter_id = current_user.get("adopter_id")
            if row["adoption_status"] == "deceased":
                raise HTTPException(status_code=403, detail="Access denied for this animal record.")
            if row["adoption_status"] == "adopted":
                owns = conn.execute(
                    "SELECT id FROM adoption_placements WHERE animal_id = ? AND adopter_id = ?",
                    (animal_id, adopter_id or -1),
                ).fetchone()
                if not owns:
                    raise HTTPException(status_code=403, detail="Access denied for another adopter's pet.")

        medical_records = [
            dict(m)
            for m in conn.execute(
                "SELECT visit_date, record_type, diagnosis, treatment_notes, vet_name, cleared_for_adoption, id FROM medical_records WHERE animal_id = ? ORDER BY visit_date DESC, id DESC",
                (animal_id,),
            ).fetchall()
        ]
        vaccinations = [
            dict(v)
            for v in conn.execute(
                """
                SELECT vr.id, vr.administered_date, vr.next_due_date, vr.status, vr.administered_by,
                       vt.vaccine_name, vt.is_mandatory, vt.booster_interval_days
                FROM vaccination_records vr
                JOIN vaccine_types vt ON vt.id = vr.vaccine_type_id
                WHERE vr.animal_id = ?
                ORDER BY vr.administered_date DESC, vr.id DESC
                """,
                (animal_id,),
            ).fetchall()
        ]

        if current_user["role"] == "ADOPTER":
            applications = [
                dict(app)
                for app in conn.execute(
                    """
                    SELECT app.*, ad.full_name AS adopter_name, ad.email AS adopter_email
                    FROM adoption_applications app
                    JOIN adopters ad ON ad.id = app.adopter_id
                    WHERE app.animal_id = ? AND app.adopter_id = ?
                    ORDER BY app.submitted_at DESC
                    """,
                    (animal_id, current_user.get("adopter_id") or -1),
                ).fetchall()
            ]
        else:
            applications = [
                dict(app)
                for app in conn.execute(
                    """
                    SELECT app.*, ad.full_name AS adopter_name, ad.email AS adopter_email
                    FROM adoption_applications app
                    JOIN adopters ad ON ad.id = app.adopter_id
                    WHERE app.animal_id = ?
                    ORDER BY app.submitted_at DESC
                    """,
                    (animal_id,),
                ).fetchall()
            ]

        readiness = evaluate_adoption_readiness(conn, animal_id)

        return {
            **dict(row),
            "readiness": readiness,
            "medical_records": medical_records,
            "vaccinations": vaccinations,
            "applications": applications,
        }


@router.post("/intake", status_code=201)
def create_intake_and_animal(
    payload: IntakeAndAnimalCreate,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    return register_intake_and_animal(payload)


@router.put("/{animal_id}")
def update_animal_details(
    animal_id: int,
    payload: AnimalEditUpdate,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    with db_transaction() as conn:
        animal = conn.execute("SELECT * FROM animals WHERE id = ?", (animal_id,)).fetchone()
        if not animal:
            raise HTTPException(status_code=404, detail=f"Animal {animal_id} not found.")

        conn.execute(
            """
            UPDATE animals
            SET name = ?, age_months = ?, weight_kg = ?,
                spayed_neutered = ?, good_with_kids = ?, good_with_pets = ?, notes = ?
            WHERE id = ?
            """,
            (
                payload.name if payload.name is not None else animal["name"],
                payload.age_months if payload.age_months is not None else animal["age_months"],
                payload.weight_kg if payload.weight_kg is not None else animal["weight_kg"],
                (1 if payload.spayed_neutered else 0) if payload.spayed_neutered is not None else animal["spayed_neutered"],
                (1 if payload.good_with_kids else 0) if payload.good_with_kids is not None else animal["good_with_kids"],
                (1 if payload.good_with_pets else 0) if payload.good_with_pets is not None else animal["good_with_pets"],
                payload.notes if payload.notes is not None else animal["notes"],
                animal_id,
            ),
        )
        updated = conn.execute(
            """
            SELECT a.*, b.name AS breed_name, s.name AS species_name, z.zone_code
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            JOIN shelter_zones z ON z.id = a.zone_id
            WHERE a.id = ?
            """,
            (animal_id,),
        ).fetchone()
        return dict(updated)


@router.patch("/{animal_id}/zone")
def relocate_animal_zone(
    animal_id: int,
    payload: AnimalZoneMove,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    return move_animal_to_zone(animal_id, payload.zone_id)


@router.patch("/{animal_id}/status")
def update_animal_status(
    animal_id: int,
    payload: AnimalStatusUpdate,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    with db_transaction() as conn:
        animal = conn.execute("SELECT * FROM animals WHERE id = ?", (animal_id,)).fetchone()
        if not animal:
            raise HTTPException(status_code=404, detail=f"Animal {animal_id} not found.")

        new_med = payload.medical_status or animal["medical_status"]
        new_adopt = payload.adoption_status or animal["adoption_status"]

        if new_adopt == "available":
            if today_date() < parse_iso_date(animal["quarantine_until"]):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot mark available before quarantine ends on {animal['quarantine_until']}.",
                )
            if new_med != "cleared":
                raise HTTPException(
                    status_code=400,
                    detail="Animal must have medical_status='cleared' before becoming available.",
                )

        spayed = (1 if payload.spayed_neutered else 0) if payload.spayed_neutered is not None else animal["spayed_neutered"]
        notes = payload.notes if payload.notes is not None else animal["notes"]

        conn.execute(
            """
            UPDATE animals
            SET medical_status = ?, adoption_status = ?, spayed_neutered = ?, notes = ?
            WHERE id = ?
            """,
            (new_med, new_adopt, spayed, notes, animal_id),
        )
        updated = conn.execute(
            """
            SELECT a.*, b.name AS breed_name, s.name AS species_name, z.zone_code
            FROM animals a
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            JOIN shelter_zones z ON z.id = a.zone_id
            WHERE a.id = ?
            """,
            (animal_id,),
        ).fetchone()
        return dict(updated)


@router.delete("/{animal_id}")
def delete_animal(
    animal_id: int,
    current_user: dict = Depends(require_roles("ADMIN")),
):
    with db_transaction() as conn:
        animal = conn.execute("SELECT id, name FROM animals WHERE id = ?", (animal_id,)).fetchone()
        if not animal:
            raise HTTPException(status_code=404, detail=f"Animal {animal_id} not found.")
        placed = conn.execute(
            "SELECT certificate_number FROM adoption_placements WHERE animal_id = ?", (animal_id,)
        ).fetchone()
        if placed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete animal with issued adoption certificate {placed['certificate_number']}.",
            )
        conn.execute("DELETE FROM animals WHERE id = ?", (animal_id,))
        return {"message": f"Animal '{animal['name']}' deleted."}
