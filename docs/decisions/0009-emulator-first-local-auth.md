# ADR 0009 — Emulator-first local authentication

- **ID:** 0009
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §24](../SYSTEM_DESIGN.md#24-local-development-architecture)

## Context

Local authentication work should not require a real Firebase project,
production credentials, billing risk, or manual cloud setup after
cloning.

## Decision

Use the Firebase Auth Emulator for local development. Configure the
emulator and UI through the repository's `firebase.json`, with project
ID `demo-apun-ghar`.

## Consequences

New developers can sign up, sign in, and inspect test users locally.
The emulator is development-only; production will use a separately
configured real Firebase project.
