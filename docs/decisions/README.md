# Architectural decision records

This index is the discoverable home for architectural decisions.
`docs/SYSTEM_DESIGN.md` remains authoritative for current architecture
and domain behavior; these records preserve the decision, rationale,
and status without duplicating the full current design.

Records are append-only: correct a decision by adding a new record and
changing statuses, not by rewriting history. Numeric order follows the
order in which the decisions appeared in `SYSTEM_DESIGN.md`; because
adoption dates were not recorded, the numbers do not assert a separate
chronology.

| ID | Decision | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith over microservices | Accepted |
| [0002](0002-postgresql-system-of-record.md) | PostgreSQL as the system of record | Accepted |
| [0003](0003-firebase-authentication.md) | Firebase Authentication | Accepted |
| [0004](0004-property-unit-listing-split.md) | Property / RentalUnit / Listing split | Accepted |
| [0005](0005-ownership-through-property.md) | Ownership derived through Property | Accepted |
| [0006](0006-pricing-components-whole-set-put.md) | Pricing as components with whole-set replacement | Accepted |
| [0007](0007-metadata-first-photos.md) | Metadata-first photos | Superseded by [0014](0014-b2-photo-storage.md) |
| [0008](0008-no-premature-infrastructure.md) | No Redis, Elasticsearch, or background workers | Accepted |
| [0009](0009-emulator-first-local-auth.md) | Emulator-first local authentication | Accepted |
| [0010](0010-disconnected-prototype.md) | Prototype kept disconnected | Accepted |
| [0011](0011-email-google-over-phone-otp.md) | Email/Password and Google over phone OTP for MVP | Accepted |
| [0012](0012-lazy-provisioning-eager-profile.md) | Lazy user provisioning with an eager profile row | Accepted |
| [0013](0013-client-route-guards.md) | Client-side route guards with server-side enforcement | Accepted |
| [0014](0014-b2-photo-storage.md) | Backblaze B2 S3-compatible photo storage | Accepted |
