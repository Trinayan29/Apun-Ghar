# projectRent — Apun-Ghar

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

**Implemented:** Firebase Email/Password + Google auth (server-verified),
PostgreSQL users/roles/profiles, renter onboarding + profile, separate
`OWNER` accounts with Owner Studio, full owner supply side (properties
→ rental units → listings → pricing/photos → publish/pause/delete),
B2-backed photo uploads, and a disconnected UX prototype.

Details: `docs/PROJECT_STATUS.md`.
Architecture: `docs/SYSTEM_DESIGN.md`.
Contributing: `docs/CONTRIBUTING.md`.

## Technology stack

* **Frontend:** Next.js (App Router), TypeScript, React, Tailwind CSS, Vitest
* **Backend:** Python, FastAPI, Pydantic, SQLAlchemy, Alembic, pytest
* **Database:** PostgreSQL 17 (Docker Compose for local development)
* **Auth:** Firebase Authentication (Email/Password + Google Sign-In)
* **Object storage:** Backblaze B2, S3-compatible (presigned URLs; browser never sees credentials)

## Repository structure

```text
projectRent/
  README.md            # this file — start here
  AGENTS.md            # instructions for coding agents
  docker-compose.yml   # local PostgreSQL container (database only)
  .env.example         # template for local dev environment variables
  frontend/            # production Next.js + TypeScript + Tailwind web app
  backend/             # FastAPI modular monolith + Alembic + pytest
  design-prototype/    # standalone UX sandbox (own app, no backend calls)
  docs/                # SYSTEM_DESIGN.md (authority), PROJECT_STATUS.md,
                        # DEVELOPMENT.md, CONTRIBUTING.md, supply-strategy.md,
                        # decisions/ (architectural decision records)
```

The tree above is an overview of the top-level layout, not an exhaustive
file listing. `design-prototype/` is a separate Next.js app (port 3100)
used for UX iteration; it shares no code with `frontend/`.

## Quick start

Prerequisites: Git, Node.js, Python, Docker Desktop. The repository does
not currently pin exact toolchain versions. Full details,
troubleshooting, and the Firebase emulator runbook live in
`docs/DEVELOPMENT.md`.

```powershell
git clone <repository-url>
cd projectRent

docker compose up -d db            # PostgreSQL on host :5433

cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1       # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy ..\.env.example .env          # macOS/Linux: cp ../.env.example .env
alembic upgrade head               # head: 0018
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

```powershell
cd frontend
npm install
npm run dev                        # http://localhost:3000
```

Verify: `http://localhost:8000/healthz` → `{"status":"ok"}`;
`http://localhost:8000/readyz` → `{"status":"ready","db":"up"}`.

## Checks

```powershell
cd backend
pytest -q                          # backend suite

cd ../frontend
npm run test                       # frontend suite (vitest)
npm run typecheck                  # tsc --noEmit
npm run build                      # production build
```

## Environment variables

* `.env.example` (repository root) is committed and holds **development-only**
  template values, including the B2 block (`B2_ENDPOINT_URL`,
  `B2_BUCKET_NAME`, `B2_ACCESS_KEY_ID`, `B2_SECRET_ACCESS_KEY`).
* Each teammate copies it to `backend/.env` for local runs.
* The frontend uses `frontend/.env.example` → `.env.local`
  (`NEXT_PUBLIC_*` only — no secrets).
* Real `.env` files must **never** be committed (already in `.gitignore`).
* Secrets must never be placed in source code — only in environment
  configuration. No production credentials exist in this repository.

## Development workflow

1. Pull the latest changes for your base branch.
2. Create a feature branch for one small slice of work.
3. Make the change (keep it small and reviewable).
4. Run the relevant checks (`pytest -q`, `npm run test`, `npm run typecheck`, `npm run build`).
5. Review your own diff before committing.
6. Commit with a clear message describing what and why.
7. Push the branch.
8. Open a pull request.
9. Address review feedback.
10. Merge after approval.

Branch and commit conventions: see `docs/CONTRIBUTING.md`.
Test results: see `docs/DEVELOPMENT.md` (record figures scoped to a commit, never bare totals).

## Phase-based development

Work lands incrementally, one phase at a time. Current state and next
priorities live in `docs/PROJECT_STATUS.md`; the authoritative technical
reference is `docs/SYSTEM_DESIGN.md`.

Each phase is approved before the next begins. Do not implement future
phases early.
