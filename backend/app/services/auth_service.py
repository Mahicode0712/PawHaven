import os
import re
import secrets
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, Response

from app.database import db_read, db_transaction

SESSION_COOKIE_NAME = "pawhaven_session"
CSRF_COOKIE_NAME = "pawhaven_csrf"
_EPHEMERAL_SECRET = secrets.token_urlsafe(48)

LOGIN_WINDOW_SECONDS = 60
LOGIN_MAX_ATTEMPTS = 5
_rate_limit_lock = threading.Lock()
_failed_login_attempts: dict[tuple[str, str], list[float]] = defaultdict(list)

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def get_jwt_secret() -> str:
    return os.environ.get("APP_SECRET_KEY") or _EPHEMERAL_SECRET


def is_cookie_secure() -> bool:
    return os.environ.get("COOKIE_SECURE", "false").lower() == "true"


def clear_login_rate_limits() -> None:
    with _rate_limit_lock:
        _failed_login_attempts.clear()


def _check_rate_limit(client_ip: str, email: str) -> None:
    now = time.monotonic()
    key = (client_ip, email.lower())
    with _rate_limit_lock:
        recent = [ts for ts in _failed_login_attempts[key] if now - ts < LOGIN_WINDOW_SECONDS]
        _failed_login_attempts[key] = recent
        if len(recent) >= LOGIN_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=429,
                detail="Too many failed login attempts. Please wait a minute before trying again.",
            )


def _record_failed_attempt(client_ip: str, email: str) -> None:
    key = (client_ip, email.lower())
    with _rate_limit_lock:
        _failed_login_attempts[key].append(time.monotonic())


def _reset_failed_attempts(client_ip: str, email: str) -> None:
    key = (client_ip, email.lower())
    with _rate_limit_lock:
        _failed_login_attempts.pop(key, None)


def validate_email(email: str) -> str:
    cleaned = email.strip().lower()
    if not EMAIL_REGEX.match(cleaned):
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    return cleaned


def validate_password_strength(password: str) -> None:
    errors = []
    if len(password) < 8:
        errors.append("at least 8 characters")
    if not re.search(r"[A-Z]", password):
        errors.append("one uppercase letter")
    if not re.search(r"[a-z]", password):
        errors.append("one lowercase letter")
    if not re.search(r"\d", password):
        errors.append("one digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        errors.append("one special character")
    if errors:
        raise HTTPException(
            status_code=400,
            detail="Password must contain " + ", ".join(errors) + ".",
        )


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _sanitize_user(row) -> dict:
    return {
        "user_id": row["user_id"],
        "full_name": row["full_name"],
        "email": row["email"],
        "role": row["role_name"],
        "is_active": bool(row["is_active"]),
        "adopter_id": row["adopter_id"] if "adopter_id" in row.keys() else None,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def register_adopter_user(payload) -> dict:
    # Block public attempts to specify privileged roles
    for candidate in (payload.role, payload.role_name):
        if candidate is not None and candidate.strip().upper() != "ADOPTER":
            raise HTTPException(
                status_code=403,
                detail="Public registration is restricted to ADOPTER accounts only.",
            )
    if payload.role_id is not None:
        raise HTTPException(
            status_code=403,
            detail="Public registration cannot assign role_id directly.",
        )

    email = validate_email(payload.email)
    full_name = payload.full_name.strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=400, detail="Full name must be at least 2 characters.")
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Password and confirm password do not match.")
    validate_password_strength(payload.password)

    pw_hash = hash_password(payload.password)

    with db_transaction() as conn:
        existing_user = conn.execute(
            "SELECT user_id FROM users WHERE LOWER(email) = LOWER(?)", (email,)
        ).fetchone()
        existing_adopter = conn.execute(
            "SELECT id FROM adopters WHERE LOWER(email) = LOWER(?)", (email,)
        ).fetchone()
        if existing_user or existing_adopter:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")

        role_row = conn.execute("SELECT role_id FROM roles WHERE role_name = 'ADOPTER'").fetchone()
        if not role_row:
            raise HTTPException(status_code=500, detail="ADOPTER role is not configured.")

        cur_user = conn.execute(
            """
            INSERT INTO users (full_name, email, password_hash, role_id, is_active)
            VALUES (?, ?, ?, ?, 1)
            """,
            (full_name, email, pw_hash, role_row["role_id"]),
        )
        user_id = cur_user.lastrowid

        conn.execute(
            """
            INSERT INTO adopters (
                user_id, full_name, email, phone, address, housing_type,
                has_yard, has_other_pets, has_children, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            """,
            (
                user_id,
                full_name,
                email,
                payload.phone.strip(),
                payload.address.strip(),
                payload.housing_type,
                1 if payload.has_yard else 0,
                1 if payload.has_other_pets else 0,
                1 if payload.has_children else 0,
            ),
        )

        created = conn.execute(
            """
            SELECT u.user_id, u.full_name, u.email, u.is_active, u.created_at, u.updated_at,
                   r.role_name, ad.id AS adopter_id
            FROM users u
            JOIN roles r ON r.role_id = u.role_id
            LEFT JOIN adopters ad ON ad.user_id = u.user_id
            WHERE u.user_id = ?
            """,
            (user_id,),
        ).fetchone()
        return _sanitize_user(created)


def authenticate_and_create_session(request: Request, response: Response, payload) -> dict:
    client_ip = request.client.host if request.client else "unknown"
    email = payload.email.strip().lower()
    _check_rate_limit(client_ip, email)

    with db_transaction() as conn:
        user = conn.execute(
            """
            SELECT u.user_id, u.full_name, u.email, u.password_hash, u.is_active,
                   u.created_at, u.updated_at, r.role_name, ad.id AS adopter_id
            FROM users u
            JOIN roles r ON r.role_id = u.role_id
            LEFT JOIN adopters ad ON ad.user_id = u.user_id
            WHERE LOWER(u.email) = LOWER(?)
            """,
            (email,),
        ).fetchone()

        if not user or not verify_password(payload.password, user["password_hash"]):
            _record_failed_attempt(client_ip, email)
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        if not user["is_active"]:
            _record_failed_attempt(client_ip, email)
            raise HTTPException(
                status_code=403,
                detail="This account has been deactivated. Contact an administrator.",
            )

        _reset_failed_attempts(client_ip, email)

        ttl_seconds = 7 * 24 * 3600 if payload.remember_me else 12 * 3600
        now_utc = datetime.now(timezone.utc)
        expires_dt = now_utc + timedelta(seconds=ttl_seconds)
        session_id = secrets.token_urlsafe(32)
        csrf_token = secrets.token_urlsafe(32)

        conn.execute(
            """
            INSERT INTO user_sessions (session_id, user_id, csrf_token, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (session_id, user["user_id"], csrf_token, expires_dt.isoformat()),
        )

        token_payload = {
            "sid": session_id,
            "sub": str(user["user_id"]),
            "role": user["role_name"],
            "exp": int(expires_dt.timestamp()),
        }
        jwt_token = jwt.encode(token_payload, get_jwt_secret(), algorithm="HS256")

    secure_flag = is_cookie_secure()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=jwt_token,
        httponly=True,
        samesite="lax",
        secure=secure_flag,
        max_age=ttl_seconds,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        samesite="lax",
        secure=secure_flag,
        max_age=ttl_seconds,
        path="/",
    )

    return {
        "user": _sanitize_user(user),
        "csrf_token": csrf_token,
        "expires_at": expires_dt.isoformat(),
    }


def logout_session(request: Request, response: Response, current_user: dict) -> dict:
    with db_transaction() as conn:
        conn.execute(
            "UPDATE user_sessions SET revoked_at = datetime('now') WHERE session_id = ?",
            (current_user["session_id"],),
        )
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(key=CSRF_COOKIE_NAME, path="/")
    return {"message": "Logged out successfully."}


def get_current_user(request: Request) -> dict:
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not raw_token:
        raise HTTPException(status_code=401, detail="Authentication required.")

    try:
        claims = jwt.decode(raw_token, get_jwt_secret(), algorithms=["HS256"])
        session_id = claims.get("sid")
        user_id = int(claims.get("sub"))
    except (jwt.PyJWTError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired session.") from exc

    with db_read() as conn:
        row = conn.execute(
            """
            SELECT s.session_id, s.csrf_token, s.expires_at, s.revoked_at,
                   u.user_id, u.full_name, u.email, u.is_active, u.created_at, u.updated_at,
                   r.role_name, ad.id AS adopter_id
            FROM user_sessions s
            JOIN users u ON u.user_id = s.user_id
            JOIN roles r ON r.role_id = u.role_id
            LEFT JOIN adopters ad ON ad.user_id = u.user_id
            WHERE s.session_id = ? AND u.user_id = ?
            """,
            (session_id, user_id),
        ).fetchone()

    if not row or row["revoked_at"] is not None:
        raise HTTPException(status_code=401, detail="Session has been invalidated.")

    try:
        exp_dt = datetime.fromisoformat(row["expires_at"])
        if exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid session expiration.") from exc

    if exp_dt <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session has expired. Please log in again.")

    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated.")

    # Enforce CSRF protection on cookie-authenticated state-changing requests
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        header_csrf = request.headers.get("X-CSRF-Token")
        if not header_csrf or not secrets.compare_digest(header_csrf, row["csrf_token"]):
            raise HTTPException(status_code=403, detail="Missing or invalid CSRF token.")

    user_info = _sanitize_user(row)
    user_info["session_id"] = row["session_id"]
    user_info["csrf_token"] = row["csrf_token"]
    return user_info


def require_roles(*allowed_roles: str) -> Callable:
    def dependency(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action.",
            )
        return current_user

    return dependency


# --- Admin User Management Helpers ---

def list_all_users() -> list[dict]:
    with db_read() as conn:
        rows = conn.execute(
            """
            SELECT u.user_id, u.full_name, u.email, u.is_active, u.created_at, u.updated_at,
                   r.role_name, ad.id AS adopter_id
            FROM users u
            JOIN roles r ON r.role_id = u.role_id
            LEFT JOIN adopters ad ON ad.user_id = u.user_id
            ORDER BY u.user_id DESC
            """
        ).fetchall()
        return [_sanitize_user(r) for r in rows]


def create_user_by_admin(payload) -> dict:
    email = validate_email(payload.email)
    full_name = payload.full_name.strip()
    validate_password_strength(payload.password)
    pw_hash = hash_password(payload.password)

    with db_transaction() as conn:
        if conn.execute("SELECT user_id FROM users WHERE LOWER(email) = LOWER(?)", (email,)).fetchone():
            raise HTTPException(status_code=409, detail="A user with this email already exists.")

        role_row = conn.execute(
            "SELECT role_id FROM roles WHERE role_name = ?", (payload.role_name,)
        ).fetchone()
        if not role_row:
            raise HTTPException(status_code=400, detail=f"Invalid role '{payload.role_name}'.")

        cur = conn.execute(
            """
            INSERT INTO users (full_name, email, password_hash, role_id, is_active)
            VALUES (?, ?, ?, ?, 1)
            """,
            (full_name, email, pw_hash, role_row["role_id"]),
        )
        user_id = cur.lastrowid

        if payload.role_name == "ADOPTER":
            existing_adopter = conn.execute(
                "SELECT id FROM adopters WHERE LOWER(email) = LOWER(?)", (email,)
            ).fetchone()
            if not existing_adopter:
                conn.execute(
                    """
                    INSERT INTO adopters (
                        user_id, full_name, email, phone, address, housing_type, status
                    )
                    VALUES (?, ?, ?, 'Not provided', 'Not provided', 'apartment', 'active')
                    """,
                    (user_id, full_name, email),
                )

        row = conn.execute(
            """
            SELECT u.user_id, u.full_name, u.email, u.is_active, u.created_at, u.updated_at,
                   r.role_name, ad.id AS adopter_id
            FROM users u
            JOIN roles r ON r.role_id = u.role_id
            LEFT JOIN adopters ad ON ad.user_id = u.user_id
            WHERE u.user_id = ?
            """,
            (user_id,),
        ).fetchone()
        return _sanitize_user(row)


def update_user_status(target_user_id: int, is_active: bool, acting_admin_id: int) -> dict:
    if target_user_id == acting_admin_id and not is_active:
        raise HTTPException(status_code=400, detail="Administrators cannot deactivate their own account.")

    with db_transaction() as conn:
        row = conn.execute("SELECT user_id FROM users WHERE user_id = ?", (target_user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"User {target_user_id} not found.")

        conn.execute(
            "UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE user_id = ?",
            (1 if is_active else 0, target_user_id),
        )
        if not is_active:
            conn.execute(
                "UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL",
                (target_user_id,),
            )

        updated = conn.execute(
            """
            SELECT u.user_id, u.full_name, u.email, u.is_active, u.created_at, u.updated_at,
                   r.role_name, ad.id AS adopter_id
            FROM users u
            JOIN roles r ON r.role_id = u.role_id
            LEFT JOIN adopters ad ON ad.user_id = u.user_id
            WHERE u.user_id = ?
            """,
            (target_user_id,),
        ).fetchone()
        return _sanitize_user(updated)


def update_user_role(target_user_id: int, role_name: str, acting_admin_id: int) -> dict:
    if target_user_id == acting_admin_id and role_name != "ADMIN":
        raise HTTPException(status_code=400, detail="Administrators cannot demote their own role.")

    with db_transaction() as conn:
        user = conn.execute("SELECT * FROM users WHERE user_id = ?", (target_user_id,)).fetchone()
        if not user:
            raise HTTPException(status_code=404, detail=f"User {target_user_id} not found.")

        role_row = conn.execute("SELECT role_id FROM roles WHERE role_name = ?", (role_name,)).fetchone()
        if not role_row:
            raise HTTPException(status_code=400, detail=f"Role '{role_name}' not found.")

        conn.execute(
            "UPDATE users SET role_id = ?, updated_at = datetime('now') WHERE user_id = ?",
            (role_row["role_id"], target_user_id),
        )

        # Ensure linked adopter profile exists if promoted/changed to ADOPTER
        if role_name == "ADOPTER":
            linked = conn.execute(
                "SELECT id FROM adopters WHERE user_id = ?", (target_user_id,)
            ).fetchone()
            if not linked:
                by_email = conn.execute(
                    "SELECT id FROM adopters WHERE LOWER(email) = LOWER(?)", (user["email"],)
                ).fetchone()
                if by_email:
                    conn.execute(
                        "UPDATE adopters SET user_id = ? WHERE id = ?", (target_user_id, by_email["id"])
                    )
                else:
                    conn.execute(
                        """
                        INSERT INTO adopters (user_id, full_name, email, phone, address, housing_type, status)
                        VALUES (?, ?, ?, 'Not provided', 'Not provided', 'apartment', 'active')
                        """,
                        (target_user_id, user["full_name"], user["email"]),
                    )

        updated = conn.execute(
            """
            SELECT u.user_id, u.full_name, u.email, u.is_active, u.created_at, u.updated_at,
                   r.role_name, ad.id AS adopter_id
            FROM users u
            JOIN roles r ON r.role_id = u.role_id
            LEFT JOIN adopters ad ON ad.user_id = u.user_id
            WHERE u.user_id = ?
            """,
            (target_user_id,),
        ).fetchone()
        return _sanitize_user(updated)
