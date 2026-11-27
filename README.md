# PawHaven — Pet Adoption & Animal Shelter Management System

Full-stack Database Management System built with **FastAPI + SQLite (Strict 3NF)** and **React 18 + Vite**, featuring **Cookie + CSRF Session Authentication** and **3-Role RBAC (`ADMIN`, `SHELTER_STAFF`, `ADOPTER`)**.

## Architecture & 3NF Relational Design

The database schema ([backend/app/schema.sql](backend/app/schema.sql)) enforces `PRAGMA foreign_keys = ON`, `CHECK`, `UNIQUE`, and `FOREIGN KEY` constraints in strict Third Normal Form (3NF):

1. **Auth & RBAC Tables**:
   - `roles` (`role_id`, `role_name` `UNIQUE` in `ADMIN`, `SHELTER_STAFF`, `ADOPTER`)
   - `users` (`user_id`, `full_name`, `email` `UNIQUE`, `password_hash`, `role_id` FK -> `roles`, `is_active`, `created_at`, `updated_at`)
   - `user_sessions` (`session_id`, `user_id` FK -> `users`, `csrf_token`, `expires_at`, `revoked_at`)
2. **Reference / Protocol Tables**: `species`, `breeds` (3NF: `animals` references `breed_id` only), `vaccine_types`
3. **Facility & Profile Tables**: `shelter_zones`, `adopters` (linked to `users` via `user_id` unique FK without duplicating user credentials)
4. **Intake Records**: `intake_records`
5. **Unit-Level Animals & Clinical Histories**: `animals`, `medical_records`, `vaccination_records`
6. **Workflow, Atomic Placement & Welfare Follow-Up**: `adoption_applications`, `adoption_placements` (`UNIQUE(animal_id)` and `UNIQUE(application_id)` prevent double-adoption), `post_adoption_followups`

## Authentication & RBAC Architecture

- **Password Security**: `bcrypt` password hashing with strength validation (min 8 chars, uppercase, lowercase, digit, special char). `password_hash` is never returned in API responses.
- **Session & CSRF Protection**: Login issues an `HttpOnly`, `SameSite=Lax` signed session cookie (`pawhaven_session`) backed by `user_sessions` for server-side revocation on logout, plus a `pawhaven_csrf` token validated via `X-CSRF-Token` on all mutating (`POST`, `PUT`, `PATCH`, `DELETE`) requests.
- **Login Rate Limiting**: Sliding-window rate limiter blocks repeated failed attempts per `(IP, email)` (`HTTP 429`).
- **Role Permissions**:
  - **ADMIN**: Full administrative dashboard, provision/manage users & staff (`GET/POST /api/admin/users`, `PATCH /api/admin/users/{id}/status|role`), add/edit/remove animals, medical & vaccination management, adoption approvals & finalization, certificates, occupancy & health reports.
  - **SHELTER_STAFF**: Staff dashboard, register & edit animals, record medical exams & vaccinations, update availability, review/process adoption applications, finalize placements, record post-adoption follow-ups, view occupancy & health reports. Cannot manage users or delete animal records.
  - **ADOPTER**: Public self-registration always creates an `ADOPTER` account (attempts to pass `ADMIN`/`SHELTER_STAFF` roles are rejected with `403`). Adopters can browse available pets, view adopter-facing medical/vaccination summaries, submit/withdraw their own applications, and view their own adoption certificates and follow-ups. Cross-adopter access is blocked (`403`).

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `APP_SECRET_KEY` | Signing secret for session JWTs (set in production) | Ephemeral random per-process key |
| `COOKIE_SECURE` | Set `true` behind HTTPS | `false` |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins | `http://localhost:5173,http://127.0.0.1:5173` |
| `SHELTER_DB_PATH` | Optional SQLite database path override | `backend/shelter.db` |
| `ADMIN_FULL_NAME` | Non-interactive admin setup name | Prompts interactively |
| `ADMIN_EMAIL` | Non-interactive admin setup email | Prompts interactively |
| `ADMIN_PASSWORD` | Non-interactive admin setup password | Prompts securely via `getpass` |

## Setup & Running Locally

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt

cd ../frontend
npm install
```

### 2. Create the Initial Admin Account
Never hardcode admin credentials. Run the secure CLI setup script (interactive or via env vars):
```bash
cd backend
python3 -m app.create_admin
```
To provision Staff accounts afterward, sign in as `ADMIN` and use **Users & Staff** in the dashboard. Public users can self-register as `ADOPTER` via the **Register** page (`POST /api/auth/register`).

### 3. Run Backend & Frontend
```bash
# Terminal 1 (Backend + Swagger UI at http://127.0.0.1:8000/docs)
cd backend
uvicorn app.main:app --reload --port 8000

# Terminal 2 (Frontend SPA at http://127.0.0.1:5173)
cd frontend
npm run dev
```

### 4. Run Automated Tests (Existing + Auth/RBAC Suite)
```bash
cd backend
python3 -m unittest discover -s tests -v
```
