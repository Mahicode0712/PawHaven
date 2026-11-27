from fastapi import APIRouter, Depends
from app.models import AdminUserCreate, AdminUserRoleUpdate, AdminUserStatusUpdate
from app.services.auth_service import (
    create_user_by_admin,
    list_all_users,
    require_roles,
    update_user_role,
    update_user_status,
)

router = APIRouter(prefix="/api/admin", tags=["Admin User Management"])


@router.get("/users")
def get_users(current_user: dict = Depends(require_roles("ADMIN"))):
    return list_all_users()


@router.post("/users", status_code=201)
def create_user(
    payload: AdminUserCreate,
    current_user: dict = Depends(require_roles("ADMIN")),
):
    return create_user_by_admin(payload)


@router.patch("/users/{user_id}/status")
def patch_user_status(
    user_id: int,
    payload: AdminUserStatusUpdate,
    current_user: dict = Depends(require_roles("ADMIN")),
):
    return update_user_status(user_id, payload.is_active, current_user["user_id"])


@router.patch("/users/{user_id}/role")
def patch_user_role(
    user_id: int,
    payload: AdminUserRoleUpdate,
    current_user: dict = Depends(require_roles("ADMIN")),
):
    return update_user_role(user_id, payload.role_name, current_user["user_id"])
