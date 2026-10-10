# ADR 0010 — Prototype kept disconnected

- **ID:** 0010
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §2](../SYSTEM_DESIGN.md#2-architectural-style)

## Context

UX iteration needs speed and freedom to explore renter and owner flows.
Connecting exploratory mock screens to production contracts would slow
iteration and risk confusing prototype persistence with real data.

## Decision

Keep `design-prototype/` as a separate Next.js app with no backend,
Firebase, or production API calls. Persist prototype state locally, not
in PostgreSQL.

## Consequences

Prototype UX can iterate at full speed with zero risk to production
contracts. Prototype behavior is not evidence that the production
frontend or backend implements the same flow.
