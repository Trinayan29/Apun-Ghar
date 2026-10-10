# AGENTS.md — instructions for coding agents working in this repo

Apun-Ghar is a rental marketplace monorepo: FastAPI backend +
PostgreSQL, production Next.js frontend, and a disconnected UX
prototype. Read `README.md`, then `docs/SYSTEM_DESIGN.md` (the
authoritative technical reference), then `docs/DEVELOPMENT.md` for
commands. Status and next steps: `docs/PROJECT_STATUS.md`.

## Repository map

* `backend/` — FastAPI modular monolith (`app/`), Alembic
  (`alembic/versions/0001–0018`, head `0018`), pytest (`tests/`,
  15 files). API on `:8000`. DB on host `:5433`.
* `frontend/` — production Next.js 16 + React 19 + TS + Tailwind v4 +
  Vitest. Dev server on `:3000`.
* `design-prototype/` — **separate** Next.js app, own `package.json`
  and `node_modules`, dev server on `:3100`. Zero backend calls
  (localStorage only). Validate it with its own scripts; never assume
  the production build covers it.
* `docs/` — `SYSTEM_DESIGN.md` (authority), `PROJECT_STATUS.md`,
  `DEVELOPMENT.md`, `CONTRIBUTING.md`, `supply-strategy.md`,
  `decisions/` (architectural decision records).

## Verified commands

Backend (from `backend/`, venv active): `pytest -q`.
Frontend (from `frontend/`): `npm run test`, `npm run typecheck`,
`npm run build`. Prototype (from `design-prototype/`): `npm run
typecheck`, `npm run build`.

## Known test state (do not "fix" these)

The backend suite carries **15 pre-existing failures** in
`test_2b_models.py` (5) and `test_models.py` (10), caused by
local-PostgreSQL data pollution (tests assuming an empty database).
They reproduce on a pristine tree and are unrelated to feature work.
Report them as pre-existing; do not modify those files to make them
pass.

Vitest's `include` allow-list is limited to `lib/**` and the two
dashboard/wizard `_components/` directories (`frontend/vitest.config.ts`).
The 22 currently tracked tests all match that list; place any new test in
one of those locations so it actually runs.

## Test isolation conventions (follow them)

* Backend: per-test DB cleanup keyed by uid prefix; module engine
  fixture skips when PostgreSQL is unreachable; assert DB state through
  independent sessions, not just HTTP status.
* Frontend: inject API functions as props rather than mocking modules;
  `// @vitest-environment jsdom` per DOM file; explicit `cleanup()`.

## Git discipline (recommendations — follow unless told otherwise)

* Conventional commits: `feat:` / `fix:` / `docs:` / `test:` /
  `chore:`, short imperative scope + subject.
* One logical feature per commit; stage exact paths, never `git add .`.
* Never commit: `.env` files, `.venv/`, `node_modules/`, `.next/`,
  `__pycache__/`, database data, `next-env.d.ts` (generated), or
  unreviewed AI/agent run metadata files. Tracked `AGENTS.md` itself is
  a deliberate repository instruction file, not run metadata.
* Never modify a committed Alembic migration — always add a new one.
* Never push, amend, reset, clean, or stash unless explicitly asked.
* Never claim a test, build, or browser check passed unless it actually
  ran and passed; distinguish previously-observed results from current
  verified runs.

## Security safeguards

* Roles live in PostgreSQL and are enforced server-side
  (`require_role`); never trust role or ownership claims from the
  client. Ownership errors are 404, never 403 (no leaking existence).
* No custom password storage; Firebase owns credentials.
* B2 credentials live only in env vars; the browser only ever receives
  short-lived presigned URLs. Never log or commit secrets, tokens,
  keys, or signed URLs.
* Failing closed beats failing open: storage errors → 503 with DB rows
  untouched; guard failures → 422/404 with no partial mutation.

## Documentation rules

* `docs/SYSTEM_DESIGN.md` is the single source of truth; fix it rather
  than duplicating material elsewhere.
* Record test figures scoped to a commit hash + date, never as bare
  absolutes. Describe endpoint structure; treat `@router` decorators
  as the source of truth rather than duplicating full tables.
* Distinguish implemented vs planned vs deferred in every claim.
  Do not document unverified behavior as complete.
