# ADR 0005 — Ownership derived through Property

- **ID:** 0005
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §7](../SYSTEM_DESIGN.md#7-authorization--rbac)

## Context

Owner resources form a hierarchy: properties own rental units; rental
units own listings; listings own price components and photos.
Denormalizing `owner_id` throughout the hierarchy would create another
value that could disagree with the authoritative anchor.

## Decision

Use `properties.owner_user_id` as the single ownership anchor. Resolve
ownership downstream through joins and never trust an owner identifier
from a request payload.

## Consequences

There is one join-chain ownership rule. Missing and foreign resources
return uniform 404 responses, so the API does not leak the existence of
another owner's resources.
