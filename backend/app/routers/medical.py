from typing import Optional
from fastapi import APIRouter, Depends, Query
from app.database import db_read
from app.models import MedicalRecordCreate, VaccinationCreate
from app.services.auth_service import require_roles
from app.services.shelter_service import (
    log_medical_record,
    log_vaccination,
    parse_iso_date,
    sync_vaccination_statuses,
)

router = APIRouter(prefix="/api/medical", tags=["Medical & Vaccinations"])


@router.get("/records")
def list_medical_records(
    animal_id: Optional[int] = Query(None),
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    with db_read() as conn:
        query = """
            SELECT m.*, a.name AS animal_name, a.microchip_id,
                   b.name AS breed_name, s.name AS species_name
            FROM medical_records m
            JOIN animals a ON a.id = m.animal_id
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
        """
        params = []
        if animal_id is not None:
            query += " WHERE m.animal_id = ?"
            params.append(animal_id)
        query += " ORDER BY m.visit_date DESC, m.id DESC"
        return [dict(r) for r in conn.execute(query, tuple(params)).fetchall()]


@router.post("/records", status_code=201)
def create_medical_record(
    payload: MedicalRecordCreate,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    return log_medical_record(payload)


@router.get("/vaccinations")
def list_vaccinations(
    animal_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    with db_read() as conn:
        query = """
            SELECT vr.*, vt.vaccine_name, vt.is_mandatory, vt.booster_interval_days,
                   a.name AS animal_name, a.microchip_id, a.adoption_status,
                   s.name AS species_name
            FROM vaccination_records vr
            JOIN vaccine_types vt ON vt.id = vr.vaccine_type_id
            JOIN animals a ON a.id = vr.animal_id
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            WHERE 1=1
        """
        params = []
        if animal_id is not None:
            query += " AND vr.animal_id = ?"
            params.append(animal_id)
        if status:
            query += " AND vr.status = ?"
            params.append(status)
        query += " ORDER BY vr.next_due_date ASC, vr.id DESC"
        return [dict(r) for r in conn.execute(query, tuple(params)).fetchall()]


@router.post("/vaccinations", status_code=201)
def create_vaccination(
    payload: VaccinationCreate,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    return log_vaccination(payload)


@router.post("/vaccinations/sync-expiry")
def sync_vaccine_expiry(
    reference_date: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    ref = parse_iso_date(reference_date) if reference_date else None
    return sync_vaccination_statuses(reference_date=ref)
