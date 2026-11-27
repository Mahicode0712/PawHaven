from fastapi import APIRouter, Depends, HTTPException
from app.database import db_read, db_transaction
from app.services.auth_service import require_roles
from app.services.shelter_service import sync_vaccination_statuses_conn, today_date

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("")
def get_dashboard(current_user: dict = Depends(require_roles("ADMIN", "SHELTER_STAFF"))):
    ref = today_date().isoformat()
    with db_transaction() as conn:
        sync_vaccination_statuses_conn(conn)

        counts = conn.execute(
            """
            SELECT
                COUNT(CASE WHEN adoption_status NOT IN ('adopted', 'deceased') THEN 1 END) AS total_in_shelter,
                COUNT(CASE WHEN adoption_status = 'available' THEN 1 END) AS available_for_adoption,
                COUNT(CASE WHEN adoption_status = 'pending_adoption' THEN 1 END) AS pending_adoption,
                COUNT(CASE WHEN adoption_status = 'medical_hold' THEN 1 END) AS medical_hold,
                COUNT(CASE WHEN adoption_status = 'adopted' THEN 1 END) AS total_adopted,
                COUNT(CASE WHEN medical_status = 'quarantine' AND adoption_status != 'adopted' THEN 1 END) AS in_quarantine
            FROM animals
            """
        ).fetchone()

        cap = conn.execute("SELECT SUM(max_capacity) AS total_capacity FROM shelter_zones").fetchone()
        pending_apps = conn.execute(
            "SELECT COUNT(*) FROM adoption_applications WHERE status IN ('submitted', 'under_review', 'home_check', 'approved')"
        ).fetchone()[0]
        overdue_vax = conn.execute(
            """
            SELECT COUNT(*) FROM vaccination_records vr
            JOIN animals a ON a.id = vr.animal_id
            WHERE vr.status = 'overdue' AND a.adoption_status NOT IN ('adopted', 'deceased')
            """
        ).fetchone()[0]
        due_soon_vax = conn.execute(
            """
            SELECT COUNT(*) FROM vaccination_records vr
            JOIN animals a ON a.id = vr.animal_id
            WHERE vr.status = 'due_soon' AND a.adoption_status NOT IN ('adopted', 'deceased')
            """
        ).fetchone()[0]
        pending_followups = conn.execute(
            "SELECT COUNT(*) FROM post_adoption_followups WHERE animal_wellbeing = 'pending'"
        ).fetchone()[0]

        zone_alerts = [
            dict(r)
            for r in conn.execute(
                """
                SELECT z.id, z.zone_code, z.zone_name, z.max_capacity, z.care_level,
                       s.name AS species_name,
                       COUNT(CASE WHEN a.adoption_status NOT IN ('adopted', 'deceased') THEN 1 END) AS occupied
                FROM shelter_zones z
                JOIN species s ON s.id = z.species_id
                LEFT JOIN animals a ON a.zone_id = z.id
                GROUP BY z.id
                ORDER BY (CAST(occupied AS FLOAT) / z.max_capacity) DESC
                """
            ).fetchall()
        ]

        recent_applications = [
            dict(r)
            for r in conn.execute(
                """
                SELECT app.id, app.application_code, app.status, app.submitted_at,
                       ad.full_name AS adopter_name, a.name AS animal_name, a.microchip_id
                FROM adoption_applications app
                JOIN adopters ad ON ad.id = app.adopter_id
                JOIN animals a ON a.id = app.animal_id
                ORDER BY app.updated_at DESC, app.id DESC
                LIMIT 5
                """
            ).fetchall()
        ]

        due_followups = [
            dict(r)
            for r in conn.execute(
                """
                SELECT f.id, f.scheduled_date, f.followup_type, f.animal_wellbeing,
                       p.certificate_number, a.name AS animal_name, ad.full_name AS adopter_name
                FROM post_adoption_followups f
                JOIN adoption_placements p ON p.id = f.placement_id
                JOIN animals a ON a.id = p.animal_id
                JOIN adopters ad ON ad.id = p.adopter_id
                WHERE f.animal_wellbeing = 'pending'
                ORDER BY f.scheduled_date ASC
                LIMIT 5
                """
            ).fetchall()
        ]

        total_cap = cap["total_capacity"] or 0
        total_in = counts["total_in_shelter"] or 0
        occupancy_pct = round((total_in / total_cap) * 100, 1) if total_cap else 0.0

        return {
            "reference_date": ref,
            "kpis": {
                **dict(counts),
                "total_capacity": total_cap,
                "occupancy_pct": occupancy_pct,
                "pending_applications": pending_apps,
                "overdue_vaccines": overdue_vax,
                "due_soon_vaccines": due_soon_vax,
                "pending_followups": pending_followups,
            },
            "zone_occupancy": zone_alerts,
            "recent_applications": recent_applications,
            "upcoming_followups": due_followups,
        }


@router.get("/adopter")
def get_adopter_dashboard(current_user: dict = Depends(require_roles("ADOPTER", "ADMIN", "SHELTER_STAFF"))):
    adopter_id = current_user.get("adopter_id")
    if adopter_id is None:
        raise HTTPException(status_code=404, detail="No adopter profile linked to this account.")

    with db_read() as conn:
        available_pets = conn.execute(
            "SELECT COUNT(*) FROM animals WHERE adoption_status IN ('available', 'pending_adoption')"
        ).fetchone()[0]
        my_apps = [
            dict(r)
            for r in conn.execute(
                """
                SELECT app.*, a.name AS animal_name, a.microchip_id, b.name AS breed_name, s.name AS species_name
                FROM adoption_applications app
                JOIN animals a ON a.id = app.animal_id
                JOIN breeds b ON b.id = a.breed_id
                JOIN species s ON s.id = b.species_id
                WHERE app.adopter_id = ?
                ORDER BY app.updated_at DESC, app.id DESC
                """,
                (adopter_id,),
            ).fetchall()
        ]
        my_placements = [
            dict(r)
            for r in conn.execute(
                """
                SELECT p.*, a.name AS animal_name, a.microchip_id, b.name AS breed_name, s.name AS species_name
                FROM adoption_placements p
                JOIN animals a ON a.id = p.animal_id
                JOIN breeds b ON b.id = a.breed_id
                JOIN species s ON s.id = b.species_id
                WHERE p.adopter_id = ?
                ORDER BY p.adoption_date DESC
                """,
                (adopter_id,),
            ).fetchall()
        ]
        my_followups = [
            dict(r)
            for r in conn.execute(
                """
                SELECT f.*, p.certificate_number, a.name AS animal_name
                FROM post_adoption_followups f
                JOIN adoption_placements p ON p.id = f.placement_id
                JOIN animals a ON a.id = p.animal_id
                WHERE p.adopter_id = ?
                ORDER BY (f.completed_date IS NOT NULL) ASC, f.scheduled_date ASC
                """,
                (adopter_id,),
            ).fetchall()
        ]

        return {
            "kpis": {
                "available_pets": available_pets,
                "active_applications": sum(1 for a in my_apps if a["status"] in ("submitted", "under_review", "home_check", "approved")),
                "completed_adoptions": len(my_placements),
                "pending_followups": sum(1 for f in my_followups if f["animal_wellbeing"] == "pending"),
            },
            "applications": my_apps,
            "placements": my_placements,
            "followups": my_followups,
        }
