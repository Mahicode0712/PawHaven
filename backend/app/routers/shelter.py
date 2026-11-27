from fastapi import APIRouter, Depends
from app.database import db_read
from app.services.auth_service import get_current_user, require_roles

router = APIRouter(prefix="/api/shelter", tags=["Shelter & Reference"])


@router.get("/metadata")
def get_shelter_metadata(current_user: dict = Depends(get_current_user)):
    with db_read() as conn:
        species = [dict(r) for r in conn.execute("SELECT * FROM species ORDER BY id").fetchall()]
        breeds = [
            dict(r)
            for r in conn.execute(
                """
                SELECT b.*, s.name AS species_name
                FROM breeds b
                JOIN species s ON s.id = b.species_id
                ORDER BY s.name, b.name
                """
            ).fetchall()
        ]
        vaccine_types = [
            dict(r)
            for r in conn.execute(
                """
                SELECT vt.*, s.name AS species_name
                FROM vaccine_types vt
                JOIN species s ON s.id = vt.species_id
                ORDER BY s.name, vt.is_mandatory DESC, vt.vaccine_name
                """
            ).fetchall()
        ]
        return {"species": species, "breeds": breeds, "vaccine_types": vaccine_types}


@router.get("/zones")
def list_shelter_zones(current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF"))):
    with db_read() as conn:
        rows = conn.execute(
            """
            SELECT z.*, s.name AS species_name,
                   COUNT(CASE WHEN a.adoption_status NOT IN ('adopted', 'deceased') THEN 1 END) AS occupied_slots
            FROM shelter_zones z
            JOIN species s ON s.id = z.species_id
            LEFT JOIN animals a ON a.zone_id = z.id
            GROUP BY z.id
            ORDER BY z.zone_code
            """
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["available_slots"] = max(0, d["max_capacity"] - d["occupied_slots"])
            d["occupancy_pct"] = round((d["occupied_slots"] / d["max_capacity"]) * 100, 1)
            result.append(d)
        return result
