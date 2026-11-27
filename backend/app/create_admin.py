"""Secure CLI utility to create the initial ADMIN account.

Reads credentials from environment variables (ADMIN_FULL_NAME, ADMIN_EMAIL, ADMIN_PASSWORD)
or prompts interactively via stdin/getpass. Never hardcodes credentials.
"""

import getpass
import os
import sys

from app.database import db_transaction, init_db
from app.services.auth_service import (
    hash_password,
    validate_email,
    validate_password_strength,
)


def create_initial_admin() -> None:
    init_db(seed=True)

    full_name = os.environ.get("ADMIN_FULL_NAME") or input("Admin Full Name: ").strip()
    email_raw = os.environ.get("ADMIN_EMAIL") or input("Admin Email: ").strip()
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Admin Password: ")
    if not os.environ.get("ADMIN_PASSWORD"):
        confirm = getpass.getpass("Confirm Admin Password: ")
        if password != confirm:
            print("Error: Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    email = validate_email(email_raw)
    validate_password_strength(password)
    pw_hash = hash_password(password)

    with db_transaction() as conn:
        role = conn.execute("SELECT role_id FROM roles WHERE role_name = 'ADMIN'").fetchone()
        if not role:
            print("Error: ADMIN role missing.", file=sys.stderr)
            sys.exit(1)

        existing = conn.execute(
            "SELECT user_id FROM users WHERE LOWER(email) = LOWER(?)", (email,)
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE users
                SET full_name = ?, password_hash = ?, role_id = ?, is_active = 1, updated_at = datetime('now')
                WHERE user_id = ?
                """,
                (full_name, pw_hash, role["role_id"], existing["user_id"]),
            )
            print(f"Updated existing user '{email}' to active ADMIN.")
        else:
            conn.execute(
                """
                INSERT INTO users (full_name, email, password_hash, role_id, is_active)
                VALUES (?, ?, ?, ?, 1)
                """,
                (full_name, email, pw_hash, role["role_id"]),
            )
            print(f"Created initial ADMIN account for '{email}'.")


if __name__ == "__main__":
    create_initial_admin()
