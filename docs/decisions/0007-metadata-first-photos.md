# ADR 0007 — Metadata-first photos

- **ID:** 0007
- **Status:** Superseded by [ADR 0014](0014-b2-photo-storage.md)
- **Date:** Not recorded in repository source
- **Original architecture context:** [`SYSTEM_DESIGN.md` §15](../SYSTEM_DESIGN.md#15-photo-system)

## Context

At the time of the original decision, the listing workflow needed photo
records, ordering, cover selection, and publication readiness before the
final object-storage provider was integrated.

## Decision

Reserve photo metadata through server-generated `storage_key` values.
This decoupled the listing workflow from the future storage provider.

## Consequences

The original rationale is preserved here for history. It no longer
describes current architecture: Backblaze B2 is now integrated, and
[ADR 0014](0014-b2-photo-storage.md) records the replacement design.
