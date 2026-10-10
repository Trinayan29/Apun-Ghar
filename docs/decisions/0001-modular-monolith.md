# ADR 0001 — Modular monolith over microservices

- **ID:** 0001
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §2](../SYSTEM_DESIGN.md#2-architectural-style)

## Context

Apun-Ghar is developed by a small team and currently consists of one
deployable backend, one database, one production frontend, and one
disconnected UX prototype. Domain modules have no cross-module service
layer.

## Decision

Keep a modular monolith. Domain modules own their routers, schemas,
validation helpers, and business rules, but there is no `services/` or
`schemas/` package and no separately deployable service boundary.

## Consequences

Operations stay simple: one backend deployable and one database.
Services are to be split later only on scaling evidence, not
preemptively.
