# Project Status

Last updated: Phase 4A (Property-Lister Account) completion.

## Current phase

**Phase 0 — Foundation: COMPLETE.**
**Phase 1 — Authentication + Profiles: COMPLETE.**
**Phase 3B — Renter Experience: COMPLETE.**
**Phase 4A — Property-Lister Account: COMPLETE.**
Phase 2 (marketplace: properties, listings, search) has NOT started.

## Completed work

* Simple monorepo: `frontend/`, `backend/`, `docs/`, plus
  `docker-compose.yml`, `.env.example`, `README.md`, `.gitignore`.
* Backend: FastAPI app with `GET /healthz` (liveness) and
  `GET /readyz` (database reachability), SQLAlchemy setup, `locations`,
  `users` (+ `phone_number`), and `user_profiles` tables, Alembic
  migrations `0001`–`0006` (head: `0006`), seed script (Guwahati
  locations), 125 passing tests.
* Firebase Authentication architecture (Email/Password + Google),
  Firebase Auth Emulator for local development, server-side ID-token
  verification, on-demand user provisioning, `USER` / `OWNER` / `ADMIN`
  role model, protected profile endpoints, CORS for the local frontend.
* Frontend: Next.js (App Router) + TypeScript + Tailwind. Renter
  welcome/entry, signup/login, location-backed onboarding, profile,
  and the separate property-lister (owner) experience: owner signup/
  login, Owner Studio dashboard, and owner account page.
* Local PostgreSQL via Docker Compose (database container only).
* Environment flow: `.env.example` template → `backend/.env`, loaded by
  the app. No secrets in source.

## Verification results (all passing)

* Docker PostgreSQL container runs (`docker compose ps`: Up).
* Database is exposed on **host port 5433** (container port 5432).
* `alembic upgrade head` succeeds; `alembic current` shows `0006 (head)`;
  `alembic heads` shows a single head.
* `python -m app.seed` succeeds (idempotent Guwahati locations).
* `GET /healthz` returns `{"status":"ok"}`.
* `GET /readyz` returns `{"status":"ready","db":"up"}`.
* `pytest -q`: 125 passed.
* `npm run typecheck`: clean.
* `npm run build`: succeeds, static pages prerendered (including the
  `/owner/*` routes).
* Phase 4A manual verification completed against the Firebase Auth
  Emulator + local PostgreSQL (fresh owner email signup → OWNER,
  owner provisioning without prior USER creation, invalid-data retry,
  existing OWNER login, USER conflict without promotion); all temporary
  test accounts were removed from both stores afterward.

## Current architecture

Modular monolith (single FastAPI service, single PostgreSQL database),
mobile-first Next.js web app. Deliberately boring: no workers, no cache
server, no search engine, no real-time layer.

## Phase 1 — Slice 1: local Firebase Auth Emulator (COMPLETE)

Slice 1 is done. No application `firebase` or `firebase-admin`
dependencies were added in that slice; no auth code existed yet
(auth code arrived in Slice 2A).

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

## Phase 1 — Slice 2A: backend token verification (COMPLETE)

* `firebase-admin` dependency; `app/auth.py` verifies Bearer ID tokens
  via the Admin SDK and returns claims, else 401. No user sync yet.
* Local dev sets `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` (in
  `.env.example`); production uses `GOOGLE_APPLICATION_CREDENTIALS`
  (never committed).

## Phase 1 — Slice 2B: user models + migration (COMPLETE)

* `User` (`users`: integer PK, unique `firebase_uid`, unique nullable
  `email`, `email_verified`, `role` default `USER` with DB CHECK,
  timestamps) and `UserProfile` (`user_profiles`: PK+FK `user_id` with
  `ON DELETE CASCADE`, all-optional college/workplace/budgets/move-in
  date, non-negative budget CHECKs).
* Single migration `0002` (down_revision `0001`); upgrade → downgrade →
  upgrade round-trip verified against the local container database.
* 9 model tests (defaults, role/UID/email/budget constraints, FK,
  cascade); full suite green. No auth logic, endpoints, or role
  mutation in this slice.

## Phase 1 — Slice 2C: provisioning + GET /users/me (COMPLETE)

* `app/users.py`: `get_or_create_current_user` (UID from verified
  claims; existing user synced for email/email_verified with
  collision-safe updates, display_name set only at creation; new user +
   empty profile in one transaction, role `USER`; UNIQUE-race retry
  via rollback + re-query) and `GET /api/v1/users/me` (`UserRead`
  response, no claim leakage). No profile endpoints, no role
  mutation.
* 9 endpoint tests (401s, create/reuse, sync policy, UID-not-email,
  collision paths, race recovery, 500-not-401, no-leak); live emulator
  integration verified (create → reuse without duplicates → 401 on bad
  token); dev database left clean.

## Phase 1 — Slice 2D: self profile + role enforcement (COMPLETE)

* `GET /api/v1/users/me/profile` and `PATCH /api/v1/users/me/profile`
  (partial updates, explicit-null clearing, 422 on bad budgets/range/
  unknown fields; identity and role fields unpatchable; profile always
  resolved from the verified token, never a client user ID).
* `auth.get_current_user` + reusable `require_role(...)` (role from the
  PostgreSQL record only; 401 unauthenticated, 403 wrong role).
* Renter profile APIs are restricted to `USER` (`require_role("USER")`),
  so `OWNER` accounts receive 403 instead of a renter profile.
* 21 profile/role tests green; live emulator integration verified
  (empty profile → PATCH → persisted; bad token → 401); dev database
  left clean.

## Role model correction — `STUDENT` renamed to `USER` (COMPLETE)

* Authorization roles are now `USER` / `OWNER` / `ADMIN` (default
  `USER`). The role describes platform permissions, not whether the
  renter is a student; Apun-Ghar serves students and young
  professionals alike.
* Single migration `0005` (down_revision `0004`): moves existing
  `STUDENT` rows to `USER`, switches the `ck_users_role` CHECK to
  `USER` / `OWNER` / `ADMIN`, and updates the `role` server default.
  Downgrade restores `USER` rows to `STUDENT` before restoring the old
  CHECK. Upgrade → downgrade → upgrade round-trip verified.
* The profile UI no longer displays the role label; role remains
  backend authorization data only.

## Phase 1 — Authentication + Profiles (COMPLETE)

Implemented (replaces the earlier not-started plan):

* Firebase Email/Password sign-up and login.
* Google Sign-In via Firebase popup.
* Firebase ID token handling in Next.js (`AuthProvider`, central API
  wrapper attaching `Authorization: Bearer` tokens; tokens are never
  stored in `localStorage`).
* FastAPI verification of Firebase ID tokens (Firebase Admin SDK).
* User synchronization into PostgreSQL on first verified request.
* Server-side roles (`USER` / `OWNER` / `ADMIN`, default `USER`).
* Renter profile creation/update, onboarding, protected endpoints.
* Proper logout / session handling via Firebase Auth state.
* Authentication and authorization tests (auth, users/me, profile,
  CORS suites green).

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

### Implemented flows

Email/password (renter):
Next.js → Firebase Auth → Firebase ID token → FastAPI → verify token →
PostgreSQL user → application session/state.

Google (renter):
Next.js → Firebase Auth → Firebase ID token → FastAPI → verify token →
PostgreSQL user → application session/state.

Owner flows differ: see Phase 4A below. The critical rule is that a
fresh owner Firebase identity reaches `POST /api/v1/owners/signup`
before any `GET /api/v1/users/me` call, because `/users/me`
auto-provisions unknown identities as `USER`.

### Database model (as implemented)

* `users`: Firebase UID (unique, links identity to application user),
  application role (`USER` / `OWNER` / `ADMIN`; new users default to
  `USER`; no role-mutation API), basic account fields including nullable
  `phone_number` (populated for owners; no SMS authentication attached).
  No password column — passwords are never stored in PostgreSQL.
* `user_profiles`: renter-only application-specific profile data
  (college/workplace, budget, move-in preferences). `OWNER` accounts do
  NOT receive a `user_profiles` row.

### Security requirements (as implemented)

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
passwords ourselves). Owner phone numbers are collected/stored as contact
data only — they are NOT used for SMS authentication. The architecture
must not preclude adding phone verification/OTP later as an additional
sign-in or trust-verification method, but it is not an MVP requirement.

Also not introduced: PyOTP, SMS providers (Twilio/MSG91/etc.),
Redis, microservices, or any other authentication infrastructure.

## Phase 3B — Renter Experience (COMPLETE)

* Welcome/entry experience (`/`): marketing for visitors, preference
  summary and onboarding nudge for signed-in renters.
* Renter signup/login (`/signup`, `/login`): email/password + Google,
  client validation, friendly Firebase error messages, owner entry link.
* Location-backed onboarding (`/onboarding`): 3 optional steps —
  college search, workplace search, budget chips/custom range plus
  move-in date — with save-as-you-go, skip-freely, and resume/prefill.
* Renter profile (`/profile`): view/edit college, workplace, budgets,
  move-in date; sign out.
* Saved onboarding completion state: per-Firebase-UID `localStorage`
  flag (`ag-onboarding-done:<uid>`), renter-only.
* Public entry UX: owner intro page and owner links that grant nothing
  by themselves.
* Mobile-first responsive implementation (360px/390px/desktop verified
  patterns, 44px touch targets).

## Phase 4A — Property-Lister Account (COMPLETE)

Property listers (`OWNER`) are a **separate account type**, not a
promoted renter. Both account types use the same Firebase
Authentication project.

* Dedicated owner routes: `/list-your-property` (entry),
  `/owner/signup`, `/owner/login`, `/owner/dashboard` (Owner Studio),
  `/owner/account`.
* Owner email/password signup: Firebase account → display name saved →
  `POST /api/v1/owners/signup` → dashboard. No `getMe()` before
  provisioning, enforced with an explicit in-flight guard (fixes an
  auth-state race that could otherwise auto-provision the fresh
  identity as `USER`).
* Owner Google signup: popup → mandatory name/phone completion step →
  `ownerSignup` → dashboard. No role pre-check via `getMe()`; existing
  non-OWNER identities surface as `409 ACCOUNT_TYPE_CONFLICT`.
* Owner phone number collection: mandatory, schema-validated
  (`^\+?[0-9]{7,15}$`), stored on the user record as contact data.
  It is NOT used for SMS authentication.
* Server-side `OWNER` role assignment (`app/owners.py`,
  `POST /api/v1/owners/signup`): Firebase token verified, UID taken
  from verified claims, client cannot choose its role, strict
  `extra="forbid"` body (`display_name`, `phone_number` only).
* No `USER` → `OWNER` promotion exists. Existing `OWNER` provisioning
  is idempotent (200); existing `USER`/`ADMIN` gets 409 and is never
  mutated.
* `USER`/`OWNER` separation: `OWNER` receives no renter `UserProfile`;
  owner flows never touch renter onboarding storage; authenticated
  `OWNER` visiting renter auth/onboarding/profile routes is sent to
  Owner Studio; renter profile APIs reject `OWNER` (403).
* Owner dashboard: separate property-management mental model (identity
  band, honest empty/coming-soon states — no fake listings, enquiries,
  views, or revenue).
* Owner account page: real identity from `/users/me`, Firebase sign-out.
* Backend role enforcement unchanged and authoritative; `require_role`
  gating; race-safe provisioning.
* Manual verification completed (fresh email signup, Google-equivalent
  provisioning, invalid-data retry, existing OWNER login, USER
  conflict); temporary test accounts cleaned from the emulator and
  PostgreSQL afterward.

Current product decision — property-lister accounts do NOT require:

* admin approval
* KYC
* ownership documents
* SMS OTP
* phone verification

Owner property creation/listing functionality is NOT yet implemented —
that is Phase 2 work.

## Deferred features

Everything not in Phases 0–4A: property/listing models, add-property
workflow, photos, listing publishing, search/filters,
details/favorites/compare, messaging, visits, moderation/reviews/
reports, roommates, payments/booking, native video processing,
recommendations, and all future infrastructure (Redis, Elasticsearch/
OpenSearch, background workers, WebSockets, event bus, microservices,
Kubernetes).

Verification/moderation workflows (including any future KYC or
government-ID handling) are **not currently required** for
property-lister accounts and no such pipeline exists. Phone OTP / phone
verification remains a future enhancement, not MVP authentication
(owner phone numbers are contact data, not SMS-auth factors).

## Important architectural decisions

1. Simple monorepo (`frontend/`, `backend/`, `docs/`) — no workspaces or
   build orchestration for a 2–4 person team.
2. FastAPI + PostgreSQL is the application authority; Firebase only proves
   identity. Frontend role claims are never trusted.
3. Two separate account types share one Firebase project: renters
   (`USER`, onboarding/profile) and property listers (`OWNER`, Owner
   Studio). Neither converts into the other.
4. Trust in MVP is transparent signals — no numerical score, no ID docs,
   no mandatory verification gate for lister accounts at this stage.
5. Postgres-only search to start; `pg_trgm`/PostGIS enabled just-in-time.
6. Dev database credentials live in environment configuration
   (`.env.example` → `backend/.env`), never in Python source.
7. MVP authentication is Firebase Email/Password + Google Sign-In only.
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
* Backend suite is green (125 pytest tests); frontend relies on
  `typecheck` + production `build` plus manual emulator verification —
  no frontend unit-test framework yet.
* No CI yet — added once the foundation is committed and stable.
* No Git remote is configured yet.
