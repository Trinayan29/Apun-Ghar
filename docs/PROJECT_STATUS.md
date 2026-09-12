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

## Phase 1 — Slice 1: local Firebase Auth Emulator (COMPLETE)

Slice 1 is done. Slice 2 is NOT started. No application `firebase` or
`firebase-admin` dependencies have been added; no auth code exists.

* Firebase CLI installed (verified with v15.30.0; Java 21 confirmed
  working — Java 11+ is required).
* Auth Emulator configured in the repository's `firebase.json`; no manual
  setup needed after cloning.
* Auth Emulator API: `http://127.0.0.1:9099`
* Emulator UI: `http://127.0.0.1:4000` (open in a browser to inspect
  test users)
* Local project ID: `demo-apun-ghar`. The `demo-` prefix means no real
  Firebase project, no login, and no billing are involved.
* Emulator test data is ephemeral: test users disappear when the
  emulator stops, so no manual cleanup is needed. Emulator data is
  never production data.
* Verified working: sign-up, sign-in (real JWT issued), and UI
  reachability were all exercised against the local emulator.

Start (from repository root):

```powershell
firebase emulators:start --only auth --project demo-apun-ghar
```

Stop: `Ctrl+C` in that terminal.

### Beginner workflow (new developer)

Prerequisites: Node.js/npm, Firebase CLI (`npm install -g firebase-tools`),
Java 11+.

1. Clone the repository.
2. Install the Firebase CLI (once per machine).
3. From the repository root, run the start command above.
4. Open `http://127.0.0.1:4000` if you want the visual UI.
5. Stop with `Ctrl+C` when done.

### Local vs. future production

LOCAL DEVELOPMENT (now):

Next.js → Firebase Auth Emulator → FastAPI → local PostgreSQL.

FUTURE PRODUCTION (later, not configured):

Next.js → real Firebase Authentication → production backend →
production PostgreSQL.

The emulator is ONLY for local development/testing — real users will
never touch it. A real production Firebase project will be configured
later; do NOT create one now, and do NOT create a separate development
project unless it becomes genuinely necessary.

## Phase 1 plan — Authentication + Profiles (NOT started)

Nothing below is implemented. Firebase is not configured.

### Scope

* Firebase Email/Password sign-up and login (with email verification
  where appropriate)
* Google Sign-In via Firebase
* Firebase ID token handling in Next.js
* FastAPI verification of Firebase ID tokens (Firebase Admin SDK)
* User synchronization into PostgreSQL on first verified request
* Server-side roles (`STUDENT` / `OWNER` / `ADMIN`, default `STUDENT`);
  user profile creation and update
* Proper logout / session handling
* Authentication and authorization tests

### Owner onboarding — Phase 2, explicitly not Phase 1

Apun-Ghar will support two intents: "I'm looking for a home" (renter)
and "I want to list a place" (owner). The eventual owner flow is:
sign up → choose "I want to list a place" → create account → complete
owner onboarding → verification/review → ADMIN approval → OWNER role →
create and manage listings.

Phase 1 implements NONE of that: no owner onboarding, no owner
verification, no listing creation, and no self-service "Become an Owner"
role-mutation endpoint. New accounts default to `STUDENT`; `OWNER` and
`ADMIN` stay controlled server-side, with `OWNER` accounts provisioned
manually/bootstrap for development and testing only.

### Responsibilities

Firebase (proves identity, owns credentials):

* Authentication credentials, Firebase UID
* Email/password authentication, Google identity
* Session/token issuance (ID tokens)

FastAPI (application authority):

* Verify every Firebase ID token server-side
* Identify the application user from the verified UID
* Create/synchronize the PostgreSQL user record
* Enforce authorization on every protected endpoint
* Never trust role information supplied by the frontend

PostgreSQL (source of truth for application data):

* Application user record (including Firebase UID and role)
* Profile: college/workplace, budget, move-in preferences
* Other application-specific data (never passwords)

### Expected flows

Email/password:
Next.js → Firebase Auth → Firebase ID token → FastAPI → verify token →
PostgreSQL user → application session/state.

Google:
Next.js → Firebase Auth → Firebase ID token → FastAPI → verify token →
PostgreSQL user → application session/state.

### Database model (planning level)

* `users`: Firebase UID (unique, links identity to application user),
  application role (`STUDENT` / `OWNER` / `ADMIN`; new users default to
  `STUDENT`; no role-mutation API in Phase 1), plus basic account fields.
  No password column — passwords must never be stored in PostgreSQL.
* `user_profiles`: application-specific profile data
  (college/workplace, budget, move-in preferences). Fields stay minimal
  until Phase 1 implementation; no over-specification now.

### Security requirements

* No custom password storage or hashing, no custom auth tokens.
* Firebase Admin SDK server-side verification in FastAPI.
* Frontend role claims never trusted; every protected endpoint performs
  server-side authentication/authorization.
* Firebase configuration/secrets never committed; new variables documented
  through `.env.example`.
* Tests for account creation, authentication, and profile operations.

### Explicitly deferred: Phone OTP

Phone OTP / phone verification is a **future enhancement, not required
for MVP authentication**. Reason: phone authentication needs SMS delivery
with billing and quota considerations; Email/Password + Google avoids
those costs while Firebase still manages all credentials (we never store
passwords ourselves). The architecture must not preclude adding phone
verification/OTP later as an additional sign-in or trust-verification
method, but it is not an MVP requirement.

Also not introduced in Phase 1: PyOTP, SMS providers (Twilio/MSG91/etc.),
Redis, microservices, or any other authentication infrastructure.

## Deferred features

Everything not in Phase 0: listings, search/filters, details/favorites/
compare, messaging, visits, moderation/reviews/reports, roommates,
payments/booking, KYC/government-ID handling, native video processing,
recommendations, and all future infrastructure (Redis, Elasticsearch/
OpenSearch, background workers, WebSockets, event bus, microservices,
Kubernetes).

Phone OTP / phone verification — future enhancement, not required for
MVP authentication (see Phase 1 plan above).

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
6. MVP authentication is Firebase Email/Password + Google Sign-In only.
   Phone OTP was deferred to avoid SMS billing/quotas during the MVP;
   it may return later as sign-in or trust verification without
   architectural changes.

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
