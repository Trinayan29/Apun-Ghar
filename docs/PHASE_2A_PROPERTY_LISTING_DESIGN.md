# Phase 2A — Property + Listing Marketplace Design

> **Status: DESIGN ONLY. Nothing in this document is implemented.**
> No migrations, models, APIs, or frontend pages were built for Phase 2.
> Migrations remain at `0006`. Existing code, migrations, docs, and the
> design prototype were not modified.
>
> Convention in this document:
> - `CURRENT` — already implemented (Phases 0–4A).
> - `PROPOSED` — recommended design for the next phase(s). Not built.
> - `DEFERRED` — intentionally not built yet; design must not block it.

---

## 1. Executive recommendation

`PROPOSED`: model the marketplace as three levels:

```text
OWNER (users.role='OWNER')
  └─ PROPERTY (physical building/place)
       └─ RENTAL_UNIT (rentable room/bed/flat/studio)
            └─ LISTING (commercial offer + lifecycle)
```

* `PROPERTY` holds building truth: address, canonical area, lat/lng, structure.
* `RENTAL_UNIT` holds rentable truth: room type, occupancy, furnishing, bathrooms, gender scope, amenities.
* `LISTING` holds commercial truth: title/description, lifecycle status, availability, photos, **listing-level pricing** (`listing_price_components`), rent-basis denominator.
* Pricing uses normalized charge components with separate `charge_type`, `calculation_basis`, `billing_frequency`, and `payment_timing` (finalized §8). Money in paise `BIGINT`, never float.
* Location: free-form address + `area_location_id` FK + `latitude/longitude DOUBLE PRECISION NULL`. No PostGIS yet; schema is PostGIS-convertible later.
* Amenities: normalized admin-controlled `amenities + rental_unit_amenities`.
* Lifecycle: `DRAFT → PUBLISHED ⇄ PAUSED` (three statuses; ended states `RENTED`/`ARCHIVED` deferred), no admin-approval gate now.
* Photos: provider-agnostic `listing_photos` metadata; R2/S3 later.
* Security: single ownership anchor `properties.owner_user_id`; all child access scoped by join; server-side `require_role("OWNER")`.
* Search stays PostgreSQL-only (B-tree + `ILIKE` + joins + derived estimates). No ES/OpenSearch/Redis/workers/WebSockets/microservices/K8s.

Why three levels instead of two: PG/hostel reality (Room 101 double @ ₹8,000/person vs Room 102 triple @ ₹6,500/person, different availability/photos/price) cannot be represented honestly with `PROPERTY → LISTING` alone. The extra join cost is justified and mitigated by small implementation slices (§27).

---

## 2. Product/domain assumptions

* `CURRENT`: rental marketplace for students + young professionals; PGs, hostels, private/shared rooms, flats; Guwahati-first seed (colleges, workplaces, areas); transparent total cost + college/workplace proximity differentiators.
* `CURRENT`: separate `USER` (renter) and `OWNER` (lister) identities in one Firebase project; no `USER → OWNER` promotion; `OWNER` gets no `UserProfile`; no KYC/approval/SMS OTP/phone verification for listers.
* `PROPOSED`: city is a column value (`Guwahati`), never hard-coded into enums or table names; taxonomy and seed support a second city without schema change.
* `PROPOSED`: one property may contain heterogeneous units; units may reprice/relist independently.
* `DEFERRED`: messaging, visits, saved listings, roommate matching, reviews, moderation/verification workflows, payments/booking, analytics, recommendations, video processing.

---

## 3. Property vs Listing decision

`PROPOSED`: **Option A — `OWNER → PROPERTY → LISTING`, with `RENTAL_UNIT` between them (§4).**

* Rejected Option B (`OWNER → LISTING` flat): conflates physical place with commercial offer; breaks when one PG has several rents, when a room is relisted at a new price, or when photos/availability differ per room. Would force JSON arrays or duplicate addresses and create migration debt at the first multi-room PG.
* Complexity introduced: 3 tables + 2 joins for marketplace reads; copy-on-republish logic; ownership must traverse joins.
* Why justified: matches the real business (buildings contain rentable units; units have successive offers). Enables independent availability, pricing history, and per-unit photos without schema rework.
* Simplification guardrail: Phase 2 ships a “one property → one unit → one listing” happy path in UI; the schema still supports N units from day one.

---

## 4. Rental-unit decision

`PROPOSED`: **include `RENTAL_UNIT` now** (per approved direction), not later.

* `PROPERTY → RENTAL_UNIT → LISTING` is the canonical chain.
* Physical/rentable attributes live on the unit; merchandising/lifecycle attributes live on the listing (see contradiction resolution R3, §26).
* Without units, PG/hostel shared accommodation cannot distinguish per-room occupancy, gender scope, or furnishing. With units deferred, the first PG onboarding would force a redesign. With units now, a single-room flat simply has one unit — negligible overhead.
* Rule: every `LISTING` references exactly one `rental_unit_id`; every `rental_unit` references exactly one `property_id`. No direct `listing → property` FK (avoids dual paths; resolve via join).

---

## 5. Property types

`PROPOSED`: separate two controlled vocabularies. Do not copy NoBroker.

* `properties.property_type` (what the building is):
  `PG, HOSTEL, APARTMENT_FLAT, INDEPENDENT_HOUSE, STUDIO_BUILDING, OTHER`
* `rental_units.unit_type` (what is rented):
  `PRIVATE_ROOM, SHARED_ROOM_BED, ENTIRE_FLAT, ENTIRE_STUDIO, PG_BED, OTHER`
* Enforced via DB `CHECK` (small, stable sets). Values are uppercase codes; UI labels map separately (allows “Flat” vs “Apartment” wording without migration).
* `DEFERRED`: floor-plan entities (bed-level inventory with individual bed IDs), broker tooling.

---

## 6. Location architecture

* `CURRENT`: canonical `locations(id, type, name, city)` with `type ∈ (college, workplace, area)`, index `ix_locations_type_name`, seed Guwahati rows, `ILIKE` search, no coordinates.
* `PROPOSED` on `properties` only (single-homed; units/listings join — never duplicate):
  * `address_line TEXT NOT NULL` (free-form street address)
  * `locality TEXT NULL` (e.g. “Beltola Tiniali”)
  * `area_location_id INT NULL FK → locations.id RESTRICT` (must be `type='area'` when set; service-validated)
  * `city TEXT NOT NULL DEFAULT 'Guwahati'`
  * `pincode VARCHAR(10) NULL`
  * `latitude DOUBLE PRECISION NULL CHECK (-90..90)`, `longitude DOUBLE PRECISION NULL CHECK (-180..180)`; both NULL or both set (row CHECK)
  * `nearest_college_id INT NULL FK RESTRICT`, `nearest_workplace_id INT NULL FK RESTRICT` — human-curated anchors for “near ADTU” display when geo is absent
* What is stored: address + area FK + coordinates when known.
* What is derived: distance, commute label, map pin rendering.
* Optional: all geo + nearest links nullable so owner onboarding works without a GPS pin.
* Indexed: `(area_location_id)`, `(city, area_location_id)`. No GiST/PostGIS now.
* `DEFERRED`: PostGIS `geography(Point)`, GIST radius queries, geocoding pipeline, alias/acronym search (`pg_trgm` later).

---

## 7. Proximity architecture

`PROPOSED`: store coordinates now, compute distance at read time, cache nothing in v1.

* “How far from ADTU?” = Haversine in Python/SQL over `properties.latitude/longitude` vs canonical institution coordinates **when available**; else fall back to curated `nearest_*_id` label (“Near ADTU · Beltola”).
* “Within 3 km of my college” (future) = bounding-box prefilter on lat/lng today, PostGIS `ST_DWithin` later. Schema supports both because columns are plain doubles convertible via `ALTER ... USING ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography`.
* Canonical `locations` rows do **not** get coordinates in Phase 2 (keeps seed simple); add nullable lat/lng to `locations` in a later migration when radius search is actually built.
* `DEFERRED`: stored distance cache, commute-time provider, map SDK dependency.

---

## 8. Pricing model (FINALIZED — approved)

`PROPOSED`: listing-level normalized components. No single monthly-rent field. No JSON pricing.

### 8.1 Owner table

Components attach to `listings` (offer history preserved across relists):

```text
listing_price_components:
  id PK
  listing_id FK → listings.id ON DELETE CASCADE
  charge_type ENUM: RENT, DEPOSIT, MAINTENANCE, FOOD, ELECTRICITY, WATER, INTERNET, OTHER
  label TEXT NULL — REQUIRED iff OTHER, else NULL
  calculation_basis ENUM: PER_PERSON, PER_ROOM, PER_UNIT, CONSUMPTION
  billing_frequency ENUM: MONTHLY, QUARTERLY, ANNUALLY, ONE_TIME, USAGE_BASED
  variability ENUM: FIXED, VARIABLE
  amount_paise BIGINT NULL CHECK >=0
  rate_paise_per_unit BIGINT NULL CHECK >=0
  consumption_unit TEXT NULL (e.g. 'kWh')
  mandatory BOOLEAN NOT NULL DEFAULT true
  included_in_advertised BOOLEAN NOT NULL DEFAULT false
  refundable BOOLEAN NOT NULL DEFAULT false
  payment_timing ENUM: PER_PERIOD, UPFRONT_FULL, ON_MOVE_IN, ON_EXIT_SETTLED
  display_order INT NOT NULL DEFAULT 0
```

Separate concepts: `charge_type` (what) / `calculation_basis` (how it scales) / `billing_frequency` (accrual cadence) / `payment_timing` (when cash is collected). Tenancy commitment (`minimum_stay_months`, `notice_period_days`) is **not pricing** — deferred to listing-level tenancy fields (§11/§24).

CHECKs (contradiction-free):

```text
C1: (amount_paise IS NOT NULL) XOR (rate_paise_per_unit IS NOT NULL)
C2: basis=CONSUMPTION ⇔ rate set AND consumption_unit NOT NULL
    AND variability=VARIABLE AND billing IN (USAGE_BASED, MONTHLY)
C3: basis!=CONSUMPTION ⇒ amount set AND consumption_unit IS NULL
C4: variability=VARIABLE ⇒ rate set
C5: DEPOSIT ⇒ billing=ONE_TIME AND variability=FIXED AND refundable=true
    AND amount set AND payment_timing IN (ON_MOVE_IN, UPFRONT_FULL)
C6: RENT ⇒ mandatory=true AND variability=FIXED AND amount set
C7: billing=ONE_TIME ⇒ payment_timing != PER_PERIOD
C8: billing IN (MONTHLY,QUARTERLY,ANNUALLY) AND variability=FIXED ⇒ amount set
C9: OTHER ⇒ label NOT NULL; non-OTHER ⇒ label IS NULL
C10: UNIQUE(listing_id, charge_type, calculation_basis, billing_frequency)
```

Indexes: `(listing_id)`, `(listing_id, mandatory, variability, billing_frequency)`.

### 8.2 Worked examples (same listing capable)

Annual-PG listing (`listings.rent_basis = PER_PERSON`):

| charge | basis | freq | amount/rate | flags | timing |
|---|---|---|---|---|---|
| RENT | PER_PERSON | ANNUALLY | 8,000,000 paise (₹80k) | mandatory FIXED | UPFRONT_FULL |
| FOOD | PER_PERSON | MONTHLY | 200,000 paise | mandatory FIXED | PER_PERIOD |
| MAINTENANCE | PER_UNIT | MONTHLY | 50,000 paise | mandatory FIXED | PER_PERIOD |
| ELECTRICITY | CONSUMPTION | USAGE_BASED | 1,000 paise/kWh | mandatory VARIABLE | PER_PERIOD |
| DEPOSIT | PER_UNIT | ONE_TIME | 1,000,000 paise | mandatory FIXED refundable | ON_MOVE_IN |

Monthly-PG listing: RENT PER_PERSON MONTHLY ₹8,000 + FOOD PER_PERSON MONTHLY ₹2,000 + MAINTENANCE PER_UNIT MONTHLY ₹500 + DEPOSIT PER_UNIT ONE_TIME ₹8,000 refundable.

### 8.3 Estimated monthly cost (derived, never stored as truth)

```text
monthly_equiv(c):
  MONTHLY → amount_paise; QUARTERLY → amount/3; ANNUALLY → amount/12
  ONE_TIME, USAGE_BASED → excluded
estimate = SUM(monthly_equiv)
  WHERE mandatory=true AND variability=FIXED
  AND billing IN (MONTHLY, QUARTERLY, ANNUALLY)
```

Rules: deposit/optional/variable never included; variable triggers “+ electricity at ₹10/kWh extra” and “starting from” language; annual source stays annual (`₹96,000/year (~₹8,000/mo equiv.)`); per-person vs per-unit bases labeled via `rent_basis`. Computed at read time; future materialized view allowed.

* `DEFERRED`: slabs/tiers, discounts, taxes, proration, multi-currency, payment ledger.

---

## 9. Rent basis

`PROPOSED`: `listings.rent_basis ENUM(PER_PERSON, PER_ROOM, PER_UNIT)` — denominator only. Frequency lives solely in components (§8). Removed earlier `PER_*_MONTH` variants as redundant.

* Headline display denominator; should match the `RENT` component’s basis (service validation, not cross-table DB CHECK).
* Components may mix bases (per-person rent + per-unit maintenance); UI must label each line.
* `DEFERRED`: per-bed headline basis.

---

## 10. Occupancy

`PROPOSED`: unit-level only.

* `rental_units.occupancy_type ENUM(SINGLE, DOUBLE, TRIPLE, QUAD_PLUS)`, `capacity INT NOT NULL CHECK >0`, `sharing ENUM(PRIVATE, SHARED) NOT NULL`.
* Consistency (each a DB CHECK): SINGLE ⇒ capacity 1 + PRIVATE; SHARED ⇒ capacity ≥2; PRIVATE ⇒ capacity 1.
* Property/listing levels hold no occupancy (avoids triple source of truth).

---

## 11. Property/listing fields

`PROPOSED` split (physical vs rentable vs commercial):

* `properties`: `owner_user_id`, `property_type`, address/geo/area (§6), `gate_closing_time TIME NULL`, `is_independent BOOLEAN NULL`, `total_floors NULL`, `built_year NULL`, timestamps. No title/price/occupancy.
* `rental_units`: `property_id`, `unit_type`, `occupancy_type/capacity/sharing`, `furnishing ENUM(UNFURNISHED, SEMI_FURNISHED, FURNISHED)`, `bathrooms INT NULL`, `floor_number NULL`, `carpet_area_sqft NULL`, `gender_scope ENUM(ANY, MALE, FEMALE)` (§13), tri-state policy booleans (§13), `house_rules TEXT NULL`, timestamps.
* `listings`: `rental_unit_id` with partial `UNIQUE(rental_unit_id) WHERE status IN (DRAFT,PUBLISHED,PAUSED)` (one active offer per unit; ended states deferred — see §14), `title`, `description`, `rent_basis`, `status`, `availability_status + available_from` (§16), timestamps. `minimum_stay_months`, `notice_period_days`, `verification_status`, `moderation_notes` are DEFERRED and absent from the current schema.
* Title/description only on listing; floor/bath on unit (+ total_floors on property); no duplicated columns across levels.

---

## 12. Amenities

`PROPOSED`: normalized (approved), attached to **units** (physical truth):

```text
amenities(id PK, slug UNIQUE, label, category NULL, icon_slug NULL, is_active BOOLEAN DEFAULT true)
rental_unit_amenities(rental_unit_id FK CASCADE, amenity_id FK RESTRICT, PRIMARY KEY(unit, amenity))
```

* Why over enum/JSONB: filterable (`WHERE EXISTS`), addable without code deploy, referential integrity, indexable `(amenity_id, rental_unit_id)`.
* Seed via migration data (13 rows): `wifi`, `ac`, `parking`, `power-backup`, `laundry`, `food-mess`, `drinking-water`, `security-guard`, `attached-bath`, `balcony`, `kitchen-access`, `cctv`, `housekeeping`; `is_active=false` retires without breaking history.
* `DEFERRED`: amenity categories/facets UI, per-photo amenity tags.

---

## 13. Tenant preferences

`PROPOSED`: `rental_units.gender_scope ENUM(ANY, MALE, FEMALE)` (unit-level; listing displays).

* Tri-state policy booleans on `rental_units` (`couple_friendly`, `visitors_allowed`, `pets_allowed`, `smoking_allowed`, `alcohol_allowed`): TRUE = allowed, FALSE = not allowed, NULL = unspecified (no FALSE default); `house_rules` stays free-text `TEXT NULL`.
* `properties.gate_closing_time TIME NULL` = curfew when known; NULL = not specified (not "no curfew").
* Avoids conflating preference with `unit_type`; extensible to future values without touching property types.
* `DEFERRED`: structured guests rules, food-preference tags, pet-policy enum.

---

## 14. Listing lifecycle

`PROPOSED`: `listings.status ENUM(DRAFT, PUBLISHED, PAUSED)`.

* Valid: `DRAFT→PUBLISHED`, `PUBLISHED⇄PAUSED`; DB CHECK + partial unique `uq_listings_unit_active` keep at most one active (`DRAFT/PUBLISHED/PAUSED`) listing per `rental_unit_id`.
* Actor: owning `OWNER` only; `ADMIN` transitions deferred.
* Visibility: only `PUBLISHED` appears in public marketplace; `DRAFT/PAUSED` are owner-scoped.
* `CURRENT` decision preserved: **no admin approval/KYC gate**. `verification_status`/`moderation_notes` are deferred future columns (absent from the current schema), no workflow invented.
* Ended states `RENTED`/`ARCHIVED` are deferred (future status values); offer history today = clone to a new listing row, never un-pause in place.
* Publishing guardrails (service, not DB): ≥3 `READY` photos, ≥1 `RENT` component, address + area set.

---

## 15. Photos/media

`PROPOSED`: `listing_photos` metadata on **listings** (merchandising truth):

```text
listing_photos(id PK, listing_id FK CASCADE, storage_key TEXT UNIQUE,
  mime TEXT, width/height INT NULL, display_order INT,
  is_cover BOOLEAN, upload_status ENUM(PENDING, READY, FAILED))
```

* Provider-agnostic `storage_key` (`photos/{listing_id}/{uuid}.jpg`); public URL via signed-URL/ CDN mapping later (R2/S3-compatible, undecided vendor).
* Cover = lowest `display_order` with `READY`; `is_cover` maintained by service.
* Reorder = update `display_order`; delete = hard delete row + async object delete (deferred worker; v1 deletes DB row and orphans object for later GC with `FAILED`/stale sweep).
* Limits: max 15 (service CHECK), min 3 `READY` before `PUBLISH`.
* Future video: `media_type ENUM(PHOTO, VIDEO) DEFAULT PHOTO` reserved on same table; no transcoding pipeline now.
* `DEFERRED`: direct-upload presigned flow, thumbnails, blurhash, EXIF strip verification.

---

## 16. Availability

`PROPOSED`: on `listings` (offer readiness), distinct from lifecycle (§14):

* `availability_status ENUM(AVAILABLE_NOW, AVAILABLE_FROM_DATE, OCCUPIED)`, `available_from DATE NULL`.
* `AVAILABLE_FROM_DATE ⇒ available_from NOT NULL AND >= CURRENT_DATE`; else NULL (CHECK).
* Valid combos: `PUBLISHED + AVAILABLE_NOW | AVAILABLE_FROM_DATE`; `OCCUPIED` only with `PAUSED | DRAFT` (service rule; `PUBLISHED+OCCUPIED` rejected). Prevents “book this occupied room” contradiction.
* No booking/inventory counts; “2 beds left” style copy deferred to unit `capacity` display logic.
* Future visit scheduling reads this + `status` without schema change.

---

## 17. Ownership/security

* `CURRENT`: Firebase UID → verified claims → PostgreSQL `users` → `role`; `require_role`; never trust client role/IDs.
* `PROPOSED`: single anchor `properties.owner_user_id FK → users.id RESTRICT` (prevent accidental owner wipe; explicit transfer flow later). `rental_units`/`listings`/`components`/`photos` carry **no** `owner_id` — ownership resolved by join chain. Every owner query scopes `WHERE properties.owner_user_id = current_user.id` + `require_role("OWNER")`; helper `get_owned_listing_or_404(db, user, listing_id)` joins through unit→property. Public marketplace uses separate unauthenticated read path that only selects `PUBLISHED` + safe columns (no phone, no exact address until enquiry phase).
* `DEFERRED`: co-owners/managers, admin impersonation audit.

---

## 18. Owner management domain

`PROPOSED` (reads for Owner Studio; no build yet): property count, units per property, listings by status (active/published/paused/draft), availability rollup, photo completeness, price completeness (has RENT?), derived estimate preview. All queries owner-scoped (§17). Enquiries/visits/views/revenue remain honest empty states (`CURRENT` dashboard behavior preserved).

---

## 19. Public marketplace domain

`PROPOSED` read model (unauthenticated browse/search/filter/detail later; authenticated save/message/visit deferred):

* Card: cover photo, title, area/locality, distance-when-anchor, headline price with `rent_basis` denominator, **estimated monthly + “+ variable” flag**, room/occupancy, gender scope, furnishing, availability badge.
* Details adds: full component breakdown (preserving source frequencies + monthly equivs), deposit line, variable-rate lines, amenities, all photos, map pin, description, availability date.
* Never expose: owner identity/phone, exact address (area-level only until enquiry), unpublished listings.

---

## 20. Search/filter implications

PostgreSQL-only. Fields that must be filterable drive indexes (§21):

* area/college/workplace (joins), property_type, unit_type, rent_basis, occupancy, furnishing, gender_scope, availability_status, status=PUBLISHED, estimated-cost range (subquery on components), amenities (EXISTS).
* No ES/OpenSearch/Redis/vector/`pg_trgm`/PostGIS in Phase 2. Trigram + PostGIS remain just-in-time migrations.

---

## 21. Database entities

`CURRENT`: `users, user_profiles, locations` (head `0006`).
`PROPOSED` (conceptual; no SQL/models/migrations in this task):

1. `properties` — building truth. PK id. `owner_user_id FK users.id RESTRICT`. Fields §6 + §11. Constraints: lat/lng both-or-neither + ranges; area FK type checked in service. Indexes: `(owner_user_id)`, `(city, area_location_id)`. Uniqueness: none global (same address re-registered by different owners allowed; dedupe deferred). Delete: `RESTRICT` owner; `CASCADE` to units (explicit owner-confirmed delete flow only).
2. `rental_units` — rentable truth. PK id. `property_id FK CASCADE`. Fields §10–§11 + `gender_scope`. Constraints: capacity/occupancy consistency. Indexes: `(property_id)`, `(unit_type, occupancy_type)`, `(gender_scope)`. Delete: `CASCADE` from property; `RESTRICT` when an active listing exists (service; `status IN (DRAFT,PUBLISHED,PAUSED)`).
3. `listings` — offer truth. PK id. `rental_unit_id FK CASCADE` + partial `UNIQUE(rental_unit_id) WHERE status IN (DRAFT,PUBLISHED,PAUSED)`. Fields §11 + §14 + §16 + `rent_basis`. Indexes: `(status, availability_status)`, `(rental_unit_id, status)`. Delete: `CASCADE` photos/components; ended-state retention deferred.
4. `listing_price_components` — §8. FK `CASCADE`. Delete with listing.
5. `amenities` — taxonomy. `slug UNIQUE`, `is_active`. Seeded. Delete: `RESTRICT` (deactivate instead).
6. `rental_unit_amenities` — join. Composite PK. FKs: unit `CASCADE`, amenity `RESTRICT`. Index `(amenity_id, rental_unit_id)`.
7. `listing_photos` — §15. FK `CASCADE`. `storage_key UNIQUE`. Index `(listing_id, display_order)`.

---

## 22. API boundaries (recommended, NOT implemented)

Owner management (auth + `OWNER` + ownership check):

```text
POST /api/v1/properties  GET /api/v1/properties  GET/PATCH /api/v1/properties/{id}
POST /api/v1/properties/{id}/units  GET /api/v1/properties/{id}/units  PATCH /api/v1/units/{id}
POST /api/v1/listings  GET /api/v1/listings  GET/PATCH /api/v1/listings/{id}
POST /api/v1/listings/{id}/publish  POST /api/v1/listings/{id}/pause  # ended states RENTED/ARCHIVED deferred
PUT  /api/v1/listings/{id}/availability  PUT /api/v1/listings/{id}/components (bulk replace, service-validated)
POST /api/v1/listings/{id}/photos:init  POST /api/v1/listings/{id}/photos:confirm  PATCH reorder  DELETE
```

Public marketplace (no auth for reads):

```text
GET /api/v1/marketplace/listings  GET /api/v1/marketplace/listings/{id}
```

Why split property/unit/listing resources instead of one fat endpoint: matches ownership levels, keeps payloads small, allows per-level authorization/tests, avoids giant multi-entity transactions. Bulk component replace (not per-row PATCH storm) keeps estimate validation atomic.

---

## 23. Source-of-truth vs derived data

| Source of truth (stored) | Derived (computed at read) |
|---|---|
| address, area FK, lat/lng | distance, “near X”, map pin |
| occupancy, furnishing, amenities links | search facets/counts |
| component amount/rate + source frequency | monthly equiv, estimated monthly |
| deposit amount | “move-in total” (estimate + deposit, display only) |
| lifecycle status, availability_status/date | visibility, badges, sort rank |
| photo storage_key + order | public URL, cover selection |
| RENT basis match | headline “₹X/person/mo” string |

Never persist estimate, distance, or headline string as authoritative.

---

## 24. Future compatibility (deferred, not blocked)

Verified owners/listings (verification columns deferred), moderation queue, saved listings (`saved_listings(user_id, listing_id)`), messaging (`threads/messages`, WS later), visits (`visits(listing_id, user_id, slot, status)`), roommate posts, video (`media_type=VIDEO`), PostGIS/`pg_trgm`, recommendations, reviews, reports, analytics, notifications, multi-city seed, bed-level inventory. None require re-homing ownership, location, pricing, or photos.

---

## 25. Migration strategy

* `CURRENT`: `0001–0006` immutable, head `0006`.
* `PROPOSED` → implemented as `0007–0012`:
  * `0007` amenities taxonomy + seed (13 rows)
  * `0008` properties (+ geo + area/nearest FKs + indexes)
  * `0009` rental_units + `rental_unit_amenities` join table (+ occupancy/gender/furnishing + indexes)
  * `0010` listings (+ lifecycle/availability/rent_basis + partial unique)
  * `0011` listing_price_components (+ CHECKs C1–C10 + indexes)
  * `0012` listing_photos (+ unique key + order index)
* Each migration: reversible `downgrade()`, `RESTRICT` where history matters, `CASCADE` where children are offer-scoped; upgrade→downgrade→upgrade tested; seed idempotent; no edit of `0001–0006`.

---

## 26. Risks/tradeoffs + contradiction resolutions

* Three levels + charge-lines is heavier than flat listings: more joins, harder first form, estimate subquery cost. Mitigated by slices (§27) + read view `marketplace_listings_v1` later. Chosen over under-modeling PG reality.
* Listing-owned pricing duplicates on republish: accepted; copy-on-republish helper; preserves history.
* Single-rate (no slabs): covers ₹10/kWh; slabs deferred with `OTHER` escape hatch.
* Per-resolution audit:
  * **R1 ownership:** only `properties.owner_user_id`; children join — no dual owner columns.
  * **R2 location:** only `properties` holds geo/area; units/listings join — no drift.
  * **R3 physical vs commercial:** amenities/occupancy/furnishing/gender on unit; title/lifecycle/availability/photos/pricing on listing; structure/address on property — each fact has one home.
  * **R4 photos on listings** so relists refresh merchandising without rewriting unit truth.
  * **R5 pricing on listings** so offers carry history; `rent_basis` matches RENT basis via service check.
  * **R6 lifecycle vs availability:** lifecycle = visibility, availability = readiness; `PUBLISHED+OCCUPIED` forbidden.
  * **R7 pricing purity:** denominator-only `rent_basis`; no `FIXED_OFFER`; commitment out of pricing.
  * **R8 derived discipline:** estimate/distance/cover never stored as truth.
* Production-quality check per decision: correctness (CHECKs), security (§17), maintainability (one home per fact), integrity (RESTRICT/CASCADE), extensibility (§24), queryability (§20–§21), migration simplicity (§25), UX (§19), ops simplicity (monolith, Postgres-only).

---

## 27. Recommended implementation slices

Each slice: clear boundary, testable outcome, no overlapping ownership, no giant change. Pricing reflects finalized §8.

* **2B Foundation:** `0007–0012` tables + constraints + seeds; model tests only; no APIs.
* **2C Owner property + unit CRUD:** property/unit endpoints + ownership scoping + area/geo validation; tests for cross-owner 404.
* **2D Listing + pricing:** listing draft + bulk component replace + estimate derivation + rent-basis validation; fixture both §8.2 cases.
* **2E Lifecycle + availability:** transitions, guards (photos/RENT/address), valid-combo matrix; 403/422/404 tests.
* **2F Media metadata:** init/confirm/reorder/delete + cover logic; no R2 bytes yet (key + status only).
* **2G Public marketplace reads:** `PUBLISHED`-only card/detail serializers with estimate + distance fallback; unauthenticated tests.
* **2H Search/filtering:** area/college/workplace, type, cost-range subquery, occupancy/furnishing/amenities/gender/availability; index verification with `EXPLAIN`.

---

*End of Phase 2A design. No Phase 2 implementation exists after this task.*
