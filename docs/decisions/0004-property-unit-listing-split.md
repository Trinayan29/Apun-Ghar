# ADR 0004 — Property / RentalUnit / Listing split

- **ID:** 0004
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §9](../SYSTEM_DESIGN.md#9-core-domain-model)

## Context

A building, a rentable space inside that building, and a commercial
offer for that space evolve on different schedules. An offer can be
paused or republished without changing the space; total cost is a
structured set of charges; media has its own upload lifecycle.

## Decision

Model `Property`, `RentalUnit`, and `Listing` as separate tables rather
than collapsing building facts into offer state. Keep price components
and photo metadata in their own dependent tables.

## Consequences

Building facts, rentable spaces, offers, pricing structure, and media
can change independently. Deleting or pausing an offer does not require
touching the underlying property.
