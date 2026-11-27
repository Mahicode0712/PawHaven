import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = BASE_DIR.parent / "shelter.db"


def get_db_path() -> Path:
    env_path = os.environ.get("SHELTER_DB_PATH")
    return Path(env_path) if env_path else DEFAULT_DB_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(get_db_path()), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def db_transaction():
    """Atomic write transaction using BEGIN IMMEDIATE to prevent race conditions."""
    conn = get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE;")
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@contextmanager
def db_read():
    """Read-only connection helper with foreign keys enabled."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def _apply_safe_migrations(conn: sqlite3.Connection) -> None:
    """Backward-compatible schema migrations for existing SQLite databases."""
    adopter_cols = {
        row["name"] for row in conn.execute("PRAGMA table_info(adopters)").fetchall()
    }
    if "user_id" not in adopter_cols:
        conn.execute(
            "ALTER TABLE adopters ADD COLUMN user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL"
        )

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_adopters_user_id ON adopters(user_id) WHERE user_id IS NOT NULL"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_apps_adopter_id ON adoption_applications(adopter_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_apps_animal_id ON adoption_applications(animal_id)")

    for role_name in ("ADMIN", "SHELTER_STAFF", "ADOPTER"):
        conn.execute("INSERT OR IGNORE INTO roles (role_name) VALUES (?)", (role_name,))


def init_db(seed: bool = True) -> None:
    """Initialize 3NF schema, apply safe migrations, and load sample seed data if empty."""
    schema_sql = (BASE_DIR / "schema.sql").read_text(encoding="utf-8")
    seed_sql = (BASE_DIR / "seed.sql").read_text(encoding="utf-8")

    with db_transaction() as conn:
        conn.executescript(schema_sql)

    with db_transaction() as conn:
        _apply_safe_migrations(conn)

    if seed:
        with db_transaction() as conn:
            count = conn.execute("SELECT COUNT(*) FROM species").fetchone()[0]
            if count == 0:
                conn.executescript(seed_sql)
