# ADR 0008 — No Redis, Elasticsearch, or background workers

- **ID:** 0008
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §26](../SYSTEM_DESIGN.md#26-current-vs-future-architecture)

## Context

Search engines, caches, workers, event buses, microservices, and
orchestration would add operational cost. No current feature requires
them, and read/write patterns fit one PostgreSQL database at the
project's stage.

## Decision

Defer Redis, Elasticsearch/OpenSearch, background workers, WebSockets,
event buses, microservices, and Kubernetes explicitly. Infrastructure is
to be added only for a measured feature or load driver.

## Consequences

The stack remains deliberately boring. Future scaling work must present
evidence before introducing these systems.
