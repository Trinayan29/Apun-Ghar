# Apun-Ghar — System Design

> Source of truth: the actual repository code. Secondary evidence:
> `docs/PROJECT_STATUS.md`, `README.md`.
> Where the docs and the code disagree, **the code wins** — known
> disagreements are called out explicitly (see §30).
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
29. [Architectural decisions (ADR index)](#29-architectural-decisions-adr-index)
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
| Owner (`OWNER`) | Separate account type; creates properties → rental units → listings → pricing/photos → publishes/pauses (backend complete through Phase 2G) |
| Admin (`ADMIN`) | Role exists in the DB CHECK; **zero routes enforce or use it** (see §7) |
| Firebase Authentication | Proves identity (ID tokens); local dev uses the Auth Emulator |
| Production frontend (`frontend/`) | Next.js App Router web client (renter onboarding/profile + owner account flows) |
| Backend API (`backend/`) | Single FastAPI modular monolith |
| PostgreSQL 17 | Single relational database (Docker, host port 5433) |
| Object storage | **Integrated.** Backblaze B2 stores photo bytes; PostgreSQL stores photo metadata + `storage_key` (see §15) |

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

    FE -->|HTTP(S) + Bearer ID token| API
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
| `backend/` | FastAPI modular monolith (`app/`), Alembic migrations (`alembic/versions/0001–0018`), pytest suite (`tests/`), `requirements.txt` |
| `design-prototype/` | Separate Next.js app: renter mock flows + rebuilt owner listing UX. Zero backend calls |
| `docs/` | `PROJECT_STATUS.md`, `supply-strategy.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md`, `decisions/`, this file |
| `docker-compose.yml` | PostgreSQL 17 container only (`5433:5432`, `pgdata` volume) |
| `.env.example` | Dev-only template → copied to `backend/.env`; emulator host, demo project id |
| `firebase.json` | Auth Emulator `:9099` + UI `:4000` |
| `README.md` | Product overview and local quick start |

There is **no `.github/`** (no CI), no `services/`, no `schemas/`
package, no shared API client package, no infrastructure-as-code
beyond Compose.

---

## 4. Backend system design

**Entrypoint** `backend/app/main.py`: `FastAPI(title="Rent API")`,
CORS (`allow_origins=["http://localhost:3000"]`,
`allow_methods=["GET","POST","PUT","PATCH","DELETE"]`,
`allow_headers=["Authorization","Content-Type"]`, `allow_credentials=True`),
seven router registrations, `GET /healthz` (liveness), `GET /readyz` (DB
reachability via `SELECT 1`). The uncustomized FastAPI defaults also
expose `/docs`, `/redoc`, and `/openapi.json`; that generated OpenAPI
contract is the best source for raw request/response shapes. It does
not capture role gates, ownership scoping, business guards, or the
uniform ownership-404 rule documented below.

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
unreachable. 15 test files: model/migration/auth/cors/health/
locations/owners/users/profile/2C-properties/2D-units/2E-listings/2F-domain/2H-photos
(see §25 for commit-scoped figures; the backend suite carries 15
pre-existing local-DB failures).

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
| POST | `/api/v1/owners/signup` | any token | Creates OWNER (`display_name` 2–200, `phone_number` `^\+?[0-9]{7,15}$`); **201 first time, 200 if already OWNER**; 409 `ACCOUNT_TYPE_CONFLICT` if the uid already has another role |

### Locations (public — no auth)

`GET /api/v1/locations?type=college|workplace|area&search=&limit=` —
`ilike` match on name/city, ordered `(name, id)`, `limit` 1–50.
422 on unknown `type`. Backing seed: real Guwahati institutions
(`seed.py` + migration catalog).

### Owner properties (`require_role("OWNER")`, prefix `/api/v1/owner/properties`)

| Method | Path | Rules |
|---|---|---|
| POST | `/api/v1/owner/properties` | Create; `address_line` stripped non-blank; lat/lng both-or-neither; area/college/workplace FK type-checked; 201 |
| GET | `/api/v1/owner/properties` | Owner-scoped list, `limit` 20/1–50, `offset`, `id` asc, nested locations eager |
| GET | `/api/v1/owner/properties/{property_id}` | `_owned_or_404` — missing **or foreign → 404** (no leak) |
| PATCH | `/api/v1/owner/properties/{property_id}` | `exclude_unset`; explicit null on `property_type/address_line/city` → 422; geo re-validated against merged values |

### Owner rental units (two routers, same `OWNER` gate)

- `POST /api/v1/owner/properties/{property_id}/units` — 201; occupancy triple validated service-side; `amenity_ids` resolved to **active** amenities only (unknown/inactive → 422; explicit `null` → 422 with "use []" message).
- `GET /api/v1/owner/properties/{property_id}/units` — list, id asc, amenities sorted.
- `GET /api/v1/owner/units/{unit_id}` — ownership resolved by join `unit→property→owner`; 404 on foreign.
- `PATCH /api/v1/owner/units/{unit_id}` — `exclude_unset`; omitted `amenity_ids` **preserves** amenities; `[]` clears; failed PATCH leaves DB unchanged (validated before mutation).

### Owner listings (13 endpoints, `OWNER`, prefix `/api/v1/owner/listings`)

| # | Method | Path | Purpose / key rule |
|---|---|---|---|
| 1 | POST | `/api/v1/owner/listings` | Create; `title` required 2–200; status server-forced `DRAFT`; duplicate active listing per unit → **409** (`uq_listings_unit_active`) |
| 2 | GET | `/api/v1/owner/listings` | Owner-scoped join list, id asc, eager unit+amenities+prices+photos |
| 3 | GET | `/api/v1/owner/listings/{id}` | 404 on foreign |
| 4 | PATCH | `/api/v1/owner/listings/{id}` | Only `title/description/rent_basis`; `title=null` → 422; `status` not accepted; rent-basis change re-checked vs existing RENT rows |
| 5 | POST | `/api/v1/owner/listings/{id}/availability` | `AVAILABLE_NOW` (date must be null), `AVAILABLE_FROM_DATE` (required, not past), `OCCUPIED` (date null + rejected if `PUBLISHED`) |
| 6 | PUT | `/api/v1/owner/listings/{id}/price-components` | **Complete atomic replacement** (`[]` clears); full C1–C10 + `rent_basis` consistency pre-validated; duplicate identity → 409 |
| 7 | POST | `/api/v1/owner/listings/{id}/photos:init` | Creates `PENDING` metadata row and issues a presigned PUT URL; server assigns the storage key; >15 total photos → 422 (app-level count); unexpected database-constraint failure → 422 |
| 8 | POST | `/api/v1/owner/listings/{id}/photos/{photo_id}/confirm` | Scoped by `(photo_id, listing_id)` → 404 when missing or foreign; only `PENDING→READY`; second confirm → 422 |
| 9 | POST | `/api/v1/owner/listings/{id}/publish` | Guards (see §13) all pass → `PUBLISHED` + cover normalization, one commit |
| 10 | POST | `/api/v1/owner/listings/{id}/pause` | Only `PUBLISHED→PAUSED`; data preserved |
| 11 | PATCH | `/api/v1/owner/listings/{id}/photos/{photo_id}` | Reorder / change cover (`display_order`, `is_cover`) |
| 12 | DELETE | `/api/v1/owner/listings/{id}/photos/{photo_id}` | Deletes the photo row **and** its B2 object (fail-closed 503 on storage error); returns 204 |
| 13 | DELETE | `/api/v1/owner/listings/{id}/draft` | Deletes a `DRAFT` listing only (else 422); cascades price/photo rows; deletes the `RentalUnit` **only when no listing of any status references it**; the `Property` is never deleted. B2 objects deleted **before** the single DB transaction; returns 204 |

**Deliberately absent:** public listing search/detail, bookings,
payments, admin routes, webhooks.

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
    R -->|OWNER| O["/owner/* (21 endpoints)"]
    R -->|ADMIN| A["no routes"]
    R -->|other| F["403 Insufficient permissions"]
```

| Role | Reachable routes | Notes |
|---|---|---|
| `USER` | `GET /users/me`, `GET/PATCH /users/me/profile` | Renter profile only; `OWNER`/`ADMIN` get **403** here |
| `OWNER` | All `/api/v1/owner/*` endpoints (4 properties + 4 units + 13 listings) | Plus `/users/me` (any authenticated) |
| `ADMIN` | **None.** Exists only in `ck_users_role`. No route references it — dead role value, reserved for future moderation phases |

`USER` means any tenant/consumer (students, interns, young
professionals) — the role describes platform capability, not
educational status. It was renamed from `STUDENT` (migration `0005`,
which moves rows and switches the CHECK) precisely because students
and entry-level workers share identical permissions.

**Ownership checks:** every owner read/write resolves
`resource → … → properties.owner_user_id == current_user.id`
(listings join two hops: `listings.py:326-345`). There is **no
`owner_id` column** on units/listings/prices/photos — ownership is
always derived, never trusted from payloads (create schemas carry only
`property_id`/`rental_unit_id`, which are re-validated).

**404 vs 403:** wrong *role* → 403; right role but foreign/missing
*resource* → **404 with identical message** (`"Property/Unit/Listing
not found"`), so existence is never leaked. Uniqueness conflicts →
409; validation → 422 (see §20).

---

## 8. Database system design

PostgreSQL 17, migrations `0001–0018` (single linear chain: locations
→ users/profiles → amenities → properties → rental units → listings →
prices/photos → unit attributes → property enums → nullable occupancy →
property name → area custom name → photo size bytes), all tables use
integer surrogate PKs. Column reference below is summary-level; the
authoritative definitions live in `backend/app/models.py` and
`backend/alembic/versions/`.

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
| `properties` | Physical place. `owner_user_id` RESTRICT (can't delete owners with property); `name` nullable (`0016`, falls back to "Untitled property" in UI); `property_type ∈ {PG,HOSTEL,APARTMENT_FLAT,INDEPENDENT_HOUSE,ASSAM_TYPE_HOUSE,STUDIO_BUILDING,OTHER}`; `address_line TEXT`, `city` default Guwahati, pincode, `area_location_id` + `area_custom_name` (`0017`: free-text area for places missing from the catalog) + college/workplace FKs RESTRICT; `has_curfew BOOLEAN NULL` (NULL=unspecified) alongside `gate_closing_time`; lat/lng range + both-or-neither CHECKs; indexes on owner/area/(city,area) |
| `rental_units` | Rentable space. `property_id` CASCADE; `unit_type` (6 values), `occupancy_type` (SINGLE…QUAD_PLUS, NULL = not applicable for whole homes), `capacity`/`sharing` NULLable (NULL = not applicable); `layout ∈ {1 RK,1 BHK,2 BHK,3 BHK,4 BHK+} NULL`; `is_independent BOOLEAN NULL`; `food_status ∈ {INCLUDED,SEPARATE,NONE} NULL`; `furnishing`, `gender_scope` (default ANY); **occupancy consistency triple** (NULL-tolerant at DB level; required-for-rooms enforced by API): `SINGLE ⇒ capacity=1 ∧ PRIVATE`, `SHARED ⇒ capacity≥2`, `PRIVATE ⇒ capacity=1`; plus `ck_units_layout_scope` (layout only with whole-home/OTHER types) and `ck_units_capacity_required` (capacity+sharing set, or layout set, or whole-home/OTHER type); 5 nullable tri-state policy booleans (partial indexes); `house_rules TEXT` |
| `rental_unit_amenities` | M2M join, composite PK, index `(amenity_id, rental_unit_id)` |
| `listings` | Commercial offer. `rental_unit_id` CASCADE; `title TEXT NOT NULL` (hardened in migration `0014` after a zero-NULL audit); `rent_basis ∈ {PER_PERSON,PER_ROOM,PER_UNIT}`; `status ∈ {DRAFT,PUBLISHED,PAUSED,RENTED,ARCHIVED}` — **RENTED/ARCHIVED exist in the CHECK but no API exposes them**; `availability_status` enum + `AVAILABLE_FROM_DATE ⇔ available_from NOT NULL` CHECK; **partial unique** `uq_listings_unit_active (rental_unit_id) WHERE status IN (DRAFT,PUBLISHED,PAUSED)` = one active listing per unit |
| `listing_price_components` | Price rows. `listing_id` CASCADE; enums for charge/calculation/frequency/variability/timing; `amount_paise/rate_paise_per_unit BIGINT ≥ 0`; **C1–C10 CHECKs** (XOR, CONSUMPTION, DEPOSIT, RENT, ONE_TIME, periodic-FIXED, OTHER⇔label); **C10 unique** `(listing_id, charge_type, calculation_basis, billing_frequency)`; indexes on listing + flags |
| `listing_photos` | Photo metadata. `listing_id` CASCADE; `storage_key TEXT UNIQUE` (global); `mime`, `width/height > 0`, `size_bytes` (`0018`, nullable), `display_order ≥ 0`, `is_cover`, `upload_status ∈ {PENDING,READY,FAILED}`, `media_type ∈ {PHOTO,VIDEO}`; index `(listing_id, display_order)`. **No count CHECKs** (3-min/15-max are app rules) |

**Key schema decisions** (stable rationale; details verified in `models.py`):
- **Integer surrogate PKs, Firebase UID only on `users`.** 4-byte joins; the relational schema is insulated from identity-provider changes.
- **Canonical FKs over free text** for locations and amenities — one shared row per institution/amenity, so grouping and filtering join on IDs, not strings.
- **RESTRICT the canonical, CASCADE the offer-scoped.** `locations`, `amenities`, and `users` refuse deletion while referenced; `properties → rental_units → listings → price_components/photos` cascade, so removing an offering never orphans child rows.
- **`users` owns identity, `properties` owns the offer tree.** Single ownership anchor `properties.owner_user_id`; no `owner_id` denormalized downstream (§7).
- **Paise integers for money** (`BIGINT`, never float); paired-nullable patterns (`lat/lng`, `capacity/sharing`, `available_from`) enforced by CHECKs, with `NULL` always meaning "unspecified", never "zero".

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
Concretely: Room 101 double @ ₹8,000/person vs Room 102 triple @
₹6,500/person — different availability, photos, and price — cannot be
represented honestly with `PROPERTY → LISTING` alone.

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

`title` (2–200, API-required; **NOT NULL in PostgreSQL since migration
`0014`**), `description` optional, `rent_basis` drives price-row consistency
(a `RENT` row whose `calculation_basis` differs → 422, on both PUT and
PATCH-basis-change). `availability_status`: `AVAILABLE_NOW` (date must be
null), `AVAILABLE_FROM_DATE` (required, not past), `OCCUPIED` (date null,
forbidden while `PUBLISHED`).

`DELETE /api/v1/owner/listings/{id}/draft` is the only removal path:
DRAFT-only (anything else → 422), storage-first B2 sweep, then one DB
transaction that deletes the listing plus dependents and the unit only if
orphaned — never the property (see §5 #13).

## 13. Publication system

`POST /api/v1/owner/listings/{id}/publish` (`listings.py:992-1023`) runs
**all** guards before any mutation:

- **A. Photos:** `READY` count ≥ 3 (app-level; PENDING never counts).
- **B. Rent:** ≥ 1 `RENT` price component.
- **C. Location:** underlying `Property` has non-blank `address_line` and
  `city`, plus either a non-null `area_location_id` or non-blank
  `area_custom_name` (read from DB, never the payload).
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

Worked shape (same listing capable — e.g. monthly PG: RENT
PER_PERSON MONTHLY ₹8,000 + FOOD PER_PERSON MONTHLY ₹2,000 +
MAINTENANCE PER_UNIT MONTHLY ₹500 + DEPOSIT PER_UNIT ONE_TIME ₹8,000
refundable). Honest-cost derivation rule: sum `amount_paise`
converted to monthly (÷1/÷3/÷12 for MONTHLY/QUARTERLY/ANNUALLY),
restricted to `mandatory + FIXED + periodic` rows; ONE_TIME,
USAGE_BASED, VARIABLE, and optional rows are excluded (variable usage
is surfaced as "+ … extra" / "starting from" language instead).
Deposit/optional/variable never enter the headline figure.

## 15. Photo system

```mermaid
stateDiagram-v2
    [*] --> PENDING : POST /photos:init
    PENDING --> READY : POST /photos:confirm
    PENDING --> FAILED : (future uploader)
    READY --> READY : re-confirm rejected (422)
```

Stored metadata: `storage_key` (globally UNIQUE), `mime`,
`width/height`, `size_bytes`, `display_order`, `is_cover`,
`upload_status`, `media_type`. Rules: ≤ 15 total records per listing
(app count check on init → 422; **no DB CHECK** — documented TOCTOU
note); ≥ 3 READY to publish; cover = lowest `(display_order, id)`
among READY with explicit marks winning, normalized atomically at
publish (PENDING marks are ignored and cleared).

**Object storage IS integrated** (`backend/app/storage.py`,
Backblaze B2 S3-compatible): bytes never transit the API. `POST
/photos:init` returns a short-lived presigned PUT URL (`ExpiresIn`
900s); the browser PUTs bytes directly to the bucket; `POST
/photos:confirm` flips `PENDING→READY` after validating size/type
(≤ 5 MiB, `MAX_PHOTO_BYTES`). Reads use presigned view URLs
(`ExpiresIn` 3600s) attached to READY photos. Keys are namespaced
`listings/{listing_id}/photos/{photo_id}.{ext}`. Missing objects are
treated as success on delete (retry-safe); genuine storage failures
raise `StorageError` → 503 with DB rows untouched (fail-closed).
`FakeStorageService` provides the same interface in-memory for tests;
missing B2 credentials make `photos:init` and `photos:confirm` return
503 through `require_storage()`. Photo reads (`GET`), photo PATCH/DELETE,
publish, pause, and draft deletion use optional storage instead: reads
degrade to `view_url: null`, while a storage mutation failure still
returns 503 with DB rows untouched (fail-closed). Credentials live only
in `B2_*` env vars (see `.env.example`); the browser only ever receives
short-lived URLs.

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

**FLOW F — Photos:** init (ownership → count ≤ 15 → server-generated
key → `PENDING`, 201) → browser PUT to the presigned URL →
confirm (scoped `(photo_id, listing_id)` lookup → storage existence, size,
and MIME checks → field updates → `READY`, 200).

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
| Production backend (Phases 2E–2G + hardening) | Complete: 13 listing endpoints, guards, lifecycle, atomicity; photo PATCH + DELETE; DRAFT-only `DELETE /{id}/draft` with storage-first B2 sweep |
| `design-prototype` owner flow | Rebuilt 11-chapter guided UX (What → Place → Where → Space → Included → Who → Photos → Price → Move-in → Name → Listing) with conditional questions, localStorage drafts (`agh-owner-drafts-v1`), simulated uploads. **Zero API calls** (verified by repo-wide grep) |
| Production `frontend/` owner UI | Account shell (signup/login/dashboard/account) **plus the real 14-chapter listing wizard** (`/owner/listings/new`, create + edit modes), Owner Studio sections (Continue/Needs Attention/Your Places with draft deletion), review-changes, real photo upload via presigned URLs |
| Future work | Public search/detail; real-time messaging; broader room-level layout/BHK semantics beyond the current `rental_units.layout` whole-home values (`models.py:248-252`; see open product questions in the final report) |

LocalStorage draft state must never be mistaken for production
persistence.

---

## 18. Frontend architecture

Next.js 16 + React 19 + TypeScript + Tailwind v4 (`rent-frontend`).
App Router routes: `/`, `/login`, `/signup`, `/onboarding`,
`/profile`, `/list-your-property`, `/owner/{signup,login,dashboard,
account}`, `/owner/listings/new` (create + edit wizard). No
search/detail/property routes in production frontend (those live only
in the prototype).

```mermaid
flowchart TB
    subgraph FE["frontend/"]
        PAGES["App Router pages<br/>(server prerender + client forms)"]
        AUTH["AuthProvider<br/>(Firebase user context)"]
        API["lib/api.ts<br/>fetch + Bearer + ApiError"]
        FB["lib/firebase.ts<br/>demo config + emulator"]
        COMP["components/<br/>auth-ui, brand,<br/>location-search, owner-ui"]
        STORE["lib/onboarding-storage.ts<br/>(localStorage draft)"]
        WIZ["owner/listings/new<br/>14-chapter wizard + edit mode"]
        STUDIO["owner/dashboard<br/>Continue/Needs Attention/Your Places"]
        FLOWS["lib/ flows<br/>submit/save/edit/publish<br/>photo-upload/studio-data/draft-delete"]
    end
    PAGES --> AUTH & API & COMP & STORE
    API --> FB
    WIZ --> FLOWS & STORE
    STUDIO --> FLOWS
    FLOWS --> API
```

Interaction → request path: form component → `getIdToken()` from
`AuthProvider` → `api.ts` `request()` attaches
`Authorization: Bearer` → `fetch` → typed response or thrown
`ApiError(status, detail)`. Firebase config prefers
`NEXT_PUBLIC_*` env, else demo/emulator defaults, so `npm run dev`
works with zero configuration. `onboarding-storage.ts` persists the
renter onboarding draft in localStorage (prototype-grade, same pattern
as the design sandbox). Owner listing drafts persist per-uid in
`owner-listing-drafts:{uid}` (create flow) and edit sessions in
`owner-listing-edits:{uid}:{listingId}`; the dashboard aggregates both
against backend inventory (`studio-data.ts`) with backend lifecycle as
the authority for what is resumable vs attention-worthy.

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
- **Status codes:** 200 for reads/updates; 201 for created resources and
  first-time owner signup; 200 when an existing `OWNER` repeats signup;
  204 for successful photo and DRAFT deletions; 401 bad/missing token;
  403 wrong role; 404 uniform not-found (isolation-safe); 409 for the
  implemented conflicts (`uq_listings_unit_active`,
  `uq_lpc_c10_unique`, `ACCOUNT_TYPE_CONFLICT`); 422 validation
  (Pydantic + business rules + DB CHECK violations mapped from
  `IntegrityError` after rollback); 503 when configured photo storage is
  unavailable, or when `photos:init`/`photos:confirm` is called without
  B2 credentials; 500 for unhandled exceptions.
- **Ownership errors** are always 404, never 403 — a deliberate
  information-hiding rule (see §7).
- **PATCH semantics** (`/users/me/profile`, properties, units,
  listings): omitted fields are left unchanged (`exclude_unset`);
  explicit `null` clears where the schema allows (else 422); supplied
  values are validated in three layers — Pydantic types
  (`extra="forbid"` rejects unknown keys) → service checks (FK
  type-matching, e.g. a workplace id as a college → 422; effective
  `budget_min ≤ budget_max`) → PostgreSQL CHECKs as final defense.

---

## 20. Error handling

No global exception handler and no error envelope beyond FastAPI's
default `{"detail"}`. Strategy per layer:

| Code | Generated where | Meaning |
|---|---|---|
| 401 | `auth.py:37-43,45-54` | Missing/malformed/invalid Bearer token |
| 403 | `auth.py:169-180` (`require_role`) | Authenticated but wrong role |
| 404 | `_owned_*_or_404` helpers; scoped photo lookup | Missing **or foreign** resource (uniform message) |
| 409 | Implemented conflicts (`uq_listings_unit_active`, `uq_lpc_c10_unique`, `ACCOUNT_TYPE_CONFLICT`) | Conflict / duplicate identity |
| 422 | Pydantic validation, service guards (occupancy, C1–C10, availability, publish guards), `IntegrityError` fallback after rollback | Unprocessable input or violated business rule |
| 500 | Unhandled (TestClient uses `raise_server_exceptions=False` in tests) | Not shaped by the app — no custom 500 handling exists |
| 503 | Missing B2 credentials on `photos:init`/`photos:confirm`, or a failed B2 object mutation on photo/draft deletion | Storage dependency unavailable; database rows remain untouched |

Validation errors from Pydantic return field-level detail lists;
business-rule failures return single human-readable `detail` strings
(the owner UX maps these to friendly copy; raw codes never surface).

## 21. Security architecture

**CURRENTLY IMPLEMENTED:** Firebase ID-token verification (Admin SDK,
emulator-aware init; `verify_id_token()` is called without a revocation
option, so revocation is not checked); RBAC via `require_role`
(`USER`/`OWNER`; `ADMIN` defined but unused); per-resource ownership
joins with uniform 404s; `extra="forbid"` on all write schemas +
`Literal` enums + range patterns (pincode, phone, geo); DB CHECKs as
last-line defense; CORS browser-origin configuration
(`http://localhost:3000`, methods GET/POST/PUT/PATCH/DELETE, headers
Authorization/Content-Type, credentials allowed); secrets exclusively
via env (`.env` git-ignored, only `.env.example` committed); test-only
dependency overrides for auth (never production wiring).

**CORS is not authentication or authorization.** It can influence a
browser's cross-origin behavior, but the API trusts only the verified
Firebase bearer token and the PostgreSQL role/ownership lookup—not the
request origin.

**NOT PRESENT (verified gaps, not assumptions):** rate limiting; HTTPS
enforcement or additional middleware; global request-size limits; token
revocation checking; audit logging; production secret management;
WAF/CDN policy; admin moderation tooling. The absence of a control does
not establish that it is exploitable; these are hardening gaps to decide
before production use.

**Input bounds need review.** Most text fields have explicit Pydantic
limits (`properties.py:43-48`, `rental_units.py:78`), but
`listing.description` has no `max_length` (`listings.py:146`) and the
price-component replacement endpoint accepts an unbounded list
(`listings.py:635-638`).

**Configuration risk:** the backend uses development-friendly defaults
when variables are absent (`DATABASE_URL` in `db.py:9-12`,
`FIREBASE_PROJECT_ID` in `auth.py:17-18`, B2 endpoint/bucket/expiry in
`storage.py:16-24`). Those defaults help local startup, but missing
configuration does not fail fast.

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
| Required-field nullability | Mixed: DB NOT NULL + API-level guards (for example, `title` is NOT NULL in both PostgreSQL and the API) |

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
(migrations + models), `test_auth.py`, `test_cors.py` (incl. a DELETE
preflight regression test), `test_health.py`, `test_locations.py`,
`test_owners_signup.py`, `test_users_me.py`, `test_users_profile.py`,
`test_2c_properties.py`, `test_2d_rental_units.py`,
`test_2e_listings.py` (foundation + publication + draft deletion,
incl. a threaded same-unit concurrency test),
`test_2f_domain.py`, `test_2h_listing_photos.py`.
Conventions: canned Firebase claims via dependency override, per-test
DB cleanup keyed by uid prefix (`t2c-`, `t2d-`, `t2e-`), module engine
fixture that **skips** when PostgreSQL is unreachable, negative-path
heavy (401/403/404/409/422 matrices), atomicity tests (failed writes
leave DB unchanged).

Frontend: **vitest** (`npm run test`), Testing Library + jsdom for
component tests; `lib/**/*.test.ts` for pure logic
(draft/submit/save/edit/publish/photo/studio/delete flows);
`// @vitest-environment jsdom` pragma per DOM file. API functions are
injected as props rather than module-mocked.

> Count status (commit-scoped, not absolute): at commit `bf8e100`
> the backend suite reported **486 passed, 15 failed** — the 15 are
> pre-existing local-PostgreSQL data-pollution failures in
> `test_2b_models.py` (5) / `test_models.py` (10) that reproduce on a
> pristine tree; the frontend suite reported **473 passed, 0 failed**
> across 22 files. Re-verify with `pytest -q` / `npm run test` and
> record the new figures here with their commit — never quote bare
> totals.

## 26. Current vs future architecture

**CURRENT:** modular monolith + single PostgreSQL + Firebase Auth;
owner supply-side backend complete (CRUD → publish/pause/delete);
renter profile/onboarding + owner account in production frontend;
production 14-chapter listing wizard + Studio dashboard; B2-backed
photo upload/confirm/view; UX sandbox disconnected; no search,
messaging, visits, payments, uploads beyond photos, search engine,
cache, workers, or realtime layer.

**DEFERRED (documented, intentionally absent):** Redis, Elasticsearch/
OpenSearch, WebSockets, background workers, microservices, Kubernetes,
payments, video processing, KYC/admin approval, native mobile apps,
public search/detail endpoints. Rationale (per `PROJECT_STATUS.md` +
code): single-digit-team stage, read/write patterns fit one database,
premature infrastructure would add operational cost without a load or
feature driver.

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

## 29. Architectural decisions (ADR index)

The complete decision records live in [`docs/decisions/`](decisions/README.md)
and are append-only. The table below points to them; it does not repeat
their full context, decisions, or consequences.

| ID | Decision | Status |
|---|---|---|
| [0001](decisions/0001-modular-monolith.md) | Modular monolith over microservices | Accepted |
| [0002](decisions/0002-postgresql-system-of-record.md) | PostgreSQL as the system of record | Accepted |
| [0003](decisions/0003-firebase-authentication.md) | Firebase Authentication | Accepted |
| [0004](decisions/0004-property-unit-listing-split.md) | Property / RentalUnit / Listing split | Accepted |
| [0005](decisions/0005-ownership-through-property.md) | Ownership derived through Property | Accepted |
| [0006](decisions/0006-pricing-components-whole-set-put.md) | Pricing as components with whole-set replacement | Accepted |
| [0007](decisions/0007-metadata-first-photos.md) | Metadata-first photos | Superseded by [0014](decisions/0014-b2-photo-storage.md) |
| [0008](decisions/0008-no-premature-infrastructure.md) | No Redis, Elasticsearch, or background workers | Accepted |
| [0009](decisions/0009-emulator-first-local-auth.md) | Emulator-first local authentication | Accepted |
| [0010](decisions/0010-disconnected-prototype.md) | Prototype kept disconnected | Accepted |
| [0011](decisions/0011-email-google-over-phone-otp.md) | Email/Password and Google over phone OTP for MVP | Accepted |
| [0012](decisions/0012-lazy-provisioning-eager-profile.md) | Lazy user provisioning with an eager profile row | Accepted |
| [0013](decisions/0013-client-route-guards.md) | Client-side route guards with server-side enforcement | Accepted |
| [0014](decisions/0014-b2-photo-storage.md) | Backblaze B2 S3-compatible photo storage | Accepted |

## 30. Risks / technical debt

| Severity | Problem | Evidence | Impact → Direction |
|---|---|---|---|
| MEDIUM | `ADMIN` role is dead (in CHECK, zero routes) | grep: no `require_role("ADMIN")` in `app/` | Confusion + future 500s if assumed → either wire admin routes or document as reserved |
| INFO | `Listing.title` hardened to NOT NULL in migration `0014` (zero-NULL audit) | `models.py:406`; `0014_property_enums_and_flags.py:27-39` guard | Resolved in Phase 2F; §8, §12, and §22 now agree |
| MEDIUM | No public read API: `PUBLISHED` has no consumer | No `GET /listings` public route | Supply side is complete but unrenterable → next backend phase is public search/detail |
| MEDIUM | Photo 15-max has a TOCTOU race (count-then-insert) | `init_listing_photo()` checks `len(total_photos) >= MAX_PHOTOS_PER_LISTING` before inserting (`listings.py:722-735`) | Concurrent inits could exceed 15 → DB-level guard in hardening phase |
| MEDIUM | Production hardening controls are absent | CORS is the only middleware (`main.py:15-21`); repository grep for rate limiting, HTTPS redirection/trusted hosts, and global body-size middleware finds no controls; token verification does not request revocation (`auth.py:52`) | Correctness/security decisions must precede production deploy; absence alone does not establish exploitability |
| LOW | Some text/array inputs have no bounds | `listing.description` has no `max_length` (`listings.py:146`); `PUT price-components` accepts an unbounded list (`listings.py:635-638`) | Large or malformed payloads can reach the database/service layers → add bounds after measuring legitimate cases |
| LOW | `MIN_READY_PHOTOS_FOR_PUBLISH` is defined but unused | `storage.py:28` is the only repository occurrence | Publication uses a hard-coded `3` (`listings.py:961`) → import the constant or remove it |
| LOW | Model/DDL defaults and coordinate types do not match exactly | `models.py` uses Python-side `default=` and `Float` for lat/lng (`models.py:45-46,180-181`), while migrations create several `server_default`s and `sa.Double()` columns (`0008_create_properties.py:37,42-43` and related migrations) | No observed behavioral bug, but ORM metadata is not a complete DDL source → treat migrations as DDL truth and add explicit defaults/types when behavior depends on them |
| LOW | Missing configuration does not fail fast | `DATABASE_URL`, `FIREBASE_PROJECT_ID`, and B2 settings have development-friendly defaults (`db.py:9-12`, `auth.py:17-18`, `storage.py:16-24`) | Convenient locally, risky for production deploy → require explicit configuration outside development |
| LOW | Business-logic deprecation warnings (`HTTP_422_UNPROCESSABLE_ENTITY`) | Test output across modules | Noise → migrate to `HTTP_422_UNPROCESSABLE_CONTENT` |
| INFO | `RENTED`/`ARCHIVED` in status CHECK, unused | `models.py:375-377` | By design (deferred); keep documented, don't "clean" without a lifecycle decision |
| INFO | `UserProfile` `.one()` raises uncaught 500-shape if profile missing | `users.py:63-65,76` | Auto-provisioning makes it rare; harden with 404 when touched |

## 31. Diagram index

High-level architecture (§1), request lifecycle (§2), repository map
(§3), module dependencies (§4), API tables (§5), auth sequence (§6),
RBAC tree (§7), ER diagram (§8), domain model (§9), listing lifecycle
(§12), publish flow (§13), photo lifecycle (§15), flows A–H (§16),
frontend map + request path (§§18–19), local deployment (§23).

## 32. Traceability

**Owner creates listing:** production wizard (`/owner/listings/new`)
→ `POST /api/v1/owner/listings` → `ListingCreate` (`listings.py:142`) →
`_owned_unit_or_404` + `_validate_availability` → `Listing`
(`models.py:368`) → `listings` table → 201 `ListingRead`.

**Owner sets pricing:** production wizard price chapter → `PUT
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
publish/pause/delete, 13 listing endpoints, 21 owner endpoints total);
production 14-chapter listing wizard + Studio dashboard with draft
deletion; B2-backed photo upload/confirm/view; disconnected UX
prototype with zero API calls; no CI, no prod deploy, no
search/detail/booking/payment infrastructure.

**CURRENT STRENGTHS:** invariants enforced at the right layers
(DB CHECKs + service guards + Pydantic); uniform 404 isolation;
atomic whole-set writes with rollback-tested guarantees; emulator-zero-config
local dev; phase-disciplined git history; negative-path-heavy tests.

**CURRENT LIMITATIONS:** dead ADMIN role;
no public read path (published listings invisible); observability
limited to two health endpoints; prototype and production frontends
share no components.

**NEXT ARCHITECTURAL STEPS (in order, no premature infra):**
1. Public `GET` search/detail endpoints consuming `PUBLISHED` (+ photo
   URL resolution strategy).
2. Decide ADMIN scope or drop the role value; add structured logging +
   error tracking before any production deploy.
3. Only then: read replicas, FTS/OpenSearch, Redis, workers — each on
   measured need.



