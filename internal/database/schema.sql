-- internal/database/schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pg_trgm enables fast LIKE/ILIKE searches (e.g. job title, location).
-- Without this, LIKE '%keyword%' is a full table scan.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Companies ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
    id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name    TEXT UNIQUE NOT NULL,
    website TEXT,
    industry TEXT
);

-- ── Jobs ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_title   TEXT NOT NULL,
    company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
    location    TEXT,
    description TEXT,
    job_url     TEXT UNIQUE NOT NULL,
    salary      TEXT,
    is_remote   BOOLEAN DEFAULT FALSE,
    date_posted TIMESTAMP,                         -- from scraper (optional)
    source      TEXT,                              -- e.g. "Workday", "Greenhouse"

    experience_min   INTEGER DEFAULT -1,           -- -1 = unknown
    experience_max   INTEGER DEFAULT -1,           -- -1 = unknown
    experience_level TEXT DEFAULT 'Unknown',       -- Fresher, Junior, Mid, Senior

    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for GetJobs queries.
-- GIN trigram indexes make LIKE '%keyword%' fast at scale.
CREATE INDEX IF NOT EXISTS idx_jobs_company
    ON jobs(company_id);

CREATE INDEX IF NOT EXISTS idx_jobs_created
    ON jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_experience
    ON jobs(experience_min, experience_max);

CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm
    ON jobs USING gin(LOWER(job_title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_jobs_location_trgm
    ON jobs USING gin(LOWER(location) gin_trgm_ops);

-- ── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email      TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Applications (saved / tracker) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS applications (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id       UUID REFERENCES jobs(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT DEFAULT 'Saved',             -- Saved, Applied, Interviewing, Rejected, Offered
    applied_date TIMESTAMP,
    notes        TEXT,
    UNIQUE(job_id, user_id)
);
