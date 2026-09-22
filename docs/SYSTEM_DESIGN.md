# Apun-Ghar — System Design

> Source of truth: the actual repository code (commit `c996013`,
> "feat: add listing publication workflow"). Secondary evidence:
> `docs/PROJECT_STATUS.md`, `docs/PROJECT_TECHNICAL_KNOWLEDGE.md`,
> `docs/PHASE_2A_PROPERTY_LISTING_DESIGN.md`, `README.md`.
> Where the docs and the code disagree, **the code wins** — known
> disagreements are called out explicitly (see §34).
>
> Status words used throughout: **CURRENT** (exists in code),
> **PROTOTYPE** (design-prototype only, not production),
> **PLANNED** (documented intent, not built), **DEFERRED** (explicitly
> postponed).

## Contents

1. [System overview](#1-system-overview)
2. [Architectural style](#2-architectural-style)
3. [Repository architecture](#3-repository-architecture)
4. [Backend system design](#4-backend-system-design)
5. [API architecture](#5-api-architecture)
6. [Authentication architecture](#6-authentication-architecture)
7. [Authorization / RBAC](#7-authorization--rbac)
8. [Database system design](#8-database-system-design)
9. [Core domain model](#9-core-domain-model)
10. [Property domain](#10-property-domain)
11. [Rental-unit domain](#11-rental-unit-domain)
12. [Listing domain](#12-listing-domain)
13. [Publication system](#13-publication-system)
14. [Pricing system](#14-pricing-system)
15. [Photo system](#15-photo-system)
16. [Data flows](#16-data-flows)
17. [Owner listing flow (implementation vs UX)](#17-owner-listing-flow-implementation-vs-ux)
18. [Frontend architecture](#18-frontend-architecture)
19. [Frontend ↔ backend contract](#19-frontend--backend-contract)
20. [Error handling](#20-error-handling)
21. [Security architecture](#21-security-architecture)
22. [Database integrity (enforcement layers)](#22-database-integrity-enforcement-layers)
23. [Deployment architecture](#23-deployment-architecture)
24. [Local development architecture](#24-local-development-architecture)
25. [Test architecture](#25-test-architecture)
26. [Current vs future architecture](#26-current-vs-future-architecture)
27. [Scalability](#27-scalability)
28. [Observability](#28-observability)
29. [Architectural decisions (ADR-style)](#29-architectural-decisions-adr-style)
30. [Risks / technical debt](#30-risks--technical-debt)
31. [Diagram index](#31-diagram-index)
32. [Traceability (UI → route → schema → logic → model → table)](#32-traceability)
33. [Final summary](#33-final-summary)

---

## 1. System overview

**What Apun-Ghar is.** An India-focused rental marketplace, launching
in Guwahati for students and young professionals: PGs, hostels,
private/shared rooms, PG beds, flats, studios, houses — rentals only.
Differentiators per `README.md`: college/workplace-anchored search,
transparent total monthly cost (not just advertised rent), verified
listings, roommate discovery (planned), contact → visit workflow,
mobile-first.

**Who uses it.**

| Actor | Description |
|---|---|
| Renter (`USER`) | Searches, views listings, saves, contacts, visits (search/detail/messaging are mostly planned; profiles + onboarding exist) |
| Owner (`OWNER`) | Separate account type; creates properties → rental units → listings → pricing/photos → publishes/pauses (backend complete through Phase 2E-B) |
| Admin (`ADMIN`) | Role exists in the DB CHECK; **zero routes enforce or use it** (see §7) |
| Firebase Authentication | Proves identity (ID tokens); local dev uses the Auth Emulator |
| Production frontend (`frontend/`) | Next.js App Router web client (renter onboarding/profile + owner account flows) |
| Backend API (`backend/`) | Single FastAPI modular monolith |
| PostgreSQL 17 | Single relational database (Docker, host port 5433) |
| Object storage | **Not present.** Photo records store metadata + `storage_key` only |

**High-level architecture (CURRENT):**

```mermaid
flowchart TB
    subgraph Client["Web clients"]
        FE["Production frontend<br/>Next.js App Router :3000"]
        PROTO["Design prototype<br/>Next.js (disconnected)"]
    end
    subgraph Server["Backend (modular monolith)"]
        API["FastAPI<br/>routers + SQLAlchemy<br/>:8000"]
    end
    DB[("PostgreSQL 17<br/>Docker :5433")]
    FB["Firebase Auth<br/>(emulator :9099 local)"]

    FE -->|HTTPS + Bearer ID token| API
    API -->|SQLAlchemy / psycopg| DB
    API -->|verify ID token| FB
    FE -->|sign-in / Google| FB
    PROTO -.->|no API calls| API
```

The prototype has **no arrow to the backend**: a repository-wide grep
for `fetch(` / `localhost:8000` / `NEXT_PUBLIC_API_BASE_URL` inside
`design-prototype/` returns zero matches. It is a fully disconnected
UX sandbox (localStorage persistence only).

---

## 2. Architectural style

**Backend: modular monolith, REST-ish resource routers, flat
layering.** There is no `services/` or `schemas/` package. Each domain
module (`backend/app/*.py`) owns its router + Pydantic schemas +
validation helpers + business rules, and talks to SQLAlchemy models
directly:

```mermaid
flowchart LR
    REQ["HTTP request"] --> ROUTER["Router<br/>(e.g. listings.py)"]
    ROUTER --> AUTHZ["AuthN/Z<br/>auth.py: require_role"]
    AUTHZ --> VALID["Pydantic schemas<br/>(extra=forbid, Literals)"]
    VALID --> LOGIC["Module helpers<br/>(ownership, guards, C1–C10)"]
    LOGIC --> DBM[("SQLAlchemy models<br/>+ PostgreSQL CHECKs")]
    DBM --> RESP["Pydantic Read model<br/>JSON response"]
```

Why this qualifies: one deployable (`uvicorn app.main:app`), one
database, domain-separated modules with no cross-module service layer,
per-module routers mounted in `main.py`. Request lifecycle evidence:
`Depends(require_role("OWNER"))` → schema validation → helper
(`_owned_listing_or_404`, `_validate_price_item`) → `db.commit()` with
`IntegrityError → rollback → 422/409` → `response_model` serialization.

**Frontend: SSR/CSR hybrid (Next.js App Router).** Static marketing and
form pages prerender; Firebase-driven pages are `"use client"`
components. No SSR data-fetching layer, no caching layer, no state
manager beyond React context (`AuthProvider`) and localStorage
(onboarding draft).

**Prototype: CSR-only mock.** Client components + React context +
localStorage + static mock data. Architecturally unrelated to the
production frontend (separate Next.js app, duplicated component
libraries).

---

## 3. Repository architecture

```mermaid
flowchart TB
    ROOT["projectRent/"]
    ROOT --> FE["frontend/<br/>production web client"]
    ROOT --> BE["backend/<br/>FastAPI + Alembic + pytest"]
    ROOT --> DP["design-prototype/<br/>disconnected UX sandbox"]
    ROOT --> DOCS["docs/<br/>status, knowledge, design"]
    ROOT --> OPS["docker-compose.yml<br/>.env.example<br/>firebase.json<br/>README.md"]
```

| Path | Responsibility |
|---|---|
| `frontend/` | Production Next.js 16 + React 19 + TS + Tailwind v4 app (`rent-frontend`). Renter onboarding/profile + owner account flows |
| `backend/` | FastAPI modular monolith (`app/`), Alembic migrations (`alembic/versions/0001–0012`), pytest suite (`tests/`, 13 files), `requirements.txt` |
| `design-prototype/` | Separate Next.js app: renter mock flows + rebuilt owner listing UX. Zero backend calls |
| `docs/` | `PROJECT_STATUS.md`, `PROJECT_TECHNICAL_KNOWLEDGE.md`, `PHASE_2A_PROPERTY_LISTING_DESIGN.md`, `supply-strategy.md`, `CONTRIBUTING.md`, this file |
| `docker-compose.yml` | PostgreSQL 17 container only (`5433:5432`, `pgdata` volume) |
| `.env.example` | Dev-only template → copied to `backend/.env`; emulator host, demo project id |
| `firebase.json` | Auth Emulator `:9099` + UI `:4000` |
| `README.md` | Setup guide (**stale** in places — see §30) |

There is **no `.github/`** (no CI), no `services/`, no `schemas/`
package, no shared API client package, no infrastructure-as-code
beyond Compose.

---

## 4. Backend system design

**Entrypoint** `backend/app/main.py`: `FastAPI(title="Rent API")`,
CORS (`allow_origins=["http://localhost:3000"]`,
`allow_methods=["GET","POST","PUT","PATCH"]`,
`allow_headers=["Authorization","Content-Type"]`), seven router
registrations, `GET /healthz` (liveness), `GET /readyz` (DB
reachability via `SELECT 1`).

**Module dependency graph (only modules that exist):**

```mermaid
flowchart TB
    MAIN["main.py"]
    AUTH["auth.py<br/>token verify, provisioning, RBAC"]
    DB["db.py<br/>engine, SessionLocal, get_db"]
    MODELS["models.py<br/>10 tables"]
    USERS["users.py<br/>/users"]
    OWNERS["owners.py<br/>/owners"]
    LOC["locations.py<br/>/locations"]
    PROPS["properties.py<br/>/owner/properties"]
    UNITS["rental_units.py<br/>/owner/properties+units"]
    LIST["listings.py<br/>/owner/listings"]

    MAIN --> USERS & OWNERS & LOC & PROPS & UNITS & LIST
    USERS --> AUTH & DB & MODELS & LOC
    OWNERS --> AUTH & DB
    LOC --> DB & MODELS
    PROPS --> AUTH & DB & MODELS & LOC
    UNITS --> AUTH & DB & MODELS
    LIST --> AUTH & DB & MODELS
```

Notes: `owners.py` reuses `UserRead` from `users.py`; `properties.py`
and `users.py` reuse `validate_location_reference` from
`locations.py`. No module imports from another domain's router.

**Session management** (`db.py`): module-level `engine`
(`pool_pre_ping=True`), `SessionLocal(autoflush=False,
expire_on_commit=False)`, `get_db()` generator dependency. Writes use
explicit `db.commit()` with `try/except IntegrityError → rollback →
HTTPException` in every mutating endpoint — no global exception
handler, no unit-of-work abstraction.

**Configuration:** `DATABASE_URL` (default
`postgresql+psycopg://rent:rent@localhost:5433/rent`),
`FIREBASE_PROJECT_ID` (default `demo-apun-ghar`),
`FIREBASE_AUTH_EMULATOR_HOST`, optional
`GOOGLE_APPLICATION_CREDENTIALS`. Loaded via `dotenv`.

**Testing:** pytest + httpx `TestClient(raise_server_exceptions=False)`,
per-file fixtures overriding `get_firebase_claims` with canned claims,
module-scoped engine fixtures that **skip** when PostgreSQL is
unreachable. 13 test files: model/migration/auth/cors/health/
locations/owners/users/profile/2C-properties/2D-units/2E-listings.

---

## 5. API architecture

All endpoints below are read from actual `@router` declarations.
Auth = Firebase Bearer required unless noted. No versioning beyond
`/api/v1`. No pagination envelope (raw JSON arrays + `limit/offset`).

### System

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/healthz` | none | Liveness `{"status":"ok"}` |
| GET | `/readyz` | none | DB reachability `{"status":"ready","db":"up"}` |

### Users & owners

| Method | Path | Auth | Purpose / rules |
|---|---|---|---|
| GET | `/api/v1/users/me` | any token | **Auto-provisions** unknown Firebase uid as `USER` (+ empty profile). Syncs email/verified from claims |
| GET | `/api/v1/users/me/profile` | `USER` | Own renter profile (404/500 shape if missing — `.one()`) |
| PATCH | `/api/v1/users/me/profile` | `USER` | `exclude_unset` partial update; college/workplace FK type-checked; effective `budget_min ≤ budget_max`; else 422 |
| POST | `/api/v1/owners/signup` | any token | Creates OWNER (`display_name` 2–200, `phone` `^\+?[0-9]{7,15}$`); **201 first time, 200 if already OWNER**; 409 `ACCOUNT_TYPE_CONFLICT` if the uid already has another role |

### Locations (public — no auth)

`GET /api/v1/locations?type=college|workplace|area&search=&limit=` —
`ilike` match on name/city, ordered `(name, id)`, `limit` 1–50.
422 on unknown `type`. Backing seed: real Guwahati institutions
(`seed.py` + migration catalog).

### Owner properties (`require_role("OWNER")`, prefix `/api/v1/owner/properties`)

| Method | Path | Rules |
|---|---|---|
| POST | `` | Create; `address_line` stripped non-blank; lat/lng both-or-neither; area/college/workplace FK type-checked; 201 |
| GET | `` | Owner-scoped list, `limit` 20/1–50, `offset`, `id` asc, nested locations eager |
| GET | `/{property_id}` | `_owned_or_404` — missing **or foreign → 404** (no leak) |
| PATCH | `/{property_id}` | `exclude_unset`; explicit null on `property_type/address_line/city` → 422; geo re-validated against merged values |

### Owner rental units (two routers, same `OWNER` gate)

- `POST /api/v1/owner/properties/{property_id}/units` — 201; occupancy triple validated service-side; `amenity_ids` resolved to **active** amenities only (unknown/inactive → 422; explicit `null` → 422 with "use []" message).
- `GET /api/v1/owner/properties/{property_id}/units` — list, id asc, amenities sorted.
- `GET /api/v1/owner/units/{unit_id}` — ownership resolved by join `unit→property→owner`; 404 on foreign.
- `PATCH /api/v1/owner/units/{unit_id}` — `exclude_unset`; omitted `amenity_ids` **preserves** amenities; `[]` clears; failed PATCH leaves DB unchanged (validated before mutation).

### Owner listings (10 endpoints, `OWNER`, prefix `/api/v1/owner/listings`)

| # | Method | Path | Purpose / key rule |
|---|---|---|---|
| 1 | POST | `` | Create; `title` required 2–200; status server-forced `DRAFT`; duplicate active listing per unit → **409** (`uq_listings_unit_active`) |
| 2 | GET | `` | Owner-scoped join list, id asc, eager unit+amenities+prices+photos |
| 3 | GET | `/{id}` | 404 on foreign |
| 4 | PATCH | `/{id}` | Only `title/description/rent_basis`; `title=null` → 422; `status` not accepted; rent-basis change re-checked vs existing RENT rows |
| 5 | POST | `/{id}/availability` | `AVAILABLE_NOW` (date must be null), `AVAILABLE_FROM_DATE` (required, not past), `OCCUPIED` (date null + rejected if `PUBLISHED`) |
| 6 | PUT | `/{id}/price-components` | **Complete atomic replacement** (`[]` clears); full C1–C10 + `rent_basis` consistency pre-validated; duplicate identity → 409 |
| 7 | POST | `/{id}/photos:init` | Creates `PENDING` metadata row; global `storage_key` uniqueness → 409; >15 total photos → 422 (app-level count) |
| 8 | POST | `/{id}/photos:confirm` | Scoped `(listing_id, storage_key)` → 404 on foreign key; only `PENDING→READY`; second confirm → 422 |
| 9 | POST | `/{id}/publish` | Guards (see §13) all pass → `PUBLISHED` + cover normalization, one commit |
| 10 | POST | `/{id}/pause` | Only `PUBLISHED→PAUSED`; data preserved |

**Deliberately absent:** public listing search/detail, bookings,
payments, uploads, admin routes, webhooks.

---

## 6. Authentication architecture

```mermaid
sequenceDiagram
    participant B as Browser
    participant F as Firebase Auth<br/>(emulator local)
    participant A as FastAPI (auth.py)
    participant D as PostgreSQL

    B->>F: sign-in (email/Google)
    F-->>B: ID token (JWT)
    B->>A: HTTPS + Authorization: Bearer token
    A->>F: verify_id_token (Admin SDK)
    alt first seen uid
        A->>D: INSERT users (+ user_profiles)
    else known uid
        A->>D: sync email / email_verified
    end
    A-->>B: application user + role
```

- **Trust boundary:** Firebase proves *identity* (uid, email,
  verified). **Only** `users.role` in PostgreSQL determines
  authorization. The backend never trusts roles from token claims.
- `get_firebase_claims` (`auth.py:45`): missing/malformed/invalid →
  **401** with `WWW-Authenticate: Bearer`.
- New Firebase uid hitting `GET /users/me` is **auto-provisioned as
  `USER`** with an empty `UserProfile` (`auth.py:79-109`). Race-safe:
  `IntegrityError → rollback → re-query`.
- Owner onboarding **must** call `POST /owners/signup` *before*
  `/users/me`, otherwise the uid is already a `USER` and signup returns
  **409** `ACCOUNT_TYPE_CONFLICT` (frontend `api.ts` documents this
  ordering explicitly).
- Emulator mode: `FIREBASE_AUTH_EMULATOR_HOST` set →
  `initialize_app(options={"projectId"})` with no credentials; else
  service-account file or default init.

---

## 7. Authorization / RBAC

```mermaid
flowchart TB
    TOK["Valid Firebase token"] --> CUR["get_current_user<br/>DB user resolved"]
    CUR --> R{require_role}
    R -->|USER| U["/users/me/profile"]
    R -->|OWNER| O["/owner/* (22 endpoints)"]
    R -->|ADMIN| A["no routes"]
    R -->|other| F["403 Insufficient permissions"]
```

| Role | Reachable routes | Notes |
|---|---|---|
| `USER` | `GET /users/me`, `GET/PATCH /users/me/profile` | Renter profile only; `OWNER`/`ADMIN` get **403** here |
| `OWNER` | All 18 `/api/v1/owner/*` endpoints (4 properties + 4 units + 10 listings) | Plus `/users/me` (any authenticated) |
| `ADMIN` | **None.** Exists only in `ck_users_role`. No route references it — dead role value, reserved for future moderation phases |

**Ownership checks:** every owner read/write resolves
`resource → … → properties.owner_user_id == current_user.id`
(listings join two hops: `listings.py:317-336`). There is **no
`owner_id` column** on units/listings/prices/photos — ownership is
always derived, never trusted from payloads (create schemas carry only
`property_id`/`rental_unit_id`, which are re-validated).

**404 vs 403:** wrong *role* → 403; right role but foreign/missing
*resource* → **404 with identical message** (`"Property/Unit/Listing
not found"`), so existence is never leaked. Uniqueness conflicts →
409; validation → 422 (see §20).

---

## 8. Database system design

PostgreSQL 17, migrations `0001–0012` (single linear chain), all
tables use integer surrogate PKs.

```mermaid
erDiagram
    users ||--o| user_profiles : "1:1 (user_id PK/FK, CASCADE)"
    users ||--o{ properties : "owner_user_id, RESTRICT"
    locations ||--o{ user_profiles : "college/workplace, RESTRICT"
    locations ||--o{ properties : "area/college/workplace, RESTRICT"
    properties ||--o{ rental_units : "CASCADE"
    rental_units ||--o{ rental_unit_amenities : "CASCADE"
    amenities ||--o{ rental_unit_amenities : "RESTRICT"
    rental_units ||--o{ listings : "CASCADE"
    listings ||--o{ listing_price_components : "CASCADE"
    listings ||--o{ listing_photos : "CASCADE"
```

| Table | Purpose / notable columns, constraints, indexes |
|---|---|
| `locations` | Canonical places. `type` (college/workplace/area — app-checked, seed-controlled), `(type,name)` index. Seeded with real Guwahati institutions |
| `users` | Identity. `firebase_uid` UNIQUE, `email` UNIQUE nullable, `role ∈ {USER,OWNER,ADMIN}` CHECK, `display_name`, `phone_number`. `email_verified` synced from Firebase |
| `user_profiles` | Renter prefs. PK = `user_id` FK CASCADE. `budget_min/max ≥ 0`, `max ≥ min` CHECKs; college/workplace FKs RESTRICT |
| `amenities` | Catalog, 13 rows seeded in migration `0007` (slug UNIQUE, e.g. `wifi`, `power-backup`, `cctv` + label/category). `is_active` soft-kill switch; `RESTRICT` prevents deleting in-use amenities |
| `properties` | Physical place. `owner_user_id` RESTRICT (can't delete owners with property); `property_type ∈ {PG,HOSTEL,APARTMENT_FLAT,INDEPENDENT_HOUSE,STUDIO_BUILDING,OTHER}`; `address_line TEXT`, `city` default Guwahati, pincode, `area_location_id` + college/workplace FKs RESTRICT; lat/lng range + both-or-neither CHECKs; indexes on owner/area/(city,area) |
| `rental_units` | Rentable space. `property_id` CASCADE; `unit_type` (6 values), `occupancy_type` (SINGLE…QUAD_PLUS), `capacity > 0`, `sharing`, `furnishing`, `gender_scope` (default ANY); **occupancy consistency triple**: `SINGLE ⇒ capacity=1 ∧ PRIVATE`, `SHARED ⇒ capacity≥2`, `PRIVATE ⇒ capacity=1`; 5 nullable tri-state policy booleans (partial indexes); `house_rules TEXT` |
| `rental_unit_amenities` | M2M join, composite PK, index `(amenity_id, rental_unit_id)` |
| `listings` | Commercial offer. `rental_unit_id` CASCADE; `title TEXT` (**nullable in DB** — API enforces required); `rent_basis ∈ {PER_PERSON,PER_ROOM,PER_UNIT}`; `status ∈ {DRAFT,PUBLISHED,PAUSED,RENTED,ARCHIVED}` — **RENTED/ARCHIVED exist in the CHECK but no API exposes them**; `availability_status` enum + `AVAILABLE_FROM_DATE ⇔ available_from NOT NULL` CHECK; **partial unique** `uq_listings_unit_active (rental_unit_id) WHERE status IN (DRAFT,PUBLISHED,PAUSED)` = one active listing per unit |
| `listing_price_components` | Price rows. `listing_id` CASCADE; enums for charge/calculation/frequency/variability/timing; `amount_paise/rate_paise_per_unit BIGINT ≥ 0`; **C1–C10 CHECKs** (XOR, CONSUMPTION, DEPOSIT, RENT, ONE_TIME, periodic-FIXED, OTHER⇔label); **C10 unique** `(listing_id, charge_type, calculation_basis, billing_frequency)`; indexes on listing + flags |
| `listing_photos` | Photo metadata. `listing_id` CASCADE; `storage_key TEXT UNIQUE` (global); `mime`, `width/height > 0`, `display_order ≥ 0`, `is_cover`, `upload_status ∈ {PENDING,READY,FAILED}`, `media_type ∈ {PHOTO,VIDEO}`; index `(listing_id, display_order)`. **No count CHECKs** (3-min/15-max are app rules) |

---

## 9. Core domain model

```mermaid
flowchart TB
    O["OWNER (users.role)"] --> P["PROPERTY<br/>physical place"]
    P --> U["RENTAL UNIT<br/>rentable space"]
    U --> L["LISTING<br/>commercial offer"]
    L --> PR["PRICE COMPONENTS<br/>honest cost structure"]
    L --> PH["PHOTOS<br/>media metadata"]
```

Why five tables instead of one: a building outlives any single
tenancy (Property); the same building contains independently rentable
spaces (RentalUnit); the *offer* for a space has its own lifecycle and
can be paused/republished without touching the space (Listing);
tenants compare on total cost, which is a structured set of charges,
not one number (PriceComponents); media has its own upload lifecycle
(Photos). Collapsing them would couple building facts to offer state.

---

## 10. Property domain

Ownership: `properties.owner_user_id → users.id ON DELETE RESTRICT`.
Types map 1:1 to backend enums; the **owner UX shows friendly labels**
(Apartment/House/Studio) while the API keeps enum values. Location is
triple-anchored: free-text `address_line`/`locality`, typed FKs
(`area_location_id`, `nearest_college_id`, `nearest_workplace_id`
validated by `validate_location_reference`), `city` + optional
6-digit pincode (`^[1-9][0-9]{5}$`, app-level). Coordinates optional
but paired (DB CHECK). Publication later requires address + city + area
— hence the UX asks area up front.

## 11. Rental-unit domain

Types: `PRIVATE_ROOM, SHARED_ROOM_BED, ENTIRE_FLAT, ENTIRE_STUDIO,
PG_BED, OTHER`. The UX never shows these strings (cards say "Private
room", "Bed in a shared room", …) and **infers** what it can:
single/private and shared/capacity rules mean the API asks no redundant
questions. Consistency is enforced twice: service-side
(`_validate_occupancy`, friendly 422s) and DB CHECKs (final defense).
`gender_scope` defaults `ANY`. Policies are genuinely tri-state
(`NULL` = "ask me"); amenities resolve against the live catalog with
`is_active` filtering, so deactivating an amenity blocks new use
without breaking history.

---

## 12. Listing domain

**Lifecycle (CURRENT API behavior):**

```mermaid
stateDiagram-v2
    [*] --> DRAFT : POST /listings
    DRAFT --> PUBLISHED : POST /publish (guards pass)
    PUBLISHED --> PAUSED : POST /pause
    PAUSED --> PUBLISHED : POST /publish (guards pass)
```

`DRAFT` is server-forced on create (schema has no `status` field;
`extra="forbid"` rejects it). `PATCH` accepts only
`title/description/rent_basis` — status can never be smuggled.
`PUBLISHED → DRAFT` has no path; publishing while `PUBLISHED` → 422;
pausing unless `PUBLISHED` → 422. **Database capability vs API
behavior:** the `ck_listings_status` CHECK also permits `RENTED` and
`ARCHIVED`, but no endpoint reads, writes, or transitions them —
intentionally deferred lifecycle states.

`title` (2–200, API-required; DB-nullable legacy), `description`
optional, `rent_basis` drives price-row consistency (a `RENT` row whose
`calculation_basis` differs → 422, on both PUT and PATCH-basis-change).
`availability_status`: `AVAILABLE_NOW` (date must be null),
`AVAILABLE_FROM_DATE` (required, not past), `OCCUPIED` (date null,
forbidden while `PUBLISHED`).

## 13. Publication system

`POST /listings/{id}/publish` (`listings.py:829-857`) runs **all**
guards before any mutation:

- **A. Photos:** `READY` count ≥ 3 (app-level; PENDING never counts).
- **B. Rent:** ≥ 1 `RENT` price component.
- **C. Location:** underlying `Property` has non-blank `address_line` +
  `city` + non-null `area_location_id` (read from DB, never the
  payload).
- **D. Availability:** `availability_status != OCCUPIED`.
- **Lifecycle:** current status must be `DRAFT`/`PAUSED`.

On success, cover normalization + `status=PUBLISHED` commit atomically
and the full `ListingRead` returns. On any guard failure: 422, status
and photo flags provably unchanged (regression-tested). `PUBLISHED`
means "visible to the future public marketplace" — **no public
read endpoint exists yet**, so nothing currently consumes the flag.
`POST /pause` flips to `PAUSED`, preserving all data; resume re-runs
all guards.

```mermaid
flowchart TB
    P["POST /publish"] --> S{"status DRAFT/PAUSED?"}
    S -->|no| E422["422"]
    S -->|yes| A["Guard A: READY ≥ 3"]
    A --> B["Guard B: RENT row"]
    B --> C["Guard C: address/city/area"]
    C --> D["Guard D: not OCCUPIED"]
    D -->|fail| E422
    D -->|pass| N["normalize cover + PUBLISHED<br/>single commit"]
    N --> R["200 ListingRead"]
```

## 14. Pricing system

Charge types: `RENT, DEPOSIT, MAINTENANCE, FOOD, ELECTRICITY, WATER,
INTERNET, OTHER`. Each row carries `calculation_basis`
(PER_PERSON/PER_ROOM/PER_UNIT/CONSUMPTION), `billing_frequency`
(MONTHLY/QUARTERLY/ANNUALLY/ONE_TIME/USAGE_BASED), `variability`
(FIXED/VARIABLE), `amount_paise` XOR `rate_paise_per_unit`
(**C1**), optional `consumption_unit`, `mandatory`,
`included_in_advertised`, `refundable`, `payment_timing`
(PER_PERIOD/UPFRONT_FULL/ON_MOVE_IN/ON_EXIT_SETTLED), `display_order`.

Enforced C-rules (service-side with DB CHECKs as backstop):
**C2** CONSUMPTION ⇒ rate + unit + VARIABLE + USAGE_BASED/MONTHLY;
**C3** non-CONSUMPTION ⇒ amount set, no unit; **C4** VARIABLE ⇒ rate;
**C5** DEPOSIT ⇒ ONE_TIME + FIXED + refundable + amount +
ON_MOVE_IN/UPFRONT_FULL; **C6** RENT ⇒ mandatory + FIXED + amount;
**C7** ONE_TIME ⇏ PER_PERIOD; **C8** periodic FIXED ⇒ amount;
**C9** `OTHER ⇔ label`; **C10** unique identity per listing.
Plus: `RENT.calculation_basis == listing.rent_basis`.

Writes are **whole-set replacement** (`PUT`, `[]` clears), validated
before any delete; duplicates (in-payload or via C10) → 409.
Estimated monthly cost is **not** computed server-side — the renter
prototype sums it client-side (`PriceBreakdown`); the owner prototype
shows headline + extras + deposit live. No tax/discount engine exists.

## 15. Photo system

```mermaid
stateDiagram-v2
    [*] --> PENDING : POST /photos:init
    PENDING --> READY : POST /photos:confirm
    PENDING --> FAILED : (future uploader)
    READY --> READY : re-confirm rejected (422)
```

Stored metadata: `storage_key` (globally UNIQUE), `mime`,
`width/height`, `display_order`, `is_cover`, `upload_status`,
`media_type`. Rules: ≤ 15 total records per listing (app count check on
init → 422; **no DB CHECK** — documented TOCTOU note); ≥ 3 READY to
publish; cover = lowest `(display_order, id)` among READY with explicit
marks winning, normalized atomically at publish (PENDING marks are
ignored and cleared). **Object storage is NOT integrated**: no SDK, no
signed URLs, no bytes flow — `storage_key` is a reservation placeholder
for a future R2/S3 phase.

---

## 16. Data flows

**FLOW A — User signup (renter or owner):**

```mermaid
sequenceDiagram
    participant B as Browser (Next.js)
    participant F as Firebase Auth
    participant A as FastAPI
    participant D as PostgreSQL
    B->>F: createUser / Google popup
    F-->>B: ID token
    B->>A: POST /owners/signup + Bearer (owner path)
    A->>F: verify_id_token
    A->>D: INSERT users(role=OWNER) or 409 on conflict
    A-->>B: 201 (or 200 if already OWNER) UserRead
```

Renter path is identical except it starts at `GET /users/me`, which
provisions `USER` implicitly. Wrong-order calls (me-before-signup)
produce the documented 409.

**FLOW B — Owner creates property:** Bearer → `require_role(OWNER)` →
`PropertyCreate` (`extra=forbid`) → geo + location-ref validation →
`INSERT` → 201 `PropertyRead` (nested locations) / 422 / 401 / 403.

**FLOW C — Owner creates rental unit:** Bearer → OWNER → unit exists
check (`_owned_property_or_404`, 404) → occupancy + amenity validation
→ `INSERT` + M2M → 201 with sorted amenities.

**FLOW D — Owner creates listing:** Bearer → OWNER → unit-ownership
check → availability validation → `INSERT status=DRAFT` → 201 full
`ListingRead`; second active listing for the unit → 409.

**FLOW E — Pricing:** Bearer → OWNER → listing ownership → validate
*entire* array (C1–C10 + basis) → duplicate scan → delete-all +
insert-all → commit → 200 list / 422 with rollback intact.

**FLOW F — Photos:** init (ownership → count ≤ 15 → key-unique →
`PENDING`, 201) → external upload (future) → confirm (scoped lookup →
field updates → `READY`, 200).

**FLOW G — Publish:** §13 diagram. Guards → normalize → commit → 200;
any failure → 422, zero mutation.

**FLOW H — Renter views published listing:** **No backend endpoint.**
Renter detail pages exist only in `design-prototype` against static
mock data. The `PUBLISHED` flag currently has no consumer — the next
backend phase (public search/detail) is the explicit gap.

---

## 17. Owner listing flow (implementation vs UX)

| Layer | State |
|---|---|
| Production backend (Phase 2E-B) | Complete: 10 listing endpoints, guards, lifecycle, atomicity (403 tests at commit; see §25 on re-verification) |
| `design-prototype` owner flow | Rebuilt 11-chapter guided UX (What → Kind → Where → Space → Included → Rules → Photos → Price → Move-in → Name → Listing) with conditional questions, localStorage drafts (`agh-owner-drafts-v1`), simulated uploads, blue marketplace system. **Zero API calls** (verified by repo-wide grep) |
| Production `frontend/` owner UI | Account shell only (signup/login/dashboard/account pages); **no property/listing screens yet** |
| Future work | Wire prototype UX to real APIs; public search/detail; real uploads; BHK/layout field (prototype-only concept today — needs a backend domain decision) |

LocalStorage draft state must never be mistaken for production
persistence.

---

## 18. Frontend architecture

Next.js 16 + React 19 + TypeScript + Tailwind v4 (`rent-frontend`).
App Router routes: `/`, `/login`, `/signup`, `/onboarding`,
`/profile`, `/list-your-property`, `/owner/{signup,login,dashboard,
account}`. No search/detail/property routes in production frontend
(those live only in the prototype).

```mermaid
flowchart TB
    subgraph FE["frontend/"]
        PAGES["App Router pages<br/>(server prerender + client forms)"]
        AUTH["AuthProvider<br/>(Firebase user context)"]
        API["lib/api.ts<br/>fetch + Bearer + ApiError"]
        FB["lib/firebase.ts<br/>demo config + emulator"]
        COMP["components/<br/>auth-ui, brand,<br/>location-search, owner-ui"]
        STORE["lib/onboarding-storage.ts<br/>(localStorage draft)"]
    end
    PAGES --> AUTH & API & COMP & STORE
    API --> FB
```

Interaction → request path: form component → `getIdToken()` from
`AuthProvider` → `api.ts` `request()` attaches
`Authorization: Bearer` → `fetch` → typed response or thrown
`ApiError(status, detail)`. Firebase config prefers
`NEXT_PUBLIC_*` env, else demo/emulator defaults, so `npm run dev`
works with zero configuration. `onboarding-storage.ts` persists the
renter onboarding draft in localStorage (prototype-grade, same pattern
as the design sandbox).

---

## 19. Frontend ↔ backend contract

```mermaid
flowchart LR
    UI["React form"] --> H["Authorization: Bearer ID-token"]
    H --> J["HTTP/JSON"]
    J --> P["Pydantic (forbid + Literals)"]
    P --> S["Service helpers + ownership"]
    S --> O["SQLAlchemy → PostgreSQL"]
```

- **Auth header:** `Authorization: Bearer <Firebase ID token>`.
- **Errors:** FastAPI default shape (`{"detail": string}`); `api.ts`
  surfaces `detail` or `statusText` as `ApiError.message`.
- **Status codes:** 200/201 success (201 on first create; 200 on
  idempotent owner re-signup); 401 bad/missing token; 403 wrong role;
  404 uniform not-found (isolation-safe); 409 conflicts (duplicate
  listing/component/key, account-type conflict); 422 validation
  (Pydantic + business rules + DB CHECK violations mapped from
  `IntegrityError` after rollback).
- **Ownership errors** are always 404, never 403 — a deliberate
  information-hiding rule (see §7).

---

## 20. Error handling

No global exception handler and no error envelope beyond FastAPI's
default `{"detail"}`. Strategy per layer:

| Code | Generated where | Meaning |
|---|---|---|
| 401 | `auth.py:37-43,45-54` | Missing/malformed/invalid Bearer token |
| 403 | `auth.py:169-180` (`require_role`) | Authenticated but wrong role |
| 404 | `_owned_*_or_404` helpers; scoped photo lookup | Missing **or foreign** resource (uniform message) |
| 409 | Uniqueness violations (`uq_listings_unit_active`, `uq_lpc_c10_unique`, `storage_key`, `ACCOUNT_TYPE_CONFLICT`) | Conflict / duplicate identity |
| 422 | Pydantic validation, service guards (occupancy, C1–C10, availability, publish guards), `IntegrityError` fallback after rollback | Unprocessable input or violated business rule |
| 500 | Unhandled (TestClient uses `raise_server_exceptions=False` in tests) | Not shaped by the app — no custom 500 handling exists |

Validation errors from Pydantic return field-level detail lists;
business-rule failures return single human-readable `detail` strings
(the owner UX maps these to friendly copy; raw codes never surface).

## 21. Security architecture

**CURRENTLY IMPLEMENTED:** Firebase ID-token verification (Admin SDK,
emulator-aware init); RBAC via `require_role` (USER/OWNER; ADMIN
defined but unused); per-resource ownership joins with uniform 404s;
`extra="forbid"` on all write schemas + `Literal` enums + range
patterns (pincode, phone, geo); DB CHECKs as last-line defense;
CORS allowlist (`http://localhost:3000`, methods GET/POST/PUT/PATCH,
headers Authorization/Content-Type); secrets exclusively via env
(`.env` git-ignored, only `.env.example` committed); test-only
dependency override for auth (never production).

**PLANNED / DEFERRED (not present):** rate limiting, audit logging,
presigned-upload auth, refresh-token rotation policy, production
secret management, WAF/CDN policy, admin moderation tooling.

## 22. Database integrity (enforcement layers)

| Rule | Enforcement layer |
|---|---|
| Owner resource isolation | Backend (ownership joins + uniform 404) |
| Role gating | Backend (`require_role`) |
| Pincode/phone formats | Pydantic (regex) |
| Title length, enum membership | Pydantic (`Field`, `Literal`) |
| Occupancy consistency (SINGLE/SHARED/PRIVATE) | Backend service **+** DB CHECKs |
| Price invariants C1–C10, rent-basis match | Backend service **+** DB CHECKs (+ C10 unique index) |
| Availability/date coherence | Backend service **+** DB CHECK |
| One active listing per unit | DB partial unique index (→ 409) |
| Photo key uniqueness | DB UNIQUE (→ 409) |
| Publish readiness (3 READY, RENT row, address/area, not OCCUPIED) | Backend service only (cross-row rules, no DB CHECK) |
| 15-photo maximum | Backend service only (count check; no DB CHECK) |
| Cover selection | Backend service only (normalized at publish) |
| FK integrity / cascades | Database (`CASCADE` down the chain, `RESTRICT` on users/amenities/locations) |
| Required-field nullability | Mixed: DB NOT NULL + API-level guards (e.g. `title` is DB-nullable legacy, API-required) |

## 23. Deployment architecture

**CURRENT: local development only.** There is no production
deployment — no Vercel/Render config, no CI (`.github/` does not
exist), no containerization of the app itself, no production Firebase
project. Do not present otherwise.

```mermaid
flowchart TB
    subgraph Local["Developer machine"]
        FE["Next.js :3000<br/>(npm run dev)"]
        BE["uvicorn app.main:app :8000"]
        PG["PostgreSQL 17<br/>Docker :5433 (pgdata)"]
        EM["Firebase Auth emulator :9099<br/>(UI :4000)"]
    end
    FE --> BE --> PG
    BE --> EM
    FE --> EM
```

## 24. Local development architecture

Ports (all verified in code/config): frontend `:3000` → backend
`:8000` → PostgreSQL host `:5433` (container `:5432`); Firebase Auth
Emulator `:9099`, emulator UI `:4000`; project id `demo-apun-ghar`
(`demo-` prefix = no real project/billing). Backend defaults work with
zero config; frontend works with zero config (demo Firebase values +
auto emulator connect, overridable via `NEXT_PUBLIC_*`). Health gates:
`/healthz` (process), `/readyz` (DB `SELECT 1`).

## 25. Test architecture

Framework: **pytest** with FastAPI `TestClient`. Organization mirrors
domains: `test_models.py` (constraint spot-checks), `test_2b_*`
(migrations + models), `test_auth.py`, `test_cors.py`,
`test_health.py`, `test_locations.py`, `test_owners_signup.py`,
`test_users_me.py`, `test_users_profile.py`,
`test_2c_properties.py` (36 tests), `test_2d_rental_units.py` (44),
`test_2e_listings.py` (87: 56 foundation + 31 publication).
Conventions: canned Firebase claims via dependency override, per-test
DB cleanup keyed by uid prefix (`t2c-`, `t2d-`, `t2e-`), module engine
fixture that **skips** when PostgreSQL is unreachable, negative-path
heavy (401/403/404/409/422 matrices), atomicity tests (failed writes
leave DB unchanged).

> Count status: at the Phase 2E-B commit the suite reported **403
> passed, 0 failed**. During this audit PostgreSQL was unreachable
> (port 5433 closed), so the figure could **not** be re-verified here
> and is reported as historical, not current.

## 26. Current vs future architecture

**CURRENT:** modular monolith + single PostgreSQL + Firebase Auth;
owner supply-side backend complete (CRUD → publish/pause); renter
profile/onboarding + owner account in production frontend; UX
sandbox disconnected; no search, messaging, visits, payments, uploads,
search engine, cache, workers, or realtime layer.

**DEFERRED (documented, intentionally absent):** Redis, Elasticsearch/
OpenSearch, WebSockets, background workers, microservices, Kubernetes,
payments, video processing, KYC/admin approval, native mobile apps,
presigned R2/S3 uploads, public search/detail endpoints. Rationale
(per `PROJECT_STATUS.md` + code): single-digit-team stage, read/write
patterns fit one database, premature infrastructure would add
operational cost without a load or feature driver.

## 27. Scalability

*Current headroom:* stateless API processes behind one DB; `pool_pre_ping`;
read-heavy future pages can add replicas later. *If/when needed, in
order:* connection pooling tuning (PgBouncer) → read replica for
search/detail → object storage + CDN for photos (already decoupled via
`storage_key`) → FTS (`tsvector`) or OpenSearch only when listing
volume demands it → Redis only for rate-limit/session needs that
materialize → workers only for transcoding/notifications. None of this
is warranted today; the doc recommends against adding any of it
pre-emptively.

## 28. Observability

Implemented: `/healthz` (liveness), `/readyz` (readiness incl. DB),
uvicorn access logs (default). **NOT CURRENTLY IMPLEMENTED:**
structured logging, metrics, tracing, error tracking (Sentry), alerting,
audit logs. Say so plainly — there is no observability story beyond
the two health endpoints.

## 29. Architectural decisions (ADR-style)

1. **Modular monolith over microservices** — one team, one deployable,
   domain modules with no cross-imports; services split later only on
   scaling evidence.
2. **PostgreSQL as the system of record** — relational integrity
   (CHECKs, partial uniques) enforces marketplace invariants the app
   cannot be trusted to uphold alone.
3. **Firebase Authentication** — outsourced identity (incl. Google),
   zero password storage; trust boundary drawn at `users.role`.
4. **Property / RentalUnit / Listing split** — building facts, rentable
   space, and commercial offer evolve independently (§9).
5. **Ownership derived through Property** — no `owner_id` denormalized
   downstream; single join-chain rule, uniform 404s.
6. **Pricing as components, whole-set PUT** — honest totals need
   structure; atomic replacement avoids partial-config states.
7. **Metadata-first photos** — `storage_key` reservations decouple the
   listing workflow from the future storage provider.
8. **No Redis/Elasticsearch/workers** — no feature today needs them;
   deferred explicitly, not overlooked.
9. **Emulator-first local auth** — zero-config onboarding, no real
   project/billing risk during development.
10. **Prototype kept disconnected** — UX iteration at full speed with
    zero risk to production contracts.

## 30. Risks / technical debt

| Severity | Problem | Evidence | Impact → Direction |
|---|---|---|---|
| HIGH | `README.md` + `docs/PROJECT_STATUS.md` are stale (claim Phase 2 unstarted, 316 tests, head `0006`) | README:30-32,44,215; actual head `0012`, phases 2C–2E committed | New joiners misled → refresh these docs from this design doc |
| MEDIUM | `ADMIN` role is dead (in CHECK, zero routes) | grep: no `require_role("ADMIN")` in `app/` | Confusion + future 500s if assumed → either wire admin routes or document as reserved |
| MEDIUM | `Listing.title` DB-nullable (API enforces required) | `models.py:373` vs `listings.py` validation | Legacy weakness → add `nullable=False` migration in a hardening phase |
| MEDIUM | No public read API: `PUBLISHED` has no consumer | No `GET /listings` public route | Supply side is complete but unrenterable → next backend phase is public search/detail |
| MEDIUM | Photo 15-max has a TOCTOU race (count-then-insert) | `listings.py:687-700` | Concurrent inits could exceed 15 → DB-level guard in hardening phase |
| LOW | Broad `IntegrityError` message sniffing (photo keys) | `listings.py:726` (`"unique" in msg.lower()`) | Possible misclassification → match constraint names |
| LOW | Business-logic deprecation warnings (`HTTP_422_UNPROCESSABLE_ENTITY`) | Test output across modules | Noise → migrate to `HTTP_422_UNPROCESSABLE_CONTENT` |
| INFO | `RENTED`/`ARCHIVED` in status CHECK, unused | `models.py:343` | By design (deferred); keep documented, don't "clean" without a lifecycle decision |
| INFO | `UserProfile` `.one()` raises uncaught 500-shape if profile missing | `users.py:64,76` | Auto-provisioning makes it rare; harden with 404 when touched |

## 31. Diagram index

High-level architecture (§1), request lifecycle (§2), repository map
(§3), module dependencies (§4), API tables (§5), auth sequence (§6),
RBAC tree (§7), ER diagram (§8), domain model (§9), listing lifecycle
(§12), publish flow (§13), photo lifecycle (§15), flows A–H (§16),
frontend map + request path (§§18–19), local deployment (§23).

## 32. Traceability

**Owner creates listing:** owner wizard (PROTOTYPE, disconnected) →
`POST /api/v1/owner/listings` → `ListingCreate` (`listings.py:122`) →
`_owned_unit_or_404` + `_validate_availability` → `Listing`
(`models.py:335`) → `listings` table → 201 `ListingRead`.

**Owner sets pricing:** price rows UI (PROTOTYPE) → `PUT
…/price-components` → `list[PriceComponentItem]` → `_validate_price_item`
(C1–C10 + basis) + duplicate scan → delete-all + insert-all →
`listing_price_components` → 200 list / 422 rolled back.

**Owner publishes:** readiness checklist (PROTOTYPE) → `POST …/publish`
→ `_check_publication_guards` + `_normalize_cover` → `status=PUBLISHED`
→ `listings` row → 200 `ListingRead`. Photo confirm: `PhotoConfirm` →
scoped lookup → `listing_photos.upload_status=READY`.

**Renter onboarding:** `/onboarding` (frontend, localStorage draft) →
Firebase token → `PATCH /users/me/profile` → `ProfileUpdate` →
`UserProfile` → `user_profiles` row.

## 33. Final summary

**CURRENT ARCHITECTURE:** single FastAPI modular monolith + single
PostgreSQL 17 + Firebase Auth (emulator local); production Next.js
client for renter onboarding/profile + owner accounts; complete owner
supply-side backend (property → unit → listing → pricing/photos →
publish/pause, 10 listing endpoints, 18 owner endpoints total);
disconnected UX prototype with zero API calls; no CI, no prod deploy,
no search/detail/booking/payment/upload infrastructure.

**CURRENT STRENGTHS:** invariants enforced at the right layers
(DB CHECKs + service guards + Pydantic); uniform 404 isolation;
atomic whole-set writes with rollback-tested guarantees; emulator-zero-config
local dev; phase-disciplined git history; negative-path-heavy tests.

**CURRENT LIMITATIONS:** stale README/status docs; dead ADMIN role;
no public read path (published listings invisible); metadata-only
photos; observability limited to two health endpoints; nullable-title
legacy; prototype and production frontends share no components.

**NEXT ARCHITECTURAL STEPS (in order, no premature infra):**
1. Refresh `README.md`/`PROJECT_STATUS.md` from this document.
2. Public `GET` search/detail endpoints consuming `PUBLISHED` (+ photo
   URL resolution strategy).
3. Real uploads: presigned R2/S3 + `photos:confirm` wiring; DB-level
   15-max guard in the same hardening migration as title NOT NULL.
4. Decide ADMIN scope or drop the role value; add structured logging +
   error tracking before any production deploy.
5. Only then: read replicas, FTS/OpenSearch, Redis, workers — each on
   measured need.



