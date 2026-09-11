# projectRent

A rental marketplace for **students and young professionals** looking for
PGs, hostels, rooms, and flats near their college or workplace.

The product focuses on what generic portals do poorly for this audience:

* PGs, hostels, private/shared rooms, and flats (rentals only)
* Search anchored on **college / office / landmark proximity**
* **Transparent total monthly costs**, not just advertised rent
* **Verified listings** with visible trust signals
* **Roommate discovery** for compatible flatmates
* A simple contact → visit workflow, mobile-first

See `docs/supply-strategy.md` for the launch supply plan.

## Current status

**Phase 0 — Foundation: COMPLETE.**

Phase 1 (Authentication + Profiles) has **NOT** started. No product features
exist yet — only the runnable foundation described below.

Details: `docs/PROJECT_STATUS.md`.
Contributing: `docs/CONTRIBUTING.md`.

## Technology stack

Frontend:

* Next.js (App Router)
* TypeScript
* React
* Tailwind CSS

Backend (modular monolith):

* Python
* FastAPI
* Pydantic
* SQLAlchemy
* Alembic

Database:

* PostgreSQL 17
* Docker Compose for local development (database container only)

Planned, not yet implemented:

* Authentication: Firebase Authentication (phone OTP + Google) — planned
  for Phase 1. Nothing is configured yet.
* Object storage: S3-compatible storage for property media — planned for
  when uploads are built. Nothing is configured yet.

## Repository structure

```text
projectRent/
  README.md            # this file — start here
  docker-compose.yml   # local PostgreSQL container (database only)
  .env.example         # template for local dev environment variables
  .gitignore
  frontend/            # Next.js + TypeScript + Tailwind web app
    app/               # App Router pages (layout, home page)
    package.json       # scripts: dev, build, start, typecheck
  backend/             # FastAPI modular monolith
    app/               # main.py (routes), db.py, models.py, seed.py
    alembic/           # migrations (versions/0001_create_locations.py)
    tests/             # backend tests
    requirements.txt
  docs/                # PROJECT_STATUS.md, CONTRIBUTING.md, supply-strategy.md
```

The tree above is an overview of the top-level layout, not an exhaustive
file listing. Feature modules (auth, listings, search, messaging, …) will
be introduced incrementally in their respective phases — they are
intentionally absent now.

## Prerequisites

Works on Windows, macOS, and Linux. You need:

* Git
* Node.js 22+ (verified with Node 22)
* Python 3.13+ (verified with Python 3.13)
* Docker Desktop with Docker Compose v2+ (verified with Docker 29 and
  Compose v5)

Check yours with:

```powershell
node --version
python --version
docker --version
docker compose version
```

## Local setup

### 1. Clone the repository

```powershell
git clone <repository-url>
cd projectRent
```

(Use the repository URL provided by the team. No remote is configured yet.)

### 2. Start PostgreSQL with Docker

From the repository root:

```powershell
docker compose up -d db
docker compose ps
```

The database container listens on **host port 5433** (mapped to 5432
inside the container). Port 5433 is deliberate: many Windows development
machines already run a native PostgreSQL on 5432, and using 5433 lets both
coexist. All backend defaults and `.env.example` already use 5433.

#### Without Docker (not recommended)

Docker is the recommended path because it gives every teammate the same
PostgreSQL environment. If you cannot use Docker, you can still run the
project against a locally installed PostgreSQL — PostgreSQL itself is
still required; no other database is supported.

1. Install PostgreSQL locally (use your platform's installer; a native
   installation typically listens on port 5432 — that is fine, just
   point the project at it instead of 5433).
2. Create the development database and user if necessary, using the same
   database name, user, and password the project expects (see
   `.env.example` for the template values).
3. Copy `.env.example` to `backend/.env`:

   ```powershell
   copy ..\.env.example .env
   ```

4. Edit `backend/.env` so `DATABASE_URL` matches your local PostgreSQL
   installation (host, port, database, user, and password).
5. From `backend/` with the virtual environment active, run the normal
   project commands:

   ```powershell
   alembic upgrade head
   python -m app.seed
   ```

6. Start the FastAPI backend normally (`uvicorn app.main:app --reload
   --port 8000`) and confirm `/readyz` reports the database as up.

The verified setup remains Docker PostgreSQL on host port 5433; use the
steps above only when Docker is unavailable.

### 3. Set up the backend virtual environment

```powershell
cd backend
python -m venv .venv
```

Activate it (Windows PowerShell):

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

### 4. Install backend dependencies

```powershell
pip install -r requirements.txt
```

### 5. Configure environment variables

```powershell
copy ..\.env.example .env
```

macOS/Linux:

```bash
cp ../.env.example .env
```

The backend loads `backend/.env` automatically. The template already points
at the Docker database on port 5433 — edit `DATABASE_URL` only if your
setup differs. See "Environment variables" below.

### 6. Run Alembic migrations

```powershell
alembic upgrade head
alembic current   # should show: 0001 (head)
```

### 7. Seed the database

```powershell
python -m app.seed
```

This inserts starter Guwahati locations (two colleges, one area) used to
prove the migration + query path works.

### 8. Start FastAPI

```powershell
uvicorn app.main:app --reload --port 8000
```

Verify:

* `http://localhost:8000/healthz` → `{"status":"ok"}`
* `http://localhost:8000/readyz` → `{"status":"ready","db":"up"}`

### 9. Start Next.js

In a second terminal, from the repository root:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` — it shows the Phase 0 placeholder page.
(Product UI starts in later phases.)

### 10. Run tests / typecheck

Backend (virtual environment active, from `backend/`):

```powershell
pytest -q
```

Frontend (from `frontend/`):

```powershell
npm run typecheck
npm run build
```

## Useful commands

Database (from repository root):

```powershell
docker compose up -d    # start PostgreSQL in the background
docker compose ps       # show container status and port mapping
docker compose down     # stop the container (data is kept in the pgdata volume)
```

Backend (from `backend/`, virtual environment active):

```powershell
alembic upgrade head    # apply migrations
alembic current         # show applied revision
python -m app.seed      # insert starter locations (skips if already seeded)
pytest -q               # run backend tests
```

Frontend (from `frontend/`):

```powershell
npm run dev             # local dev server on :3000
npm run build           # production build
npm run start           # serve the production build
npm run typecheck       # TypeScript check without emitting files
```

## Development workflow

1. Pull the latest changes for your base branch.
2. Create a feature branch for one small slice of work.
3. Make the change (keep it small and reviewable).
4. Run the relevant checks (`pytest -q`, `npm run typecheck`, `npm run build`).
5. Review your own diff before committing.
6. Commit with a clear message describing what and why.
7. Push the branch.
8. Open a pull request.
9. Address review feedback.
10. Merge after approval.

Branch and commit conventions: see `docs/CONTRIBUTING.md`.

## Environment variables

* `.env.example` (repository root) is committed and holds **development-only**
  template values for the local Docker database.
* Each teammate copies it to `backend/.env` for local runs.
* Real `.env` files must **never** be committed (already in `.gitignore`).
* Secrets must never be placed in source code — only in environment
  configuration. No production credentials exist in this repository.

## Phase-based development

Work lands incrementally, one phase at a time:

* Phase 0 — Foundation — **COMPLETE**
* Phase 1 — Authentication + Profiles — NEXT
* Phase 2 — Listings
* Phase 3 — Search + Filters
* Phase 4 — Property Details + Favorites + Compare
* Phase 5 — Messaging + Visits
* Phase 6 — Moderation + Reviews + Reports
* Phase 7 — Roommates
* Phase 8 — Hardening + Launch

Each phase is approved before the next begins. Do not implement future
phases early.
