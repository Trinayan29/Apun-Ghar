# ADR 0014 — Backblaze B2 S3-compatible photo storage

- **ID:** 0014
- **Status:** Accepted
- **Date:** Implemented by Phase 2G; exact adoption date not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §15](../SYSTEM_DESIGN.md#15-photo-system)
- **Supersedes:** [ADR 0007](0007-metadata-first-photos.md)

## Context

ADR 0007 originally reserved photo metadata before object storage was
integrated. Phase 2G implemented Backblaze B2-backed upload, viewing,
and deletion, including migration `0018` for `listing_photos.size_bytes`.

## Decision

Store photo bytes in a private Backblaze B2 bucket through its
S3-compatible API. Keep photo metadata in PostgreSQL. Upload bytes
through short-lived presigned PUT URLs, attach transient presigned view
URLs to `READY` photos, generate storage keys server-side, reverify
size and MIME type at confirmation, and fail closed on storage-mutation
errors without changing database rows.

## Consequences

The browser receives short-lived URLs, never B2 credentials. Listing,
pricing, publication, and draft-deletion workflows operate against
durable storage metadata while remaining decoupled from direct bucket
access.
