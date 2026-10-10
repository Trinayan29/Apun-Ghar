# Development guide

Local setup, daily commands, tests, database work, and troubleshooting
for Apun-Ghar. Product and architecture context lives in
`docs/SYSTEM_DESIGN.md`; current status in `docs/PROJECT_STATUS.md`.

## Services and ports

| Service | Address | Notes |
|---|---|---|
| Production frontend | `http://localhost:3000` | `npm run dev` in `frontend/` |
| Design prototype | `http://localhost:3100` | `npm run dev` in `design-prototype/` (separate app) |
| Backend API | `http://localhost:8000` | `uvicorn app.main:app --reload --port 8000` in `backend/` |
| PostgreSQL | host `:5433` → container `:5432` | Docker Compose `db` service, `pgdata` volume |
| Firebase Auth Emulator | `http://127.0.0.1:9099` | `firebase emulators:start --only auth --project demo-apun-ghar` |
| Emulator UI | `http://127.0.0.1:4000` | Inspect test users |

Port 5433 is deliberate: many Windows machines already run a native
PostgreSQL on 5432. All defaults (`.env.example`, Compose file) use
5433.

## First-time setup

```powershell
git clone <repository-url>
cd projectRent

docker compose up -d db

cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example .env
alembic upgrade head        # head: 0018
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

```powershell
cd frontend
npm install
npm run dev
```

Verify: `/healthz` → `{"status":"ok"}`; `/readyz` →
`{"status":"ready","db":"up"}`.

Without Docker (not recommended): install PostgreSQL locally, copy
`.env.example` to `backend/.env`, edit `DATABASE_URL` to match, then
run the same `alembic` / `seed` / `uvicorn` commands.

## Daily commands

```powershell
docker compose up -d        # start PostgreSQL
docker compose ps           # container status and port mapping
docker compose down         # stop (data kept in pgdata volume)

cd backend
alembic upgrade head        # apply migrations
alembic current             # applied revision (head: 0018)
python -m app.seed          # idempotent Guwahati seed locations

cd ../frontend
npm run dev                 # :3000
npm run build               # production build
npm run start               # serve the production build

cd ../design-prototype
npm run dev                 # :3100 (never clashes with :3000)
```

## Environment variables

* Root `.env.example` → copy to `backend/.env`. Covers `DATABASE_URL`,
  `POSTGRES_*`, Firebase emulator/project settings, and the `B2_*`
  block (`B2_ENDPOINT_URL`, `B2_BUCKET_NAME`, `B2_ACCESS_KEY_ID`,
  `B2_SECRET_ACCESS_KEY`; optional `B2_REGION`,
  `B2_UPLOAD_EXPIRES_IN=900`, `B2_VIEW_EXPIRES_IN=3600`).
* `frontend/.env.example` → copy to `frontend/.env.local`
  (`NEXT_PUBLIC_*` only — no secrets).
* The prototype needs no env files (no backend calls, no credentials).
* Real `.env` files must never be committed (gitignored). No production
  credentials exist in this repository.

## Tests

Backend (from `backend/`, venv active):

```powershell
pytest -q                     # full suite
pytest tests/test_cors.py -q  # focused file
```

Conventions: FastAPI `TestClient`; canned Firebase claims via
dependency override; per-test DB cleanup keyed by uid prefix
(`t2e-owner-1`, …); module engine fixture that **skips** when
PostgreSQL is unreachable. Assert DB state through independent
sessions, not just HTTP status codes.

Frontend (from `frontend/`):

```powershell
npm run test        # vitest run (22 files)
npm run typecheck   # tsc --noEmit
```

Conventions: `lib/**/*.test.ts` for pure logic; `app/**/_components/
*.test.tsx` + `// @vitest-environment jsdom` + Testing Library for
components; API functions injected as props rather than module-mocked.

Prototype (from `design-prototype/`): `npm run typecheck`, `npm run
build`. It has no test suite.

### Last verified results (commit-scoped — re-run, don't quote blindly)

* Backend at `bf8e100` (2026-10-08): **486 passed, 15 failed** — the 15
  are pre-existing local-PostgreSQL data-pollution failures in
  `test_2b_models.py` (5) and `test_models.py` (10); they reproduce on a
  pristine tree and are unrelated to feature work.
* Frontend after the Your-Places draft-deletion work: **473 passed, 0
  failed** across 22 files. The exact commit containing that frontend
  result was not preserved, so treat it as historical until it is
  re-verified and re-scoped.

## Database work

* Migrations are **append-only**: never modify a committed migration;
  create a new one (`alembic revision --autogenerate -m "<change>"`,
  review it, `alembic upgrade head`).
* Single linear chain, head `0018`. `alembic heads` must show exactly
  one head.
* Seed is idempotent: `python -m app.seed`.

## Troubleshooting

* `password authentication failed for user "rent"` → you are talking to
  a native PostgreSQL on 5432 instead of the container; use host port
  5433 (`DATABASE_URL=postgresql+psycopg://rent:rent@localhost:5433/rent`).
* Backend 401s in dev → Firebase emulator not running, or the frontend
  is pointed at a real project; check `FIREBASE_AUTH_EMULATOR_HOST`
  and `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`.
* `pytest` skips with "PostgreSQL is not reachable" → start the
  container (`docker compose up -d db`).
* `next-env.d.ts` flipping between `./.next/types/` and
  `./.next/dev/types/` → generated noise from alternating `next dev`
  and `next build`; never commit it intentionally.
* Missing B2 credentials make `photos:init` and `photos:confirm`
  return 503 (`require_storage()` is required). Photo reads (`GET`),
  photo PATCH/DELETE, publish, pause, and draft deletion use optional
  storage: reads degrade to `view_url: null`, while a failed storage
  mutation returns 503 with DB rows untouched.
* Vitest file not running → a test outside the `include` allow-list in
  `vitest.config.ts` (`lib/**` and the two `_components/` directories)
  will not run. The 22 currently tracked tests all match the allow-list.
