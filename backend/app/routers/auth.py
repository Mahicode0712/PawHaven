from fastapi import APIRouter, Depends, Request, Response
from app.models import LoginRequest, RegisterRequest
from app.services.auth_service import (
    authenticate_and_create_session,
    get_current_user,
    logout_session,
    register_adopter_user,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", status_code=201)
def register(payload: RegisterRequest):
    user = register_adopter_user(payload)
    return {"message": "Registration successful. Please sign in.", "user": user}


@router.post("/login")
def login(request: Request, response: Response, payload: LoginRequest):
    return authenticate_and_create_session(request, response, payload)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_user),
):
    return logout_session(request, response, current_user)


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "user": {
            "user_id": current_user["user_id"],
            "full_name": current_user["full_name"],
            "email": current_user["email"],
            "role": current_user["role"],
            "is_active": current_user["is_active"],
            "adopter_id": current_user["adopter_id"],
            "created_at": current_user["created_at"],
            "updated_at": current_user["updated_at"],
        },
        "csrf_token": current_user["csrf_token"],
    }
