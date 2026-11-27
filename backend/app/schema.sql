-- Pet Adoption & Animal Shelter Management System
-- Strict 3NF Relational Schema with Database-Level Integrity Constraints

PRAGMA foreign_keys = ON;

-- 1. Reference Table: Species & Quarantine Rules (1NF/3NF)
CREATE TABLE IF NOT EXISTS species (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    quarantine_days INTEGER NOT NULL CHECK (quarantine_days > 0),
    min_adoption_age_months INTEGER NOT NULL DEFAULT 2 CHECK (min_adoption_age_months >= 0)
);

-- 1b. Reference Table: Breeds (depends on species_id; animals references breed_id only to preserve 3NF)
CREATE TABLE IF NOT EXISTS breeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    species_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    size_category TEXT NOT NULL CHECK (size_category IN ('small', 'medium', 'large', 'giant')),
    requires_yard INTEGER NOT NULL DEFAULT 0 CHECK (requires_yard IN (0, 1)),
    UNIQUE (species_id, name),
    FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
);

-- 2. Rules / Compatibility Table: Species Vaccination Protocols
CREATE TABLE IF NOT EXISTS vaccine_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    species_id INTEGER NOT NULL,
    vaccine_name TEXT NOT NULL,
    booster_interval_days INTEGER NOT NULL CHECK (booster_interval_days > 0),
    is_mandatory INTEGER NOT NULL DEFAULT 1 CHECK (is_mandatory IN (0, 1)),
    UNIQUE (species_id, vaccine_name),
    FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
);

-- 3. Entity / Facility Table: Shelter Zones & Capacity
CREATE TABLE IF NOT EXISTS shelter_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_code TEXT NOT NULL UNIQUE,
    zone_name TEXT NOT NULL,
    species_id INTEGER NOT NULL,
    max_capacity INTEGER NOT NULL CHECK (max_capacity > 0),
    care_level TEXT NOT NULL DEFAULT 'standard' CHECK (care_level IN ('standard', 'quarantine', 'medical_isolation')),
    FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE RESTRICT
);

-- 3b. Auth & RBAC Tables (Strict 3NF)
CREATE TABLE IF NOT EXISTS roles (
    role_id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_name TEXT NOT NULL UNIQUE CHECK (role_name IN ('ADMIN', 'SHELTER_STAFF', 'ADOPTER'))
);

CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role_id INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    csrf_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 3c. Entity / Profiles Table: Adopters (linked to users via optional 1:1 user_id FK)
CREATE TABLE IF NOT EXISTS adopters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    housing_type TEXT NOT NULL CHECK (housing_type IN ('house', 'apartment', 'farm', 'condo')),
    has_yard INTEGER NOT NULL DEFAULT 0 CHECK (has_yard IN (0, 1)),
    has_other_pets INTEGER NOT NULL DEFAULT 0 CHECK (has_other_pets IN (0, 1)),
    has_children INTEGER NOT NULL DEFAULT 0 CHECK (has_children IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'restricted')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- 4. Intake / Event Records
CREATE TABLE IF NOT EXISTS intake_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intake_code TEXT NOT NULL UNIQUE,
    source_type TEXT NOT NULL CHECK (source_type IN ('stray', 'owner_surrender', 'transfer', 'rescue')),
    source_name TEXT NOT NULL,
    intake_date TEXT NOT NULL,
    intake_condition TEXT NOT NULL CHECK (intake_condition IN ('healthy', 'minor_injury', 'critical', 'malnourished')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. Tracked Unit-Level Entity: Animals
-- Note: species_id is omitted intentionally (3NF: breed_id -> species_id)
CREATE TABLE IF NOT EXISTS animals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    microchip_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    breed_id INTEGER NOT NULL,
    intake_id INTEGER,
    zone_id INTEGER NOT NULL,
    gender TEXT NOT NULL CHECK (gender IN ('male', 'female', 'unknown')),
    age_months INTEGER NOT NULL CHECK (age_months >= 0),
    weight_kg REAL NOT NULL CHECK (weight_kg > 0),
    intake_date TEXT NOT NULL,
    quarantine_until TEXT NOT NULL,
    medical_status TEXT NOT NULL DEFAULT 'quarantine' CHECK (medical_status IN ('quarantine', 'treatment', 'cleared', 'critical')),
    adoption_status TEXT NOT NULL DEFAULT 'medical_hold' CHECK (adoption_status IN ('available', 'pending_adoption', 'adopted', 'medical_hold', 'deceased')),
    spayed_neutered INTEGER NOT NULL DEFAULT 0 CHECK (spayed_neutered IN (0, 1)),
    good_with_kids INTEGER NOT NULL DEFAULT 1 CHECK (good_with_kids IN (0, 1)),
    good_with_pets INTEGER NOT NULL DEFAULT 1 CHECK (good_with_pets IN (0, 1)),
    notes TEXT,
    FOREIGN KEY (breed_id) REFERENCES breeds(id) ON DELETE RESTRICT,
    FOREIGN KEY (intake_id) REFERENCES intake_records(id) ON DELETE SET NULL,
    FOREIGN KEY (zone_id) REFERENCES shelter_zones(id) ON DELETE RESTRICT,
    CHECK (quarantine_until >= intake_date)
);

-- 5b. Medical History Log
CREATE TABLE IF NOT EXISTS medical_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INTEGER NOT NULL,
    visit_date TEXT NOT NULL,
    record_type TEXT NOT NULL CHECK (record_type IN ('intake_exam', 'treatment', 'surgery', 'checkup', 'emergency')),
    diagnosis TEXT NOT NULL,
    treatment_notes TEXT NOT NULL,
    vet_name TEXT NOT NULL,
    cleared_for_adoption INTEGER NOT NULL DEFAULT 0 CHECK (cleared_for_adoption IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE
);

-- 5c. Vaccination History Log (with Automated Booster Expiry Tracking)
CREATE TABLE IF NOT EXISTS vaccination_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_id INTEGER NOT NULL,
    vaccine_type_id INTEGER NOT NULL,
    administered_date TEXT NOT NULL,
    next_due_date TEXT NOT NULL,
    batch_number TEXT NOT NULL,
    administered_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'due_soon', 'overdue')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE,
    FOREIGN KEY (vaccine_type_id) REFERENCES vaccine_types(id) ON DELETE RESTRICT,
    CHECK (next_due_date >= administered_date)
);

-- 6. Adoption Workflow Requests: Applications
CREATE TABLE IF NOT EXISTS adoption_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_code TEXT NOT NULL UNIQUE,
    adopter_id INTEGER NOT NULL,
    animal_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'home_check', 'approved', 'rejected', 'withdrawn', 'completed')),
    home_check_passed INTEGER NOT NULL DEFAULT 0 CHECK (home_check_passed IN (0, 1)),
    reviewer_notes TEXT,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (adopter_id) REFERENCES adopters(id) ON DELETE CASCADE,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE CASCADE
);

-- 6b. Immutable Adoption Placement & Certificate Audit Log
-- UNIQUE(animal_id) and UNIQUE(application_id) mathematically prevent double-adoption!
CREATE TABLE IF NOT EXISTS adoption_placements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    certificate_number TEXT NOT NULL UNIQUE,
    application_id INTEGER NOT NULL UNIQUE,
    animal_id INTEGER NOT NULL UNIQUE,
    adopter_id INTEGER NOT NULL,
    adoption_date TEXT NOT NULL,
    adoption_fee REAL NOT NULL DEFAULT 0 CHECK (adoption_fee >= 0),
    issued_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (application_id) REFERENCES adoption_applications(id) ON DELETE CASCADE,
    FOREIGN KEY (animal_id) REFERENCES animals(id) ON DELETE RESTRICT,
    FOREIGN KEY (adopter_id) REFERENCES adopters(id) ON DELETE RESTRICT
);

-- 6c. Post-Adoption Follow-Up Welfare Log
CREATE TABLE IF NOT EXISTS post_adoption_followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    placement_id INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,
    completed_date TEXT,
    followup_type TEXT NOT NULL CHECK (followup_type IN ('7_day_check', '30_day_check', '90_day_check', 'home_visit', 'vet_followup')),
    animal_wellbeing TEXT NOT NULL DEFAULT 'pending' CHECK (animal_wellbeing IN ('pending', 'thriving', 'adjusting', 'needs_support', 'returned')),
    notes TEXT,
    conducted_by TEXT,
    FOREIGN KEY (placement_id) REFERENCES adoption_placements(id) ON DELETE CASCADE
);
