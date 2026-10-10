# ADR 0012 — Lazy user provisioning with an eager profile row

- **ID:** 0012
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §6](../SYSTEM_DESIGN.md#6-authentication-architecture)

## Context

Creating application user rows before authentication would create
phantom accounts. Conversely, profile reads should not fail merely
because a newly provisioned user has not edited a profile yet.

## Decision

Materialize users on their first authenticated request and create an
empty `user_profiles` row in the same transaction. Re-query safely after
a unique-constraint race rather than creating duplicates.

## Consequences

No phantom rows exist. `GET /users/me/profile` does not 404 merely
because the profile row is missing for a valid provisioned renter.
