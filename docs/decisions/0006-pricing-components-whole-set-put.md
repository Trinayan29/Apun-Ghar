# ADR 0006 — Pricing as components with whole-set replacement

- **ID:** 0006
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §14](../SYSTEM_DESIGN.md#14-pricing-system)

## Context

Honest renter-facing totals require structure: rent, deposits,
maintenance, food, utilities, timing, variability, refundability, and
advertised inclusion cannot be represented faithfully by one rent
number. Partial pricing edits could leave a listing in an inconsistent
advertised state.

## Decision

Store pricing as structured `listing_price_components` rows and update
them through atomic whole-set replacement. Validate the entire set,
including C1–C10 and rent-basis consistency, before deleting or
inserting rows.

## Consequences

Partial-config pricing states are avoided. Duplicate component identity
is rejected with 409, while invalid combinations are rejected with 422
after rollback.
