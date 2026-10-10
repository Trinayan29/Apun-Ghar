# ADR 0002 — PostgreSQL as the system of record

- **ID:** 0002
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §8](../SYSTEM_DESIGN.md#8-database-system-design)

## Context

Marketplace invariants—ownership, valid statuses, occupancy coherence,
price-component consistency, photo metadata, and one active listing per
unit—cannot safely depend on every client or code path behaving
correctly.

## Decision

Use PostgreSQL as the application authority for relational data.
Enforce marketplace invariants with CHECK constraints, foreign keys,
partial unique indexes, and append-only Alembic migrations.

## Consequences

The application cannot be trusted to uphold these invariants alone.
Database defenses remain even when service-layer validation changes.
Migrations must remain append-only and reviewable.
