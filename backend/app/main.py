import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routers import admin, adoptions, animals, auth, dashboard, medical, reports, shelter


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(seed=True)
    yield


app = FastAPI(
    title="PawHaven — Pet Adoption & Animal Shelter Management API",
    description=(
        "3NF Relational DBMS & FastAPI backend with Cookie+CSRF Session Auth and 3-Role RBAC "
        "(ADMIN, SHELTER_STAFF, ADOPTER) for managing shelter animals, medical & vaccination histories, "
        "kennel capacity, adoption workflows, post-adoption follow-ups, certificates, and shelter reports."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

raw_origins = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
allowed_origins = [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(dashboard.router)
app.include_router(shelter.router)
app.include_router(animals.router)
app.include_router(medical.router)
app.include_router(adoptions.router)
app.include_router(reports.router)


@app.get("/api/health-check", tags=["System"])
def health_check():
    return {"status": "ok", "service": "PawHaven Shelter Management API"}
