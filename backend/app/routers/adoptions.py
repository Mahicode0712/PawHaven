from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.database import db_read, db_transaction
from app.models import (
    AdopterCreate,
    AdopterSelfProfileUpdate,
    AdopterStatusUpdate,
    AdoptionApplicationCreate,
    AdoptionApplicationUpdate,
    AdoptionPlacementCreate,
    FollowUpComplete,
    FollowUpCreate,
)
from app.services.adoption_service import (
    advance_application_status,
    complete_followup,
    create_followup,
    finalize_adoption_placement,
    submit_adoption_application,
)
from app.services.auth_service import get_current_user, require_roles
from app.services.shelter_service import compute_smart_matches

router = APIRouter(prefix="/api/adoptions", tags=["Adoptions & Follow-ups"])


@router.get("/my-profile")
def get_my_adopter_profile(current_user: dict = Depends(get_current_user)):
    adopter_id = current_user.get("adopter_id")
    if adopter_id is None:
        raise HTTPException(status_code=404, detail="No adopter profile linked to your user account.")
    with db_read() as conn:
        row = conn.execute("SELECT * FROM adopters WHERE id = ?", (adopter_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Adopter profile not found.")
        return dict(row)


@router.patch("/my-profile")
def update_my_adopter_profile(
    payload: AdopterSelfProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    adopter_id = current_user.get("adopter_id")
    if adopter_id is None:
        raise HTTPException(status_code=404, detail="No adopter profile linked to your user account.")
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM adopters WHERE id = ?", (adopter_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Adopter profile not found.")
        conn.execute(
            """
            UPDATE adopters
            SET phone = ?, address = ?, housing_type = ?,
                has_yard = ?, has_other_pets = ?, has_children = ?
            WHERE id = ?
            """,
            (
                payload.phone if payload.phone is not None else row["phone"],
                payload.address if payload.address is not None else row["address"],
                payload.housing_type if payload.housing_type is not None else row["housing_type"],
                (1 if payload.has_yard else 0) if payload.has_yard is not None else row["has_yard"],
                (1 if payload.has_other_pets else 0) if payload.has_other_pets is not None else row["has_other_pets"],
                (1 if payload.has_children else 0) if payload.has_children is not None else row["has_children"],
                adopter_id,
            ),
        )
        return dict(conn.execute("SELECT * FROM adopters WHERE id = ?", (adopter_id,)).fetchone())


@router.get("/adopters")
def list_adopters(current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF"))):
    with db_read() as conn:
        rows = conn.execute(
            """
            SELECT ad.*,
                   COUNT(app.id) AS total_applications,
                   COUNT(CASE WHEN app.status = 'completed' THEN 1 END) AS completed_adoptions
            FROM adopters ad
            LEFT JOIN adoption_applications app ON app.adopter_id = ad.id
            GROUP BY ad.id
            ORDER BY ad.id DESC
            """
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/adopters", status_code=201)
def create_adopter(
    payload: AdopterCreate,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    with db_transaction() as conn:
        dup = conn.execute("SELECT id FROM adopters WHERE LOWER(email) = LOWER(?)", (payload.email,)).fetchone()
        if dup:
            raise HTTPException(status_code=409, detail=f"Adopter with email '{payload.email}' already exists.")
        cur = conn.execute(
            """
            INSERT INTO adopters (
                full_name, email, phone, address, housing_type,
                has_yard, has_other_pets, has_children, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
            """,
            (
                payload.full_name,
                payload.email,
                payload.phone,
                payload.address,
                payload.housing_type,
                1 if payload.has_yard else 0,
                1 if payload.has_other_pets else 0,
                1 if payload.has_children else 0,
            ),
        )
        return dict(conn.execute("SELECT * FROM adopters WHERE id = ?", (cur.lastrowid,)).fetchone())


@router.patch("/adopters/{adopter_id}/status")
def update_adopter_status(
    adopter_id: int,
    payload: AdopterStatusUpdate,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    with db_transaction() as conn:
        row = conn.execute("SELECT * FROM adopters WHERE id = ?", (adopter_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Adopter {adopter_id} not found.")
        conn.execute("UPDATE adopters SET status = ? WHERE id = ?", (payload.status, adopter_id))
        return dict(conn.execute("SELECT * FROM adopters WHERE id = ?", (adopter_id,)).fetchone())


@router.get("/matchmaking")
def get_smart_matchmaking(
    adopter_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == "ADOPTER":
        own_id = current_user.get("adopter_id")
        if adopter_id is not None and adopter_id != own_id:
            raise HTTPException(status_code=403, detail="Cannot view matchmaking scores for another adopter.")
        adopter_id = own_id
    return compute_smart_matches(adopter_id=adopter_id)


@router.get("/applications")
def list_applications(
    status: Optional[str] = Query(None),
    animal_id: Optional[int] = Query(None),
    adopter_id: Optional[int] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == "ADOPTER":
        own_id = current_user.get("adopter_id")
        if adopter_id is not None and adopter_id != own_id:
            raise HTTPException(status_code=403, detail="You may only view your own adoption applications.")
        adopter_id = own_id if own_id is not None else -1

    with db_read() as conn:
        query = """
            SELECT app.*, ad.full_name AS adopter_name, ad.email AS adopter_email,
                   ad.phone AS adopter_phone, ad.housing_type, ad.has_yard,
                   a.name AS animal_name, a.microchip_id, a.adoption_status AS animal_adoption_status,
                   b.name AS breed_name, s.name AS species_name,
                   p.id AS placement_id, p.certificate_number
            FROM adoption_applications app
            JOIN adopters ad ON ad.id = app.adopter_id
            JOIN animals a ON a.id = app.animal_id
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            LEFT JOIN adoption_placements p ON p.application_id = app.id
            WHERE 1=1
        """
        params = []
        if status:
            query += " AND app.status = ?"
            params.append(status)
        if animal_id is not None:
            query += " AND app.animal_id = ?"
            params.append(animal_id)
        if adopter_id is not None:
            query += " AND app.adopter_id = ?"
            params.append(adopter_id)
        query += " ORDER BY app.updated_at DESC, app.id DESC"
        return [dict(r) for r in conn.execute(query, tuple(params)).fetchall()]


@router.post("/applications", status_code=201)
def create_application(
    payload: AdoptionApplicationCreate,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == "ADOPTER":
        own_id = current_user.get("adopter_id")
        if own_id is None:
            raise HTTPException(status_code=400, detail="No adopter profile linked to your account.")
        if payload.adopter_id is not None and payload.adopter_id != own_id:
            raise HTTPException(status_code=403, detail="Cannot submit an application for another adopter.")
        payload = payload.model_copy(update={"adopter_id": own_id})
    elif payload.adopter_id is None:
        raise HTTPException(status_code=400, detail="adopter_id is required when submitting as staff or admin.")

    return submit_adoption_application(payload)


@router.patch("/applications/{application_id}/status")
def update_application_status(
    application_id: int,
    payload: AdoptionApplicationUpdate,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == "ADOPTER":
        own_id = current_user.get("adopter_id")
        with db_read() as conn:
            app_row = conn.execute(
                "SELECT adopter_id FROM adoption_applications WHERE id = ?", (application_id,)
            ).fetchone()
        if not app_row:
            raise HTTPException(status_code=404, detail=f"Application {application_id} not found.")
        if app_row["adopter_id"] != own_id:
            raise HTTPException(status_code=403, detail="You may only modify your own applications.")
        if payload.status != "withdrawn":
            raise HTTPException(status_code=403, detail="Adopters can only withdraw their own applications.")

    return advance_application_status(application_id, payload)


@router.post("/applications/{application_id}/finalize", status_code=201)
def finalize_application(
    application_id: int,
    payload: AdoptionPlacementCreate,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    return finalize_adoption_placement(application_id, payload)


@router.get("/placements")
def list_placements(current_user: dict = Depends(get_current_user)):
    with db_read() as conn:
        query = """
            SELECT p.*, app.application_code,
                   a.name AS animal_name, a.microchip_id, b.name AS breed_name, s.name AS species_name,
                   ad.full_name AS adopter_name, ad.email AS adopter_email, ad.phone AS adopter_phone
            FROM adoption_placements p
            JOIN adoption_applications app ON app.id = p.application_id
            JOIN animals a ON a.id = p.animal_id
            JOIN breeds b ON b.id = a.breed_id
            JOIN species s ON s.id = b.species_id
            JOIN adopters ad ON ad.id = p.adopter_id
        """
        params = []
        if current_user["role"] == "ADOPTER":
            query += " WHERE p.adopter_id = ?"
            params.append(current_user.get("adopter_id") or -1)
        query += " ORDER BY p.adoption_date DESC, p.id DESC"
        return [dict(r) for r in conn.execute(query, tuple(params)).fetchall()]


@router.get("/followups")
def list_followups(
    placement_id: Optional[int] = Query(None),
    wellbeing: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    with db_read() as conn:
        query = """
            SELECT f.*, p.certificate_number, p.adoption_date, p.adopter_id,
                   a.name AS animal_name, a.microchip_id,
                   ad.full_name AS adopter_name, ad.phone AS adopter_phone
            FROM post_adoption_followups f
            JOIN adoption_placements p ON p.id = f.placement_id
            JOIN animals a ON a.id = p.animal_id
            JOIN adopters ad ON ad.id = p.adopter_id
            WHERE 1=1
        """
        params = []
        if current_user["role"] == "ADOPTER":
            query += " AND p.adopter_id = ?"
            params.append(current_user.get("adopter_id") or -1)
        if placement_id is not None:
            query += " AND f.placement_id = ?"
            params.append(placement_id)
        if wellbeing:
            query += " AND f.animal_wellbeing = ?"
            params.append(wellbeing)
        query += " ORDER BY (f.completed_date IS NOT NULL) ASC, f.scheduled_date ASC"
        return [dict(r) for r in conn.execute(query, tuple(params)).fetchall()]


@router.post("/placements/{placement_id}/followups", status_code=201)
def add_followup(
    placement_id: int,
    payload: FollowUpCreate,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    return create_followup(placement_id, payload)


@router.patch("/followups/{followup_id}")
def update_followup(
    followup_id: int,
    payload: FollowUpComplete,
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    return complete_followup(followup_id, payload)
