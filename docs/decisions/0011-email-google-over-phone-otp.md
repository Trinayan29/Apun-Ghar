# ADR 0011 — Email/Password and Google over phone OTP for MVP

- **ID:** 0011
- **Status:** Accepted
- **Date:** Not recorded in repository source
- **Current architecture:** [`SYSTEM_DESIGN.md` §6](../SYSTEM_DESIGN.md#6-authentication-architecture)

## Context

Phone authentication needs SMS delivery with billing and quota
considerations. Email/Password and Google authentication avoid those
MVP costs while Firebase still manages all credentials.

## Decision

Use Firebase Email/Password and Google Sign-In for MVP authentication.
Collect and store owner phone numbers as contact data only; do not use
them as SMS-auth factors. Preserve the ability to add phone
verification or OTP later as an additional sign-in or trust-verification
method.

## Consequences

The MVP avoids SMS infrastructure without architecturally precluding a
later phone-verification method.
