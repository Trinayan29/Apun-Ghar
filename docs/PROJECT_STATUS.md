# Project Status

Last updated: Phase 0 completion.

## Current phase

**Phase 0 — Foundation: COMPLETE.**
Phase 1 (Authentication + Profiles) has NOT started.

## Completed work

* Simple monorepo: `frontend/`, `backend/`, `docs/`, plus
  `docker-compose.yml`, `.env.example`, `README.md`, `.gitignore`.
* Backend skeleton: FastAPI app with `GET /healthz` (liveness) and
  `GET /readyz` (database reachability), SQLAlchemy setup, one real
  table (`locations`), one Alembic migration (`0001`), one seed script
  (3 Guwahati records), one passing test.
* Frontend skeleton: Next.js (App Router) + TypeScript + Tailwind placeholder
  page with `dev`, `build`, `start`, and `typecheck` scripts.
* Local PostgreSQL via Docker Compose (database container only).
* Environment flow: `.env.example` template → `backend/.env`, loaded by both
  the app and Alembic. No secrets in source.

## Verification results (all passing)

* Docker PostgreSQL container runs (`docker compose ps`: Up).
* Database is exposed on **host port 5433** (container port 5432).
* `alembic upgrade head` succeeds; `alembic current` shows `0001 (head)`.
* `python -m app.seed` succeeds (3 Guwahati locations).
* `GET /healthz` returns `{"status":"ok"}`.
* `GET /readyz` returns `{"status":"ready","db":"up"}`.
* `pytest -q`: 1 passed.
* `npm run typecheck`: clean.
* `npm run build`: succeeds, static pages prerendered.

## Current architecture

Modular monolith (single FastAPI service, single PostgreSQL database),
mobile-first Next.js web app. Deliberately boring: no workers, no cache
server, no search engine, no real-time layer.

## Next phase

Phase 1 — Authentication + Profiles: Firebase Authentication sign-in,
backend user sync with roles in PostgreSQL, tenant/owner profiles.

## Deferred features

Everything not in Phase 0: listings, search/filters, details/favorites/
compare, messaging, visits, moderation/reviews/reports, roommates,
payments/booking, KYC/government-ID handling, native video processing,
recommendations, and all future infrastructure (Redis, Elasticsearch/
OpenSearch, background workers, WebSockets, event bus, microservices,
Kubernetes).

## Important architectural decisions

1. Simple monorepo (`frontend/`, `backend/`, `docs/`) — no workspaces or
   build orchestration for a 2–4 person team.
2. FastAPI + PostgreSQL is the application authority; Firebase only proves
   identity (from Phase 1 on). Frontend role claims are never trusted.
3. Trust in MVP is transparent signals (phone/owner/listing verified,
   response rate, reviews, member-since) — no numerical score, no ID docs.
4. Postgres-only search to start; `pg_trgm`/PostGIS enabled just-in-time.
5. Dev database credentials live in environment configuration
   (`.env.example` → `backend/.env`), never in Python source.

## Known limitations

* **PostgreSQL host port is 5433, not 5432.** During verification we found
  the native Windows PostgreSQL service already occupies host port 5432,
  so connections to `localhost:5432` reach the native server instead of the
  container (this first appeared as `password authentication failed for
  user "rent"`). The compose file therefore maps the container to host
  port 5433, and all defaults use 5433. The native installation was left
  untouched.
* Only one backend test and frontend typecheck exist so far; per-feature
  tests arrive with each phase.
* No CI yet — added once the foundation is committed and stable.
* No Git remote is configured yet.
