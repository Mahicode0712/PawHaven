import json
import os
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient

from app.create_admin import create_initial_admin
from app.database import get_connection
from app.main import app
from app.services.auth_service import clear_login_rate_limits


class AuthAndRbacTests(unittest.TestCase):
    def setUp(self):
        clear_login_rate_limits()
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp_dir.name) / "test_auth.db"
        os.environ["SHELTER_DB_PATH"] = str(self.db_path)
        os.environ["ADMIN_FULL_NAME"] = "Root Admin"
        os.environ["ADMIN_EMAIL"] = "root.admin@pawhaven.local"
        os.environ["ADMIN_PASSWORD"] = "AdminStrong!99"
        create_initial_admin()

    def tearDown(self):
        for var in ("SHELTER_DB_PATH", "ADMIN_FULL_NAME", "ADMIN_EMAIL", "ADMIN_PASSWORD"):
            os.environ.pop(var, None)
        self.tmp_dir.cleanup()

    def _register_adopter(self, client: TestClient, email: str, name: str = "Adopter User"):
        return client.post(
            "/api/auth/register",
            json={
                "full_name": name,
                "email": email,
                "password": "AdopterPass!123",
                "confirm_password": "AdopterPass!123",
                "phone": "+91-9000000001",
                "address": "12 Park Street, Bengaluru",
                "housing_type": "house",
                "has_yard": True,
            },
        )

    def _login(self, client: TestClient, email: str, password: str):
        resp = client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )
        csrf = resp.json().get("csrf_token") if resp.status_code == 200 else None
        return resp, ({"X-CSRF-Token": csrf} if csrf else {})

    def test_01_successful_registration_and_no_password_hash(self):
        with TestClient(app) as client:
            resp = self._register_adopter(client, "maya.adopter@example.com", "Maya Rao")
            self.assertEqual(resp.status_code, 201)
            body = resp.json()
            self.assertEqual(body["user"]["role"], "ADOPTER")
            self.assertIsNotNone(body["user"]["adopter_id"])
            self.assertNotIn("password_hash", json.dumps(body))

            # Verify password stored hashed with bcrypt in DB
            conn = get_connection()
            try:
                row = conn.execute(
                    "SELECT password_hash FROM users WHERE email = 'maya.adopter@example.com'"
                ).fetchone()
                self.assertTrue(row["password_hash"].startswith("$2b$"))
            finally:
                conn.close()

    def test_02_duplicate_email_registration_blocked(self):
        with TestClient(app) as client:
            r1 = self._register_adopter(client, "dup@example.com")
            self.assertEqual(r1.status_code, 201)
            r2 = self._register_adopter(client, "DUP@example.com")
            self.assertEqual(r2.status_code, 409)

    def test_03_prevent_public_registration_as_admin_or_staff(self):
        with TestClient(app) as client:
            for role_payload in (
                {"role": "ADMIN"},
                {"role_name": "ADMIN"},
                {"role": "SHELTER_STAFF"},
                {"role_id": 1},
            ):
                resp = client.post(
                    "/api/auth/register",
                    json={
                        "full_name": "Escalation Attacker",
                        "email": "attacker@example.com",
                        "password": "AdopterPass!123",
                        "confirm_password": "AdopterPass!123",
                        **role_payload,
                    },
                )
                self.assertEqual(resp.status_code, 403)

    def test_04_login_logout_and_session_invalidation(self):
        with TestClient(app) as client:
            self._register_adopter(client, "login.user@example.com")
            login_resp, csrf_headers = self._login(client, "login.user@example.com", "AdopterPass!123")
            self.assertEqual(login_resp.status_code, 200)
            self.assertIn("pawhaven_session", login_resp.cookies)
            self.assertNotIn("password_hash", json.dumps(login_resp.json()))

            me_resp = client.get("/api/auth/me")
            self.assertEqual(me_resp.status_code, 200)
            self.assertEqual(me_resp.json()["user"]["email"], "login.user@example.com")
            self.assertNotIn("password_hash", json.dumps(me_resp.json()))

            # CSRF check: logout without X-CSRF-Token fails with 403
            bad_logout = client.post("/api/auth/logout")
            self.assertEqual(bad_logout.status_code, 403)

            # Valid logout invalidates session
            logout_resp = client.post("/api/auth/logout", headers=csrf_headers)
            self.assertEqual(logout_resp.status_code, 200)

            after_logout = client.get("/api/auth/me")
            self.assertEqual(after_logout.status_code, 401)

    def test_05_incorrect_password_and_rate_limiting(self):
        with TestClient(app) as client:
            self._register_adopter(client, "victim@example.com")
            bad1, _ = self._login(client, "victim@example.com", "WrongPass!1")
            self.assertEqual(bad1.status_code, 401)
            bad_unknown, _ = self._login(client, "nobody@example.com", "WrongPass!1")
            self.assertEqual(bad_unknown.status_code, 401)
            # Identical generic message prevents user enumeration
            self.assertEqual(bad1.json()["detail"], bad_unknown.json()["detail"])

            # Trigger rate limit after 5 failed attempts
            for _ in range(4):
                self._login(client, "victim@example.com", "WrongPass!1")
            rate_limited, _ = self._login(client, "victim@example.com", "AdopterPass!123")
            self.assertEqual(rate_limited.status_code, 429)

    def test_06_unauthenticated_access_blocked(self):
        with TestClient(app) as client:
            for path in (
                "/api/auth/me",
                "/api/dashboard",
                "/api/dashboard/adopter",
                "/api/animals",
                "/api/medical/records",
                "/api/adoptions/applications",
                "/api/reports/occupancy",
                "/api/admin/users",
            ):
                resp = client.get(path)
                self.assertEqual(resp.status_code, 401, f"Expected 401 on {path}, got {resp.status_code}")

    def test_07_admin_and_staff_permissions(self):
        with TestClient(app) as admin_client:
            _, admin_csrf = self._login(admin_client, "root.admin@pawhaven.local", "AdminStrong!99")

            # Admin creates staff user
            staff_create = admin_client.post(
                "/api/admin/users",
                headers=admin_csrf,
                json={
                    "full_name": "Dr. Kavya Staff",
                    "email": "staff@pawhaven.local",
                    "password": "StaffPass!123",
                    "role_name": "SHELTER_STAFF",
                },
            )
            self.assertEqual(staff_create.status_code, 201)
            staff_id = staff_create.json()["user_id"]

            # Admin lists users and password hashes are absent
            users_resp = admin_client.get("/api/admin/users")
            self.assertEqual(users_resp.status_code, 200)
            self.assertNotIn("password_hash", json.dumps(users_resp.json()))

        with TestClient(app) as staff_client:
            _, staff_csrf = self._login(staff_client, "staff@pawhaven.local", "StaffPass!123")

            # Staff CAN access operational endpoints (intake, medical, reports, dashboard)
            self.assertEqual(staff_client.get("/api/dashboard").status_code, 200)
            self.assertEqual(staff_client.get("/api/reports/occupancy").status_code, 200)
            intake = staff_client.post(
                "/api/animals/intake",
                headers=staff_csrf,
                json={
                    "source_type": "rescue",
                    "source_name": "City Volunteers",
                    "intake_date": "2026-11-27",
                    "intake_condition": "healthy",
                    "name": "Pepper",
                    "breed_id": 5,
                    "zone_id": 3,
                    "gender": "female",
                    "age_months": 10,
                    "weight_kg": 3.4,
                },
            )
            self.assertEqual(intake.status_code, 201)
            pepper_id = intake.json()["id"]

            # Staff CANNOT access Admin-only endpoints (users or delete animal)
            self.assertEqual(staff_client.get("/api/admin/users").status_code, 403)
            self.assertEqual(
                staff_client.delete(f"/api/animals/{pepper_id}", headers=staff_csrf).status_code,
                403,
            )

        # Admin CAN delete animal & deactivate staff user
        with TestClient(app) as admin_client:
            _, admin_csrf = self._login(admin_client, "root.admin@pawhaven.local", "AdminStrong!99")
            self.assertEqual(
                admin_client.delete(f"/api/animals/{pepper_id}", headers=admin_csrf).status_code,
                200,
            )
            deact = admin_client.patch(
                f"/api/admin/users/{staff_id}/status",
                headers=admin_csrf,
                json={"is_active": False},
            )
            self.assertEqual(deact.status_code, 200)
            self.assertFalse(deact.json()["is_active"])

        # Deactivated staff cannot log in
        with TestClient(app) as disabled_client:
            r, _ = self._login(disabled_client, "staff@pawhaven.local", "StaffPass!123")
            self.assertEqual(r.status_code, 403)

    def test_08_adopter_permissions_and_cross_adopter_isolation(self):
        with TestClient(app) as reg_client:
            r_a = self._register_adopter(reg_client, "adopter.a@example.com", "Adopter A")
            r_b = self._register_adopter(reg_client, "adopter.b@example.com", "Adopter B")
            adopter_a_id = r_a.json()["user"]["adopter_id"]
            adopter_b_id = r_b.json()["user"]["adopter_id"]

        with TestClient(app) as client_a:
            _, csrf_a = self._login(client_a, "adopter.a@example.com", "AdopterPass!123")

            # Adopter A CAN browse animals, view adopter dashboard, and submit application for self
            self.assertEqual(client_a.get("/api/animals").status_code, 200)
            self.assertEqual(client_a.get("/api/dashboard/adopter").status_code, 200)

            app_a = client_a.post(
                "/api/adoptions/applications",
                headers=csrf_a,
                json={"animal_id": 1},
            )
            self.assertEqual(app_a.status_code, 201)
            app_a_id = app_a.json()["id"]

            # Adopter A CANNOT access admin, staff dashboard, medical records, or shelter reports
            for forbidden_path in (
                "/api/dashboard",
                "/api/admin/users",
                "/api/medical/records",
                "/api/reports/occupancy",
                "/api/reports/health",
                "/api/adoptions/adopters",
                "/api/shelter/zones",
            ):
                self.assertEqual(
                    client_a.get(forbidden_path).status_code,
                    403,
                    f"Expected 403 for adopter on {forbidden_path}",
                )

            # Adopter A CANNOT approve their own application
            self.assertEqual(
                client_a.patch(
                    f"/api/adoptions/applications/{app_a_id}/status",
                    headers=csrf_a,
                    json={"status": "approved", "home_check_passed": True},
                ).status_code,
                403,
            )

            # Adopter A CANNOT submit an application on behalf of Adopter B
            self.assertEqual(
                client_a.post(
                    "/api/adoptions/applications",
                    headers=csrf_a,
                    json={"adopter_id": adopter_b_id, "animal_id": 2},
                ).status_code,
                403,
            )

            # Adopter A CANNOT view seeded certificate #1 (belongs to Meera Kapoor)
            self.assertEqual(client_a.get("/api/reports/certificates/1").status_code, 403)

        with TestClient(app) as client_b:
            _, csrf_b = self._login(client_b, "adopter.b@example.com", "AdopterPass!123")

            # Adopter B sees only their own applications (empty), never Adopter A's
            apps_b = client_b.get("/api/adoptions/applications").json()
            self.assertEqual(len(apps_b), 0)

            # Adopter B querying Adopter A's applications fails with 403
            self.assertEqual(
                client_b.get(f"/api/adoptions/applications?adopter_id={adopter_a_id}").status_code,
                403,
            )

            # Adopter B cannot withdraw Adopter A's application
            self.assertEqual(
                client_b.patch(
                    f"/api/adoptions/applications/{app_a_id}/status",
                    headers=csrf_b,
                    json={"status": "withdrawn"},
                ).status_code,
                403,
            )


if __name__ == "__main__":
    unittest.main()
