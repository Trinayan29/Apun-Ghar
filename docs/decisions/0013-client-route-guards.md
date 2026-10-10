# ADR 0013 — Client-side route guards with server-side enforcement

- **ID:** 0013
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §18](../SYSTEM_DESIGN.md#18-frontend-architecture)

## Context

Owners and renters should reach the correct experience immediately
without full reloads, but browser navigation can always be bypassed or
manipulated.

## Decision

Use client-side route guards for immediate redirects and UX routing.
Treat the backend as the only authorization enforcer.

## Consequences

The frontend can optimize navigation without weakening security. Every
protected request is still verified and authorized server-side.
