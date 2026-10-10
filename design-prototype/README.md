# Apun-Ghar — Mobile UI Prototype (temporary)

> **This is a disposable UI prototype, not the real application.**
> It uses fictional Guwahati mock data, has no backend, and does not
> connect to Firebase or any API. Do not treat it as production code.

## Run it

```powershell
cd design-prototype
npm install
npm run dev
```

Open **http://localhost:3100** (note: port **3100**, so it never clashes
with the real frontend on :3000).

Other commands: `npm run typecheck`, `npm run build`.

## Primary viewport

Mobile-first, fully responsive: **360–430px** phones (single column,
bottom navigation), **768–1024px** tablets (2-column grids), **1024px+**
desktops (top header navigation, 3-column grids, two-column property
details). Content caps at `max-w-7xl` on very wide screens.

## What's inside

Renter screens: welcome (`/`), login, signup, 4-step onboarding, home,
search, filters, property details (`/property/[id]`), schedule visit
(`/visit/[id]` + success state), profile, saved, visits — with working
bottom navigation, save hearts, filter state, onboarding state, and visit
booking, all held in a React context (`store/AppStore.tsx`).

Owner screens: `/list-your-property`, `/owner/signup`, `/owner/login`,
`/owner/dashboard`, `/owner/account`, and `/owner/listings/new`. The
owner flow uses the separate 11-chapter prototype sequence
(`design-prototype/components/listing/types.ts`), persists drafts in
localStorage, and simulates uploads. None of these routes is connected
to the production backend.

Mock data lives in `data/properties.ts` (8 fictional Guwahati listings).
Property photos load from Unsplash with a graceful local fallback if
offline. Owner drafts are persisted in localStorage under
`agh-owner-drafts-v1` (`store/AppStore.tsx`).

## Tech

Standalone Next.js (App Router) + React + TypeScript + Tailwind CSS v4 —
same direction as the real `frontend/`, so approved patterns transfer.
Zero extra dependencies.
