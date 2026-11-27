from fastapi import APIRouter, Depends, HTTPException
from app.services.auth_service import get_current_user, require_roles
from app.services.report_service import (
    get_adoption_certificate,
    get_animal_health_report,
    get_shelter_occupancy_report,
)

router = APIRouter(prefix="/api/reports", tags=["Reports & Certificates"])


@router.get("/certificates/{placement_id}")
def adoption_certificate(
    placement_id: int,
    current_user: dict = Depends(get_current_user),
):
    cert = get_adoption_certificate(placement_id)
    if current_user["role"] == "ADOPTER":
        if cert["adopter_id"] != current_user.get("adopter_id"):
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to view another adopter's certificate.",
            )
    return cert


@router.get("/occupancy")
def shelter_occupancy_report(
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    return get_shelter_occupancy_report()


@router.get("/health")
def animal_health_report(
    current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF")),
):
    return get_animal_health_report()
