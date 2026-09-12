# Contributing

## Project philosophy

Small slices, boring technology, verified by running it. Prefer simple,
explicit code a new teammate can understand over clever abstractions.
Do not add dependencies, modules, or infrastructure the current phase
does not need.

## Local setup

Follow `README.md` (sections "Prerequisites" through "Local setup").
The short version from the repository root:

```powershell
docker compose up -d db
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example .env
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

```powershell
cd frontend
npm install
npm run dev
```

## Branch naming

Short-lived branches off the base branch:

* `phase-<n>-<short-topic>` for phase work (e.g. `phase-1-firebase-sync`)
* `fix/<short-topic>` for fixes (e.g. `fix/seed-idempotency`)
* `docs/<short-topic>` for documentation-only changes

One branch = one reviewable slice.

## Commit expectations

* Small, logically separated commits (e.g. migration, then API, then UI —
  not all three in one commit).
* Message format: `<area>: <what and why>` (e.g. `backend: add visit
  accept endpoint with owner check`).
* Never commit: `.env` files, credentials, virtual environments
  (`.venv/`), `node_modules/`, build output (`.next/`, `__pycache__/`),
  database data, or AI/agent metadata files.

## Testing before a PR

Backend (from `backend/`, virtual environment active):

```powershell
pytest -q
```

Frontend (from `frontend/`):

```powershell
npm run typecheck
npm run build
```

A PR is not ready if any of these fail. New behavior should come with a
test in the same PR.

## How to add a backend feature

1. Add or extend the SQLAlchemy model in `backend/app/models.py`.
2. Create a migration: `alembic revision --autogenerate -m "<change>"`,
   review the generated file, then `alembic upgrade head`.
3. Add the Pydantic schemas and the router with server-side authorization
   checks (never trust role or ownership claims from the client).
4. Cover it with a test in `backend/tests/`.
5. Run `pytest -q`.

## How to add a frontend feature

1. Build inside `frontend/app/` (routes) or a feature folder; reuse the
   existing UI primitives before adding new ones.
2. Call the backend through the shared API client layer — never talk to
   the database directly.
3. Validate forms on the client and handle loading, empty, and error
   states for every new screen.
4. Run `npm run typecheck` and `npm run build`.

## Database migration rules

* **Never modify an Alembic migration that has already been
  committed/shared.** Create a new migration for every schema change.
  Example:

```powershell
alembic revision --autogenerate -m "add visits table"
alembic upgrade head
```

* Keep migrations reviewable: one logical schema change per revision.
* Seed data must stay idempotent (safe to run twice), like the current
  `python -m app.seed`.

## Environment variable rules

* `.env.example` is the only committed template; update it whenever a new
  variable is required.
* Real `.env` files stay local and are never committed.
* Secrets never go into source code, migration files, tests, or docs —
  only into environment configuration.

## Code quality expectations

* Typecheck-clean TypeScript, warning-free test runs.
* No unused dependencies, placeholder modules, speculative interfaces, or
  commented-out code.
* Mobile-first (360–430px) for every UI change; desktop enhances, not the
  other way around.

## Deferred infrastructure — approval required

Do NOT introduce Redis, Elasticsearch/OpenSearch, background workers,
WebSockets, event buses, microservices, Kubernetes, payments, government-
ID/KYC handling, native video processing, or Phone OTP / SMS
authentication without explicit architecture approval. If a phase seems
to need one of these, write down the concrete requirement first and get
agreement before adding it.
