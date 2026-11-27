import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from app.create_admin import create_initial_admin
from app.database import get_connection, init_db
from app.main import app
from app.services.auth_service import clear_login_rate_limits


class PetAdoptionShelterTests(unittest.TestCase):
    def setUp(self):
        clear_login_rate_limits()
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test_shelter.db"
        os.environ["SHELTER_DB_PATH"] = str(self.db_path)
        os.environ["ADMIN_FULL_NAME"] = "Test Shelter Admin"
        os.environ["ADMIN_EMAIL"] = "admin.test@pawhaven.local"
        os.environ["ADMIN_PASSWORD"] = "AdminPass!2026"
        create_initial_admin()

        self.client = TestClient(app)
        login_resp = self.client.post(
            "/api/auth/login",
            json={"email": "admin.test@pawhaven.local", "password": "AdminPass!2026"},
        )
        self.assertEqual(login_resp.status_code, 200)
        self.csrf_headers = {"X-CSRF-Token": login_resp.json()["csrf_token"]}

    def tearDown(self):
        self.client.close()
        for var in ("SHELTER_DB_PATH", "ADMIN_FULL_NAME", "ADMIN_EMAIL", "ADMIN_PASSWORD"):
            os.environ.pop(var, None)
        self.tmp_dir.cleanup()

    def test_1_schema_seed_and_unique_constraints(self):
        conn = get_connection()
        try:
            tables = {
                r[0]
                for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                ).fetchall()
            }
            expected_tables = {
                "roles",
                "users",
                "user_sessions",
                "species",
                "breeds",
                "vaccine_types",
                "shelter_zones",
                "adopters",
                "intake_records",
                "animals",
                "medical_records",
                "vaccination_records",
                "adoption_applications",
                "adoption_placements",
                "post_adoption_followups",
            }
            self.assertTrue(expected_tables.issubset(tables))

            animal_count = conn.execute("SELECT COUNT(*) FROM animals").fetchone()[0]
            self.assertGreaterEqual(animal_count, 8)

            # Verify DB-level UNIQUE(animal_id) constraint blocks double adoption
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    """
                    INSERT INTO adoption_placements
                    (certificate_number, application_id, animal_id, adopter_id, adoption_date, adoption_fee, issued_by)
                    VALUES ('CERT-DUP-1', 3, 7, 1, '2026-11-27', 0, 'Tester')
                    """
                )
        finally:
            conn.close()

    def test_2_business_rules_quarantine_cooldown_and_capacity(self):
        # 2a. Quarantine rule: Rocky (id=6) is in quarantine until 2026-12-06
        clear_resp = self.client.post(
            "/api/medical/records",
            headers=self.csrf_headers,
            json={
                "animal_id": 6,
                "visit_date": "2026-11-27",
                "record_type": "checkup",
                "diagnosis": "Looks fine",
                "treatment_notes": "Attempt early clearance",
                "vet_name": "Dr. Ananya Rao",
                "cleared_for_adoption": True,
            },
        )
        self.assertEqual(clear_resp.status_code, 400)
        self.assertIn("quarantine", clear_resp.json()["detail"].lower())

        # 2b. Cooldown / restriction rule: Vikram (id=5) was rejected on 2026-11-17 & restricted
        cooldown_resp = self.client.post(
            "/api/adoptions/applications",
            headers=self.csrf_headers,
            json={"adopter_id": 5, "animal_id": 1},
        )
        self.assertEqual(cooldown_resp.status_code, 400)

        # Active adopter rejected today also triggers 30-day cooldown
        app_resp = self.client.post(
            "/api/adoptions/applications",
            headers=self.csrf_headers,
            json={"adopter_id": 4, "animal_id": 1},
        )
        self.assertEqual(app_resp.status_code, 201)
        app_id = app_resp.json()["id"]
        rej_resp = self.client.patch(
            f"/api/adoptions/applications/{app_id}/status",
            headers=self.csrf_headers,
            json={"status": "rejected", "reviewer_notes": "Missing balcony netting"},
        )
        self.assertEqual(rej_resp.status_code, 200)

        reapply_resp = self.client.post(
            "/api/adoptions/applications",
            headers=self.csrf_headers,
            json={"adopter_id": 4, "animal_id": 2},
        )
        self.assertEqual(reapply_resp.status_code, 400)
        self.assertIn("cooldown", reapply_resp.json()["detail"].lower())

        # 2c. Shelter capacity enforcement: DOG-Q (id=2) has max_capacity=3 and 1 active dog (Rocky)
        for idx in range(2):
            r = self.client.post(
                "/api/animals/intake",
                headers=self.csrf_headers,
                json={
                    "source_type": "stray",
                    "source_name": f"Ward {idx + 1}",
                    "intake_date": "2026-11-27",
                    "intake_condition": "healthy",
                    "name": f"DogQ-{idx}",
                    "breed_id": 2,
                    "zone_id": 2,
                    "gender": "male",
                    "age_months": 12,
                    "weight_kg": 10.5,
                },
            )
            self.assertEqual(r.status_code, 201)

        # 4th active dog in DOG-Q must fail with 400 capacity exceeded
        overflow = self.client.post(
            "/api/animals/intake",
            headers=self.csrf_headers,
            json={
                "source_type": "stray",
                "source_name": "Ward Overflow",
                "intake_date": "2026-11-27",
                "intake_condition": "healthy",
                "name": "OverflowDog",
                "breed_id": 2,
                "zone_id": 2,
                "gender": "female",
                "age_months": 14,
                "weight_kg": 11.0,
            },
        )
        self.assertEqual(overflow.status_code, 400)
        self.assertIn("capacity", overflow.json()["detail"].lower())

    def test_3_automated_vaccine_expiry_and_readiness_gate(self):
        # Log a new Bordetella vaccine for Bruno (id=1, Dog) -> booster_interval_days = 180
        vax_resp = self.client.post(
            "/api/medical/vaccinations",
            headers=self.csrf_headers,
            json={
                "animal_id": 1,
                "vaccine_type_id": 3,
                "administered_date": "2026-11-01",
                "batch_number": "BD-TEST-01",
                "administered_by": "Dr. Ananya Rao",
            },
        )
        self.assertEqual(vax_resp.status_code, 201)
        self.assertEqual(vax_resp.json()["next_due_date"], "2027-04-30")

        # Sync expiry using a future reference date (2028-01-01) so existing shots become overdue
        sync_resp = self.client.post(
            "/api/medical/vaccinations/sync-expiry?reference_date=2028-01-01",
            headers=self.csrf_headers,
        )
        self.assertEqual(sync_resp.status_code, 200)
        self.assertGreater(sync_resp.json()["overdue"], 0)

        # Luna (id=5) has overdue mandatory vaccine & treatment hold -> application cannot be approved
        app_luna = self.client.post(
            "/api/adoptions/applications",
            headers=self.csrf_headers,
            json={"adopter_id": 4, "animal_id": 5},
        )
        self.assertEqual(app_luna.status_code, 201)
        app_id = app_luna.json()["id"]
        self.client.patch(
            f"/api/adoptions/applications/{app_id}/status",
            headers=self.csrf_headers,
            json={"status": "under_review"},
        )
        approve_fail = self.client.patch(
            f"/api/adoptions/applications/{app_id}/status",
            headers=self.csrf_headers,
            json={"status": "approved", "home_check_passed": True},
        )
        self.assertEqual(approve_fail.status_code, 400)
        self.assertIn("not ready", approve_fail.json()["detail"].lower())

    def test_4_atomic_adoption_finalization_and_followups(self):
        r1 = self.client.post(
            "/api/adoptions/applications",
            headers=self.csrf_headers,
            json={"adopter_id": 4, "animal_id": 1},
        )
        self.assertEqual(r1.status_code, 201)
        app1 = r1.json()

        r2 = self.client.post(
            "/api/adoptions/applications",
            headers=self.csrf_headers,
            json={"adopter_id": 3, "animal_id": 1},
        )
        self.assertEqual(r2.status_code, 201)
        app2 = r2.json()

        self.client.patch(
            f"/api/adoptions/applications/{app1['id']}/status",
            headers=self.csrf_headers,
            json={"status": "under_review"},
        )
        self.client.patch(
            f"/api/adoptions/applications/{app1['id']}/status",
            headers=self.csrf_headers,
            json={"status": "home_check", "home_check_passed": True},
        )
        approve_ok = self.client.patch(
            f"/api/adoptions/applications/{app1['id']}/status",
            headers=self.csrf_headers,
            json={"status": "approved"},
        )
        self.assertEqual(approve_ok.status_code, 200)

        fin_resp = self.client.post(
            f"/api/adoptions/applications/{app1['id']}/finalize",
            headers=self.csrf_headers,
            json={"adoption_date": "2026-11-27", "adoption_fee": 2000.0, "issued_by": "Sneha Kulkarni"},
        )
        self.assertEqual(fin_resp.status_code, 201)
        placement = fin_resp.json()
        self.assertTrue(placement["certificate_number"].startswith("CERT-2026-"))

        bruno = self.client.get("/api/animals/1").json()
        self.assertEqual(bruno["adoption_status"], "adopted")

        apps_for_bruno = self.client.get("/api/adoptions/applications?animal_id=1").json()
        statuses_by_id = {a["id"]: a["status"] for a in apps_for_bruno}
        self.assertEqual(statuses_by_id[app1["id"]], "completed")
        self.assertEqual(statuses_by_id[app2["id"]], "rejected")

        followups = self.client.get(f"/api/adoptions/followups?placement_id={placement['id']}").json()
        self.assertEqual(len(followups), 3)
        self.assertEqual(
            [f["followup_type"] for f in followups],
            ["7_day_check", "30_day_check", "90_day_check"],
        )

        double_fin = self.client.post(
            f"/api/adoptions/applications/{app1['id']}/finalize",
            headers=self.csrf_headers,
            json={"adoption_date": "2026-11-27", "adoption_fee": 2000.0, "issued_by": "Sneha Kulkarni"},
        )
        self.assertEqual(double_fin.status_code, 400)

    def test_5_smart_matchmaking_and_reports(self):
        matches = self.client.get("/api/adoptions/matchmaking?adopter_id=2").json()
        self.assertGreater(len(matches), 0)
        self.assertTrue(matches[0]["ready_for_adoption"])

        occ = self.client.get("/api/reports/occupancy").json()
        self.assertIn("summary", occ)
        self.assertGreater(occ["summary"]["total_capacity"], 0)
        self.assertEqual(len(occ["zones"]), 5)

        health = self.client.get("/api/reports/health").json()
        self.assertIn("summary", health)
        self.assertGreaterEqual(health["summary"]["animals_with_overdue_vaccines"], 1)

        cert = self.client.get("/api/reports/certificates/1").json()
        self.assertEqual(cert["certificate_number"], "CERT-2026-0001")
        self.assertEqual(cert["animal_name"], "Clover")
        self.assertGreaterEqual(len(cert["vaccinations"]), 1)


if __name__ == "__main__":
    unittest.main()
