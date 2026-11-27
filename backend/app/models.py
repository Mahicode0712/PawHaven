from typing import Literal, Optional
from pydantic import BaseModel, Field


# --- Auth & User Management Models ---

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=160)
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)
    phone: str = Field("Not provided", min_length=4, max_length=40)
    address: str = Field("Not provided", min_length=4, max_length=250)
    housing_type: Literal["house", "apartment", "farm", "condo"] = "apartment"
    has_yard: bool = False
    has_other_pets: bool = False
    has_children: bool = False
    # Explicit optional fields so privilege-escalation attempts are caught & rejected cleanly
    role: Optional[str] = None
    role_name: Optional[str] = None
    role_id: Optional[int] = None


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=160)
    password: str = Field(..., min_length=1, max_length=128)
    remember_me: bool = False


class AdminUserCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=160)
    password: str = Field(..., min_length=8, max_length=128)
    role_name: Literal["ADMIN", "SHELTER_STAFF", "ADOPTER"]


class AdminUserStatusUpdate(BaseModel):
    is_active: bool


class AdminUserRoleUpdate(BaseModel):
    role_name: Literal["ADMIN", "SHELTER_STAFF", "ADOPTER"]


class AdopterSelfProfileUpdate(BaseModel):
    phone: Optional[str] = Field(None, min_length=6, max_length=40)
    address: Optional[str] = Field(None, min_length=4, max_length=250)
    housing_type: Optional[Literal["house", "apartment", "farm", "condo"]] = None
    has_yard: Optional[bool] = None
    has_other_pets: Optional[bool] = None
    has_children: Optional[bool] = None


# --- Reference / Setup Models ---

class AdopterCreate(BaseModel):
    full_name: str = Field(..., min_length=2)
    email: str = Field(..., min_length=5)
    phone: str = Field(..., min_length=6)
    address: str = Field(..., min_length=4)
    housing_type: Literal["house", "apartment", "farm", "condo"]
    has_yard: bool = False
    has_other_pets: bool = False
    has_children: bool = False


class AdopterStatusUpdate(BaseModel):
    status: Literal["active", "restricted"]


# --- Intake & Animal Models ---

class IntakeAndAnimalCreate(BaseModel):
    source_type: Literal["stray", "owner_surrender", "transfer", "rescue"]
    source_name: str = Field(..., min_length=2)
    intake_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    intake_condition: Literal["healthy", "minor_injury", "critical", "malnourished"]
    intake_notes: Optional[str] = None

    name: str = Field(..., min_length=1)
    breed_id: int = Field(..., gt=0)
    zone_id: int = Field(..., gt=0)
    gender: Literal["male", "female", "unknown"]
    age_months: int = Field(..., ge=0)
    weight_kg: float = Field(..., gt=0)
    spayed_neutered: bool = False
    good_with_kids: bool = True
    good_with_pets: bool = True
    animal_notes: Optional[str] = None


class AnimalEditUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    age_months: Optional[int] = Field(None, ge=0)
    weight_kg: Optional[float] = Field(None, gt=0)
    spayed_neutered: Optional[bool] = None
    good_with_kids: Optional[bool] = None
    good_with_pets: Optional[bool] = None
    notes: Optional[str] = None


class AnimalZoneMove(BaseModel):
    zone_id: int = Field(..., gt=0)


class AnimalStatusUpdate(BaseModel):
    medical_status: Optional[Literal["quarantine", "treatment", "cleared", "critical"]] = None
    adoption_status: Optional[Literal["available", "pending_adoption", "adopted", "medical_hold", "deceased"]] = None
    spayed_neutered: Optional[bool] = None
    notes: Optional[str] = None


# --- Medical & Vaccination Models ---

class MedicalRecordCreate(BaseModel):
    animal_id: int = Field(..., gt=0)
    visit_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    record_type: Literal["intake_exam", "treatment", "surgery", "checkup", "emergency"]
    diagnosis: str = Field(..., min_length=2)
    treatment_notes: str = Field(..., min_length=2)
    vet_name: str = Field(..., min_length=2)
    cleared_for_adoption: bool = False
    update_medical_status: Optional[Literal["quarantine", "treatment", "cleared", "critical"]] = None


class VaccinationCreate(BaseModel):
    animal_id: int = Field(..., gt=0)
    vaccine_type_id: int = Field(..., gt=0)
    administered_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    batch_number: str = Field(..., min_length=2)
    administered_by: str = Field(..., min_length=2)


# --- Adoption Workflow & Follow-Up Models ---

class AdoptionApplicationCreate(BaseModel):
    adopter_id: Optional[int] = Field(None, gt=0)
    animal_id: int = Field(..., gt=0)
    reviewer_notes: Optional[str] = None


class AdoptionApplicationUpdate(BaseModel):
    status: Literal["submitted", "under_review", "home_check", "approved", "rejected", "withdrawn"]
    home_check_passed: Optional[bool] = None
    reviewer_notes: Optional[str] = None


class AdoptionPlacementCreate(BaseModel):
    adoption_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    adoption_fee: float = Field(0.0, ge=0)
    issued_by: str = Field(..., min_length=2)


class FollowUpCreate(BaseModel):
    scheduled_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    followup_type: Literal["7_day_check", "30_day_check", "90_day_check", "home_visit", "vet_followup"]
    notes: Optional[str] = None


class FollowUpComplete(BaseModel):
    completed_date: Optional[str] = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    animal_wellbeing: Literal["thriving", "adjusting", "needs_support", "returned"]
    notes: str = Field(..., min_length=2)
    conducted_by: str = Field(..., min_length=2)
