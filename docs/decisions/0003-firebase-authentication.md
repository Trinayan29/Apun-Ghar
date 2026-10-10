# ADR 0003 — Firebase Authentication

- **ID:** 0003
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §6](../SYSTEM_DESIGN.md#6-authentication-architecture)

## Context

Apun-Ghar needs Email/Password and Google identity without building or
maintaining password storage, token issuance, revocation infrastructure,
or another authentication service.

## Decision

Outsource identity to Firebase Authentication, including Google sign-in.
Store no passwords in PostgreSQL. Draw the authorization trust boundary
at `users.role`, which is maintained server-side and never taken from
token claims.

## Consequences

Firebase proves identity; FastAPI remains the application authority.
Local development uses the Firebase Auth Emulator rather than a real
project.
