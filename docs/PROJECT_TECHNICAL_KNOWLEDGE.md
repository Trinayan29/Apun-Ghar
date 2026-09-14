# Apun-Ghar — Project Technical Knowledge & System Explanation

> **Audience**: Joining developers, technical mentors, evaluators, hackathon judges, and architecture reviewers.  
> **Status**: Authoritative documentation of the actual codebase as implemented.  
> **Repository State Verified**: Phase 0 (Foundation) & Phase 1 (Auth, User Profiles, Canonical Locations, Frontend Auth/Onboarding) Complete. 80/80 backend tests passing; frontend TypeScript typecheck and static build passing.

---

## Document Navigation

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Authentication Architecture](#4-authentication-architecture)
5. [Authorization and Roles](#5-authorization-and-roles)
6. [Database Architecture](#6-database-architecture)
7. [User Profile Model](#7-user-profile-model)
8. [Location System](#8-location-system)
9. [API Design](#9-api-design)
10. [FastAPI Backend Structure](#10-fastapi-backend-structure)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Onboarding Flow](#12-onboarding-flow)
13. [Owner Experience (Current vs. Future)](#13-owner-experience)
14. [Current Data Model vs. Future Listing Model](#14-current-product-data-model-vs-future-listing-model)
15. [Roommate Feature Architecture](#15-roommate-feature-architecture)
16. [Security Architecture](#16-security-architecture)
17. [Database Migrations Timeline](#17-database-migrations)
18. [Testing & Verification](#18-testing)
19. [Local Development Setup](#19-local-development)
20. [Git & Team Workflow](#20-git--team-workflow)
21. [Important Architectural Decisions (The "Why")](#21-development-decisions-and-why)
22. [Checklist: Currently Implemented Features](#22-current-implemented-features)
23. [Checklist: Not Implemented / Deferred Features](#23-not-implemented--deferred)
24. [Known Limitations & Technical Debt](#24-known-limitations--technical-debt)
25. [How to Explain This Project in an Interview](#25-how-to-explain-this-project-in-an-interview)
26. [Important Terms & Glossary](#26-important-terms--glossary)
27. [Final Architecture Map](#27-final-architecture-map)

---

## 1. Project Overview

### Simple Explanation
**Apun-Ghar** ("Our Home" in Assamese/Hindi) is a rental marketplace built specifically for students and young working professionals in rapidly growing urban education and employment hubs, starting with Guwahati, Assam. 

Finding a place to live when moving for college or a first job is notoriously painful:
- Listing platforms (like 99acres, MagicBricks, or Olx) are cluttered with high-commission brokers, outdated listings, misleading photos, and fake prices.
- Platforms like NoBroker focus primarily on families and high-rent tier-1 metropolitan apartments, ignoring student PGs, hostels, shared flats, and budget single rooms.
- Students and entry-level employees end up relying on random WhatsApp groups, Telegram channels, and physical flyers pasted on utility poles.

Apun-Ghar solves this by anchoring rental discovery around **canonical colleges and workplaces**, enforcing transparent rent pricing, and offering a seamless onboarding journey that captures renter preferences (budget, institution, move-in target) before matching them to verified properties and future roommates.

### Technical Explanation
From a software engineering perspective, Apun-Ghar is a **modular monolith** web application designed with a decoupled frontend/backend architecture:
1. **Frontend**: Next.js (App Router, React 19, TypeScript, Tailwind CSS v4) delivering a mobile-first, responsive single-page experience.
2. **Backend**: A high-performance Python ASGI service built with FastAPI, SQLAlchemy 2.0 (declarative ORM), and Pydantic v2 for strict runtime schema validation.
3. **Identity Layer**: Delegated identity management powered by Firebase Authentication (supporting Email/Password and Google OAuth2), paired with a local Firebase Auth Emulator for zero-cost, hermetic offline development.
4. **Relational Database**: PostgreSQL 17 (containerized via Docker Compose), with version-controlled, reversible schema migrations managed by Alembic.
5. **Domain Integrity**: All profile location anchors are backed by a canonical `locations` entity model with relational foreign keys (`RESTRICT` on delete) rather than arbitrary free-text strings, ensuring query integrity for geospatial proximity and future matching algorithms.

### Target Users
1. **Students**: Individuals attending universities, colleges, and medical/engineering institutions (e.g., Gauhati University, Cotton University, Assam Engineering College, IIT Guwahati, Assam Down Town University). They require affordable rooms, hostels, or PGs within walking or transit distance of campus.
2. **Young Professionals**: Entry-level workers, interns, and public servants (e.g., working near Assam Secretariat, GNRC Hospital, IT hubs). They require independent rooms or shared 1BHK/2BHK flats with clear lease terms.
3. **Property Owners / Caretakers (Future)**: PG owners, hostel managers, and independent landlords who want reliable, vetted young tenants without paying extortionate broker fees.

### What Makes It Different from Generic Property Portals?
| Dimension | Generic Portals (MagicBricks, 99acres, Housing) | Apun-Ghar |
| :--- | :--- | :--- |
| **Primary Audience** | Home buyers, commercial leases, affluent families | Students & young working professionals |
| **Search Anchor** | Postal PIN code, generic neighborhood radius | **Canonical Educational Institution or Workplace** |
| **Listing Types** | Full apartments, villas, plots, commercial | PGs, hostels, single rooms, shared flats |
| **Pricing Transparency** | Often lists base price excluding hidden maintenance/brokerage | All-inclusive, honest monthly rent |
| **Data Integrity** | Free-text messy location tags resulting in duplicates | Curated, canonical database locations with relational constraints |
| **Roommate Matching** | Non-existent or third-party forum | Native first-class domain concept (designed into the roadmap) |

### Current MVP Scope & Development Stage
- **Current Stage**: **Phase 1 Complete**. The foundational authentication system, user provisioning pipeline, profile management APIs, canonical location database/search API, and frontend onboarding user experience are fully implemented and tested.
- **What is Live in the Codebase**:
  - Full authentication loop (Email/Password + Google OAuth via Firebase).
  - Backend token verification and on-demand user provisioning into PostgreSQL.
  - Role-based authorization (`USER`, `OWNER`, `ADMIN`).
  - Canonical location search across colleges, workplaces, and neighborhoods.
  - Multi-step onboarding experience capturing student/worker preferences.
  - Direct profile management interface.
  - Owner entry landing page (`/list-your-property`) with a transparent "coming soon" announcement.
- **What is Deferred to Subsequent Phases**:
  - Property listing models and owner listing creation.
  - Public marketplace search, filters, and listing detail pages.
  - Saved listings / bookmarks.
  - In-app messaging and visit scheduling.
  - Roommate matching posts.

---

## 2. Technology Stack

The following table reflects the **exact** technologies present in the codebase. Every item has been verified against `package.json`, `requirements.txt`, and configuration files.

| Layer | Technology | Version | Location / Manifest | Purpose | Why We Chose It & Alternatives Considered |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Frontend** | **Next.js** | `^16.3.5` (Turbopack) | `frontend/package.json` | Core frontend framework (App Router) | **Why**: React server rendering, optimized static exports, unified routing, fast dev cycles with Turbopack. <br>**Alternatives**: Vite + React SPA (lacks native server routing & pre-rendering), Remix. |
| **Frontend** | **React** | `^19.3.0` | `frontend/package.json` | Declarative UI rendering | **Why**: Industry standard component lifecycle, broad ecosystem, tight Next.js App Router synergy. |
| **Frontend** | **TypeScript** | `^5` | `frontend/package.json`, `tsconfig.json` | Static type safety | **Why**: Catches type errors across API boundaries, guarantees schema alignment with backend DTOs. |
| **Frontend** | **Tailwind CSS** | `^4.3.3` (`@tailwindcss/postcss`) | `frontend/package.json`, `frontend/app/globals.css` | Utility-first styling engine | **Why**: Zero runtime CSS overhead, unified design tokens (`--color-brand-*`, `--color-paper`), rapid responsive layout design. |
| **Frontend** | *shadcn/ui* | **NOT USED** | Verified absent | *N/A* | Handcrafted lightweight, accessible Tailwind components (`auth-ui.tsx`, `location-search.tsx`) avoid unnecessary component dependency bloat. |
| **Frontend** | *React Hook Form* | **NOT USED** | Verified absent | *N/A* | Standard React controlled inputs (`useState`) were sufficient for 2–4 field onboarding forms; avoids adding 30KB+ library overhead. |
| **Frontend** | *Zod* | **NOT USED** | Verified absent | *N/A* | Client validation is implemented via clean native helper functions (`lib/auth-errors.ts`); backend strictly validates via Pydantic. |
| **Frontend** | *TanStack Query* | **NOT USED** | Verified absent | *N/A* | Simple Promise-based API client (`lib/api.ts`) with custom request ID de-bouncing and React `useEffect` hooks avoids extra state complexity. |
| **Backend** | **Python** | `3.11+` | `backend/requirements.txt` | Core backend programming language | **Why**: High developer velocity, rich data processing ecosystem, readable asynchronous syntax. |
| **Backend** | **FastAPI** | `>=0.115` | `backend/requirements.txt` | REST API framework | **Why**: Native ASGI performance, automatic OpenAPI documentation, declarative dependency injection (`Depends`), async support. <br>**Alternatives**: Django (too heavy/monolithic for modern decoupled SPAs), Flask (lacks modern async & typing). |
| **Backend** | **Pydantic** | `>=2.0` | `backend/requirements.txt` | Request/response data validation | **Why**: Blazing fast C-level validation, strict data type parsing, seamless serialization (`model_dump`, `from_attributes`). |
| **Backend** | **SQLAlchemy** | `>=2.0` | `backend/requirements.txt` | Object Relational Mapper (ORM) | **Why**: Modern 2.0 type-annotated syntax (`Mapped`, `mapped_column`), robust transaction management, flexible connection pooling. <br>**Alternatives**: Tortoise-ORM, raw SQL, Peewee. |
| **Backend** | **Alembic** | `>=1.13` | `backend/requirements.txt`, `backend/alembic.ini` | Database schema migration engine | **Why**: Industry-standard schema versioning for SQLAlchemy; supports reversible, deterministic migration scripts. |
| **Backend** | **psycopg** | `>=3.1` (`psycopg[binary]`) | `backend/requirements.txt` | Modern PostgreSQL DBAPI driver | **Why**: Full PostgreSQL 17 compatibility, native connection pooling, binary protocol speed. |
| **Backend** | **Uvicorn** | `>=0.30` (`uvicorn[standard]`) | `backend/requirements.txt` | Lightning-fast ASGI production server | **Why**: Standard ASGI runner powering FastAPI with uvloop and httptools. |
| **Backend** | **pytest** | `>=8.0` | `backend/requirements.txt` | Automated test suite runner | **Why**: Concise assertion syntax, modular fixtures (`tests/`), fast local test execution. |
| **Backend** | **httpx** | `>=0.27` | `backend/requirements.txt` | HTTP test client | **Why**: Recommended TestClient engine for FastAPI async endpoints. |
| **Database** | **PostgreSQL** | `17-alpine` | `docker-compose.yml` | Primary ACID relational database | **Why**: Uncompromising transactional integrity, CHECK constraints, powerful indexing, seamless future upgrade path to PostGIS/full-text search. |
| **Database Ext.** | *Extensions* | **NONE CURRENTLY** | Verified via Alembic | *N/A* | Standard B-Tree indexes (`ix_locations_type_name`) and PostgreSQL `ILIKE` are currently sufficient; `pg_trgm` and `PostGIS` deferred to future phases. |
| **Auth** | **Firebase Admin SDK** | `>=6.5` | `backend/requirements.txt` | Server-side token verification | **Why**: Google-managed security; validates cryptographic JWT signatures issued to users without exposing server secrets. |
| **Auth** | **Firebase Web SDK** | `^12.19.0` | `frontend/package.json` | Client-side identity provider | **Why**: Handles secure credential exchange, session storage in indexedDB/memory, and automatic token refresh. |
| **Auth** | **Firebase Auth Emulator** | CLI `v15.30.0` | `firebase.json` | Local hermetic auth service | **Why**: Allows developers to create mock users, log in, and test JWT verification offline with 0 cloud dependencies and $0 billing. |
| **DevOps** | **Docker & Docker Compose** | Compose v2 | `docker-compose.yml` | Containerized database | **Why**: Guarantees identical database engine across developer workstations; isolates local dependencies. |
| **DevOps** | **Git / GitHub** | *N/A* | `.git`, `.gitignore` | Version control & trunk-based collaboration | **Why**: Standard branch-and-PR workflow for team collaboration. |

---

## 3. High-Level Architecture

Apun-Ghar is structured as a **clean, decoupled modular monolith**. The user interface runs as an independent client application in the user's browser, communicating with the FastAPI backend over RESTful JSON APIs. Identity is strictly decoupled from domain state.

### High-Level Request & Authentication Flow

```text
+-----------------------------------------------------------------------------------+
|                                    USER BROWSER                                   |
|                                                                                   |
|  +---------------------------+             +----------------------------------+   |
|  |     Next.js Frontend      |             |   Firebase Client Web SDK        |   |
|  |   (React 19 App Router)   |             | (Connects to Auth / Emulator)    |   |
|  +-------------+-------------+             +-----------------+----------------+   |
|                |                                             |                    |
|                | 1. User inputs credentials (Email/PW or OAuth)                    |
|                +-------------------------------------------->|                    |
|                                                              |                    |
|                | 2. Issues signed Firebase ID Token (JWT)    |                    |
|                |<--------------------------------------------+                    |
|                |                                                                  |
|                | 3. API Request with Header: "Authorization: Bearer <ID_TOKEN>"   |
+----------------+------------------------------------------------------------------+
                 |
                 v HTTP POST / GET / PATCH (Port 8000)
+-----------------------------------------------------------------------------------+
|                               FASTAPI APPLICATION                                 |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   | app.middleware: CORSMiddleware (Validates origin http://localhost:3000)    |   |
|   +-------------------------------------+-------------------------------------+   |
|                                         |                                         |
|   +-------------------------------------v-------------------------------------+   |
|   | app.auth: get_firebase_claims() -> verify_id_token()                       |   |
|   | (Validates signature against Firebase Auth Emulator or Google Public Keys)|   |
|   +-------------------------------------+-------------------------------------+   |
|                                         | Verified Claims: {uid, email, ...}      |
|   +-------------------------------------v-------------------------------------+   |
|   | app.users: get_or_create_current_user()                                   |   |
|   | (Looks up user by firebase_uid in PostgreSQL; provisions user on-demand)  |   |
|   +-------------------------------------+-------------------------------------+   |
|                                         | Domain User Instance (with DB role)     |
|   +-------------------------------------v-------------------------------------+   |
|   | app.auth: require_role('USER' | 'OWNER' | 'ADMIN')                        |   |
|   | (Verifies permissions using internal database state, NOT client claims)   |   |
|   +-------------------------------------+-------------------------------------+   |
|                                         | Authorized Execution                    |
|   +-------------------------------------v-------------------------------------+   |
|   | Endpoint Handler (e.g. read_own_profile, patch_own_profile)               |   |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | SQLAlchemy 2.0 ORM queries
                                          v Port 5433 (Host) -> 5432 (Docker)
+-----------------------------------------------------------------------------------+
|                              POSTGRESQL 17 DATABASE                               |
|                                                                                   |
|   +----------------------+    1:1 Cascade     +-------------------------------+   |
|   |     users table      |------------------->|     user_profiles table       |   |
|   | (id, firebase_uid,   |                    | (user_id, budget, move_in,    |   |
|   |  email, role, ...)   |                    |  college_id, workplace_id)    |   |
|   +----------------------+                    +---------------+---------------+   |
|                                                               |                   |
|                                                N:1 Restrict   |                   |
|                                               +---------------v---------------+   |
|                                               |       locations table         |   |
|                                               | (id, type, name, city)        |   |
|                                               +-------------------------------+   |
+-----------------------------------------------------------------------------------+
```

### Key Architectural Concepts

1. **Frontend / Backend Decoupling**:
   - The frontend is responsible strictly for UI presentation, route navigation, and client-side form ergonomics.
   - The backend is the single source of truth for business logic, permissions, and database manipulation.
2. **Identity Provider vs. Application Authorization**:
   - **Firebase** handles *Authentication* (proving *who* the user is: verifying passwords, managing sessions, issuing cryptographic JWTs).
   - **FastAPI + PostgreSQL** handles *Authorization* (determining *what* the user is allowed to do).
3. **Why the Frontend Cannot Be Trusted for Roles**:
   - Any client-side state or localStorage value can be trivially inspected or altered using browser developer tools.
   - If an endpoint relied on a client header like `X-User-Role: OWNER`, any student could grant themselves owner privileges.
   - Therefore, the backend extracts the verified `uid` from the Firebase token, retrieves the corresponding row from PostgreSQL, and inspects `user.role` stored securely in the database.
4. **Why a Modular Monolith?**:
   - At this stage of development (MVP / early product), splitting the system into microservices (Auth Service, Profile Service, Location Service) would introduce immense operational overhead (network latency, distributed transactions, complex CI/CD, multiple deployment targets) with zero architectural benefit.
   - Code is logically organized into distinct modules (`auth.py`, `users.py`, `locations.py`, `models.py`) inside a single cohesive repository.
5. **Why Redis, Message Queues, and Microservices Were Intentionally Avoided**:
   - PostgreSQL 17 handles thousands of concurrent read/write transactions per second on modest hardware. Caching profiles or locations in Redis at this stage would add cache invalidation bugs and operational dependencies without performance justification.
   - All operations are currently synchronous transactional CRUD requests well-suited to FastAPI's asynchronous ASGI engine.

---

## 4. Authentication Architecture

### Identity Provider (Firebase Authentication)
Authentication is completely delegated to Firebase Authentication. 

#### Why Passwords Are Never Stored in PostgreSQL
Storing raw or even hashed passwords requires substantial security compliance: salts, slow hashing functions (Argon2/bcrypt), credential breach monitoring, rate-limiting against brute force, and secure password-reset email delivery. By using Firebase:
- The Apun-Ghar database contains **zero password hashes**. If the database were ever compromised, no user credentials or passwords would be exposed.
- Account security, brute-force protection, and OAuth token exchanges are handled by Google's audited infrastructure.

#### Storage of Tokens
Tokens are **not stored in `localStorage`**. Storing authentication tokens in `localStorage` exposes them to cross-site scripting (XSS) attacks. Instead, the Firebase Web SDK manages the token lifecycle in memory and securely caches sessions using IndexedDB. On each authenticated API call, `auth.currentUser.getIdToken()` retrieves the current valid token, automatically refreshing it before expiry.

### Complete Authentication Lifecycles

#### 1. User Signup Flow
```text
User fills Signup Form (Name, Email, Password)
  │
  ▼
Frontend calls Firebase Web SDK: `createUserWithEmailAndPassword(auth, email, password)`
  │
  ▼
Firebase creates account, returns Firebase User Credential (with UID)
  │
  ▼
Frontend calls `updateProfile(user, { displayName: name })`
  │
  ▼
Frontend redirects user to `/onboarding`
  │
  ▼
On the first authenticated request to FastAPI (e.g. GET /api/v1/users/me or PATCH /api/v1/users/me/profile):
FastAPI verifies the Bearer ID token, extracts `uid`, detects user does not exist in PostgreSQL,
and atomically provisions:
  1. `users` table record (firebase_uid, email, role='USER', display_name)
  2. `user_profiles` table record (empty default profile linked via user_id)
```

#### 2. User Login Flow
```text
User fills Login Form (Email & Password) or clicks "Continue with Google"
  │
  ▼
Frontend calls `signInWithEmailAndPassword(auth, email, password)` OR `signInWithPopup(auth, googleProvider)`
  │
  ▼
Firebase validates credentials and issues a cryptographic ID token (JWT)
  │
  ▼
Frontend checks onboarding status in localStorage:
  - If completed: redirect to `/`
  - If incomplete: redirect to `/onboarding`
```

#### 3. Authenticated API Request Flow
```text
Frontend calls API: `fetch("http://localhost:8000/api/v1/users/me/profile", {
  headers: { "Authorization": `Bearer ${token}` }
})`
  │
  ▼
FastAPI `HTTPBearer` extracts token from request header
  │
  ▼
FastAPI `app.auth.get_firebase_claims` executes:
  `claims = firebase_auth.verify_id_token(token)`
  - If token missing, invalid, or expired -> raises HTTP 401 Unauthorized
  │
  ▼
FastAPI `app.auth.get_or_create_current_user` executes:
  - Extracts `claims["uid"]`
  - Runs database query: `SELECT * FROM users WHERE firebase_uid = :uid`
  - Synchronizes changes (e.g. if user verified email in Firebase, updates `email_verified`)
  - Injects the authenticated `User` database model into the endpoint
```

### Local Development vs. Production Firebase

```text
+-----------------------------------------------------------------------------------+
|                               LOCAL DEVELOPMENT (Now)                             |
|                                                                                   |
|  Next.js (:3000) ──> Firebase Auth Emulator (:9099) ──> FastAPI (:8000)          |
|                           UI on (:4000)                   │                       |
|                                                           ▼                       |
|                                                 PostgreSQL Container (:5433)      |
+-----------------------------------------------------------------------------------+

+-----------------------------------------------------------------------------------+
|                            FUTURE PRODUCTION (Planned)                            |
|                                                                                   |
|  Next.js (Vercel) ──> Real Google Firebase Auth ──> FastAPI (Cloud Service)       |
|                                                           │                       |
|                                                           ▼                       |
|                                                 Managed Cloud PostgreSQL          |
+-----------------------------------------------------------------------------------+
```

- **In Local Development**:
  - `firebase.json` runs a local Auth Emulator listening on `127.0.0.1:9099` (with an inspection dashboard on `http://127.0.0.1:4000`).
  - The frontend checks `process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR` and connects to `http://127.0.0.1:9099`.
  - The backend checks `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`. The Firebase Admin SDK automatically bypasses cryptographic signature verification against Google servers and accepts locally signed emulator JWTs.
  - Project ID is set to `demo-apun-ghar`. The `demo-` prefix instructs Google client libraries that this is a zero-billing, offline emulator instance.
- **In Production**:
  - `FIREBASE_AUTH_EMULATOR_HOST` is omitted.
  - `GOOGLE_APPLICATION_CREDENTIALS` points to a secure, non-committed Service Account JSON file.
  - The Admin SDK fetches and caches Google's public x509 certificates to verify production JWTs.

---

## 5. Authorization and Roles

### The Role Model
Apun-Ghar implements explicit **Server-Enforced Role-Based Access Control (RBAC)**. The database schema strictly restricts user roles to three permissible values via a database-level `CHECK` constraint:

```sql
CONSTRAINT ck_users_role CHECK (role IN ('USER', 'OWNER', 'ADMIN'))
```

### Critical Conceptual Distinction: What is a `USER`?
In earlier exploratory iterations of the project, this role was named `STUDENT`. However, an architectural review proved this design flawed:
- **`USER` does NOT mean "student only"**.
- A `USER` is **any tenant or consumer** on the platform. This encompasses undergraduate students, postgraduate scholars, interns, young corporate professionals, government employees, and prospective roommates looking for accommodations.
- **`OWNER`** represents a verified property manager, landlord, PG operator, or hostel warden who has been approved to publish and manage listings.
- **`ADMIN`** represents an Apun-Ghar internal platform administrator with full governance, verification, and moderation privileges.

### Role Lifecycle and Governance
1. **Default Role**: Every newly provisioned account receives the `USER` role automatically.
2. **Self-Promotion is Impossible**:
   - There is **no public API endpoint** allowing a user to change their own role.
   - The profile update schema (`ProfileUpdate`) uses Pydantic's `extra="forbid"` configuration. Attempting to pass `role: "OWNER"` in a profile payload immediately fails with an HTTP 422 Unprocessable Entity error.
   - Even if the frontend UI were manipulated, the database role remains untouched.
3. **Owner Approval Workflow (Future Architecture)**:
   - In future phases, an existing `USER` will submit an owner onboarding application (proof of property ownership or management authority).
   - An `ADMIN` reviews the submission.
   - Only the administrative pipeline or direct database administration can promote an account from `USER` to `OWNER`.
4. **Backend Enforcement**:
   - Protected routes declare role requirements using FastAPI's dependency injection:
     ```python
     def require_role(*allowed: str):
         allowed_roles = set(allowed)
         def check(user: User = Depends(get_current_user)) -> User:
             if user.role not in allowed_roles:
                 raise HTTPException(status_code=403, detail="Insufficient permissions")
             return user
         return check
     ```

---

## 6. Database Architecture

The relational schema is maintained in PostgreSQL 17 and managed via Alembic migrations.

### Entity Relationship (ER) Diagram

```text
+--------------------------------------------------------+
|                         users                          |
+--------------------------------------------------------+
| PK  id               SERIAL / INTEGER                  |
| UQ  firebase_uid     VARCHAR(128) NOT NULL             |
| UQ  email            VARCHAR(320) NULL                 |
|     email_verified   BOOLEAN NOT NULL DEFAULT FALSE    |
|     role             VARCHAR(20) NOT NULL DEFAULT USER |
|     display_name     VARCHAR(200) NULL                 |
|     created_at       TIMESTAMPTZ NOT NULL (server_now) |
|     updated_at       TIMESTAMPTZ NOT NULL (server_now) |
| CK: role IN ('USER', 'OWNER', 'ADMIN')                 |
+---------------------------+----------------------------+
                            | 1
                            |
                            | ON DELETE CASCADE
                            v 1
+--------------------------------------------------------+
|                     user_profiles                      |
+--------------------------------------------------------+
| PK,FK user_id                 INTEGER                  |
| FK    college_location_id     INTEGER NULL             |
| FK    workplace_location_id   INTEGER NULL             |
|       budget_min              INTEGER NULL             |
|       budget_max              INTEGER NULL             |
|       move_in_date            DATE NULL                |
|       created_at              TIMESTAMPTZ NOT NULL     |
|       updated_at              TIMESTAMPTZ NOT NULL     |
| CK: budget_min IS NULL OR budget_min >= 0              |
| CK: budget_max IS NULL OR budget_max >= 0              |
| CK: budget_max >= budget_min (if both present)         |
+--------------------+-------------------+---------------+
                     |                   |
        N (RESTRICT) |                   | N (RESTRICT)
                     v                   v
+--------------------------------------------------------+
|                       locations                        |
+--------------------------------------------------------+
| PK  id               SERIAL / INTEGER                  |
|     type             VARCHAR(20) NOT NULL              |
|     name             VARCHAR(200) NOT NULL             |
|     city             VARCHAR(100) NOT NULL             |
| IX: ix_locations_type_name (type, name)                |
+--------------------------------------------------------+
```

### Table Specifications

#### 1. Table: `users`
Represents an authenticated account within the Apun-Ghar application domain.
- **`id`** (`INTEGER`, PK): Internal auto-incrementing integer identifier. Fast indexing and efficient foreign key joins.
- **`firebase_uid`** (`VARCHAR(128)`, Unique, Indexed, NOT NULL): The external identity subject identifier provided by Firebase Auth. Guarantees 1:1 mapping between Firebase Identity and application user.
- **`email`** (`VARCHAR(320)`, Unique, Nullable): Standard RFC 5321 compliant email length. Can be null if a future OAuth provider omits email, but enforced unique when present.
- **`email_verified`** (`BOOLEAN`, NOT NULL, Server Default `false`): Tracks whether the email has been confirmed.
- **`role`** (`VARCHAR(20)`, NOT NULL, Server Default `'USER'`): Platform authorization level. Constrained by `ck_users_role` to `'USER'`, `'OWNER'`, or `'ADMIN'`.
- **`display_name`** (`VARCHAR(200)`, Nullable): User's preferred full name.
- **`created_at`** / **`updated_at`** (`TIMESTAMPTZ`, NOT NULL): Audit timestamps automatically set and updated by PostgreSQL `now()`.

#### 2. Table: `user_profiles`
Stores domain-specific preferences and search anchors for the renter.
- **`user_id`** (`INTEGER`, PK, FK `users.id` `ON DELETE CASCADE`): Acts simultaneously as the Primary Key and Foreign Key. Guarantees strict 1:1 cardinality with `users`. If a user is deleted, their profile is automatically purged.
- **`college_location_id`** (`INTEGER`, FK `locations.id` `ON DELETE RESTRICT`, Nullable): Relational link to a canonical institution where the user studies.
- **`workplace_location_id`** (`INTEGER`, FK `locations.id` `ON DELETE RESTRICT`, Nullable): Relational link to a canonical institution where the user works.
- **`budget_min`** (`INTEGER`, Nullable): Minimum monthly rent preference in Indian Rupees (INR). Constrained by `ck_profiles_min` (`>= 0`).
- **`budget_max`** (`INTEGER`, Nullable): Maximum monthly rent preference in Indian Rupees (INR). Constrained by `ck_profiles_max` (`>= 0`).
- **`move_in_date`** (`DATE`, Nullable): Target calendar date for moving into accommodations.
- **Constraints**:
  - `ck_profiles_min`: `budget_min IS NULL OR budget_min >= 0`
  - `ck_profiles_max`: `budget_max IS NULL OR budget_max >= 0`
  - `ck_profiles_range`: `budget_max IS NULL OR budget_min IS NULL OR budget_max >= budget_min`

#### 3. Table: `locations`
The authoritative registry of physical landmarks, universities, corporate centers, and neighborhoods.
- **`id`** (`INTEGER`, PK): Unique location identifier.
- **`type`** (`VARCHAR(20)`, NOT NULL): Category discriminator (`'college'`, `'workplace'`, or `'area'`).
- **`name`** (`VARCHAR(200)`, NOT NULL): Official canonical title (e.g., `"Cotton University"`, `"GNRC Hospital"`).
- **`city`** (`VARCHAR(100)`, NOT NULL): Urban municipal area (e.g., `"Guwahati"`).
- **Index**:
  - Composite B-Tree index: `ix_locations_type_name` on `(type, name)`. Accelerates queries filtering by location category and prefix-matching institution names.

### Key Database Design Decisions

1. **Internal Integer Primary Key vs. Firebase UID Foreign Keys**:
   - Joining relational tables using a compact 4-byte `INTEGER` is significantly faster and consumes far less memory than 128-byte string comparisons on every foreign key join.
   - It also completely shields our internal relational schema from external identity provider changes (e.g., if we ever migrated from Firebase to Supabase or Auth0).
2. **Canonical Location Foreign Keys vs. Free-Text**:
   - If users entered free-text strings for their college (e.g., `"AEC"`, `"Assam Engg College"`, `"Assam Engineering College, Jalukbari"`), building proximity search or grouping roommates by institution would be nearly impossible.
   - By enforcing foreign keys to the `locations` table, all users referencing the same university point to the exact same canonical row ID.
3. **`ON DELETE RESTRICT` on Location Foreign Keys**:
   - If an administrator attempted to delete `"Cotton University"` from the `locations` table while 500 active students had that `college_location_id` on their profile, PostgreSQL refuses the deletion with an integrity error. This prevents orphaned profile relationships.

---

## 7. User Profile Model

### Profile Fields & Design Rationales
All profile fields in Apun-Ghar are **intentionally optional**:
- A college student does not have a workplace location.
- A young corporate professional does not have a college campus.
- A user exploring rental options may not have finalized their exact move-in date or budget range.
- Enforcing mandatory fields during initial registration causes drop-off. Making fields optional allows users to incrementally complete their profiles.

### HTTP PATCH Semantics
Profile updates are performed via `PATCH /api/v1/users/me/profile`. The endpoint implements strict standard partial update semantics:

1. **Omitted Field**: The field is excluded from the JSON payload.
   - *Behavior*: The existing value in the database remains **unchanged**.
2. **Explicit `null`**: The field is explicitly passed with a `null` value (e.g. `{"college_location_id": null}`).
   - *Behavior*: The field in the database is **cleared** to `NULL`.
3. **Supplied Value**: A valid value is passed (e.g. `{"budget_max": 12000}`).
   - *Behavior*: The field in the database is **updated**.

### Validation Logic (Application & Database Level)
Profile validation occurs at three distinct layers:
1. **Pydantic Type & Schema Validation**:
   - `budget_min` and `budget_max` must be integers `>= 0`.
   - Unknown/extraneous payload keys are rejected with HTTP 422 (`extra="forbid"`).
2. **FastAPI Business Logic Validation**:
   - If `college_location_id` is supplied, the backend queries the database to confirm that the location exists AND that its `type == 'college'`. (Supplying a workplace ID or an area ID as a college returns HTTP 422).
   - If `workplace_location_id` is supplied, the backend confirms that the location exists AND that its `type == 'workplace'`.
   - Cross-field validation: If the effective minimum budget (either newly supplied or existing in the database) exceeds the effective maximum budget, the request is rejected with HTTP 422: `"budget_min cannot exceed budget_max"`.
3. **PostgreSQL Check Constraints**:
   - Even if application code were bypassed, the PostgreSQL engine itself enforces `ck_profiles_min`, `ck_profiles_max`, and `ck_profiles_range`.

---

## 8. Location System

### Why Canonical Entities?
In generic rental portals, location inputs are unstructured text fields. This leads to duplicate institution records, misspelling ("Guwahti Univ"), and fragmented search results. In Apun-Ghar, locations are **curated system assets**.

### Supported Location Types
- **`college`**: Higher education institutions, universities, medical colleges, and engineering institutes.
- **`workplace`**: Government secretariats, high courts, major hospitals, technology parks, and commercial centers.
- **`area`**: Recognized residential neighborhoods and transit nodes (e.g., Six Mile, Beltola, Ganeshguri, Dispur).

### Search API Endpoint (`GET /api/v1/locations`)
- **Query Parameters**:
  - `type` (optional): Filter by location category (`college`, `workplace`, `area`). Rejects unsupported types with HTTP 422.
  - `search` (optional): Case-insensitive substring matching against `name` or `city`.
  - `limit` (optional): Integer between 1 and 50 (default: 20).
- **Search Query Construction**:
  ```python
  stmt = select(Location)
  if type is not None:
      stmt = stmt.where(Location.type == type)
  cleaned = search.strip() if search is not None else ""
  if cleaned:
      pattern = f"%{cleaned}%"
      stmt = stmt.where(or_(Location.name.ilike(pattern), Location.city.ilike(pattern)))
  stmt = stmt.order_by(Location.name.asc(), Location.id.asc()).limit(limit)
  ```
- **Ordering**: Results are deterministically sorted alphabetically by `name` ascending, with `id` as a tiebreaker.
- **Public Endpoint**: Location search requires **no authentication**. Unregistered visitors can search institutions and locations freely.

### Seed Catalog & Data Cleansing
The database seed script (`backend/app/seed.py`) populates canonical Guwahati institutions. It is fully **idempotent**:
- Checks for existence before insertion based on `(type, name)`.
- Contains automated rename rules to correct historical spelling inconsistencies without data loss (e.g., ensuring `"Assam Down Town University"` is standard, and ensuring ADTU is never confused with Assam Don Bosco University).

### Why `ILIKE` is Sufficient (and Why `pg_trgm` Was Deferred)
- For the Guwahati MVP launch, the canonical catalog contains tens to hundreds of primary institutions and neighborhoods.
- An indexed B-tree search using PostgreSQL `ILIKE` executes in under **1 millisecond** for catalogs of this size.
- Introducing `pg_trgm` (trigram fuzzy matching), Elasticsearch, or PostGIS at this stage would add complexity without user-perceptible benefits. `pg_trgm` can be introduced seamlessly via an Alembic migration when the catalog expands to thousands of institutions across multiple states.

---

## 9. API Design

All endpoints follow REST principles with standard JSON request and response bodies. Endpoints are versioned under the `/api/v1` route prefix.

### Endpoints Table

| Method | Endpoint | Auth Required | Purpose | Request Body | Successful Response | Potential Errors |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GET** | `/healthz` | No | Liveness probe (container orchestrators) | None | `{"status": "ok"}` (200 OK) | *None* |
| **GET** | `/readyz` | No | Readiness probe (tests PostgreSQL connectivity) | None | `{"status": "ready", "db": "up"}` (200 OK) | 500 (Database unreachable) |
| **GET** | `/api/v1/locations` | No | Search and filter canonical colleges, workplaces, areas | None (Query params: `type`, `search`, `limit`) | Array of `LocationRead` objects (200 OK) | 422 Unprocessable Content (invalid `type` or `limit`) |
| **GET** | `/api/v1/users/me` | **Yes** (Bearer) | Get authenticated user account details | None | `UserRead` (id, firebase_uid, email, email_verified, role, display_name, timestamps) (200 OK) | 401 Unauthorized |
| **GET** | `/api/v1/users/me/profile` | **Yes** (Bearer) | Get current user's profile and nested location objects | None | `ProfileRead` (nested `college_location`, `workplace_location`, budgets, move-in) (200 OK) | 401 Unauthorized |
| **PATCH** | `/api/v1/users/me/profile` | **Yes** (Bearer) | Partially update own profile preferences | `ProfileUpdate` (JSON with optional fields to change/clear) | Updated `ProfileRead` (200 OK) | 401 Unauthorized, 422 Unprocessable Content |

### HTTP Status Code Conventions
- **200 OK**: Request succeeded and data is returned.
- **401 Unauthorized**: Missing, malformed, invalid, or expired Firebase Bearer token in the `Authorization` header.
- **403 Forbidden**: Token is valid, but the user account lacks the required role permissions (e.g. non-owner accessing an owner route).
- **404 Not Found**: Resource does not exist.
- **409 Conflict**: Database uniqueness constraint collision.
- **422 Unprocessable Content**: Request syntax is valid JSON, but fails schema validation (e.g. negative budget, `budget_min > budget_max`, referencing a workplace ID in `college_location_id`, or supplying forbidden extra fields).
- **500 Internal Server Error**: Unexpected unhandled server or database error.

---

## 10. FastAPI Backend Structure

The backend application is organized cleanly under `backend/app/`:

```text
backend/
├── alembic/                      # Alembic schema migration environment
│   ├── env.py                   # Connects SQLAlchemy models to migration context
│   └── versions/                # Ordered, append-only migration scripts (0001 - 0005)
├── alembic.ini                  # Alembic configuration
├── requirements.txt             # Locked Python backend dependencies
├── app/
│   ├── __init__.py
│   ├── main.py                  # Application entry point, CORS, routers, healthz
│   ├── db.py                    # Database engine, SessionLocal factory, get_db dependency
│   ├── models.py                # SQLAlchemy declarative ORM models (User, UserProfile, Location)
│   ├── auth.py                  # Firebase token verification, get_current_user, require_role
│   ├── users.py                 # User & Profile schemas and route endpoints
│   ├── locations.py             # Location schemas, query validation, and search endpoint
│   └── seed.py                  # Idempotent database seeder for canonical institutions
└── tests/                       # Pytest test suite (80 passing tests)
```

### Module Responsibilities

- **`app/main.py`**:
  Initializes the `FastAPI` application instance. Mounts `CORSMiddleware` configured strictly for `http://localhost:3000` with `allow_credentials=True`, `allow_methods=["GET", "PATCH"]`, and `allow_headers=["Authorization", "Content-Type"]`. Registers `/healthz`, `/readyz`, and includes `users_router` and `locations_router`.
- **`app/db.py`**:
  Initializes the SQLAlchemy database engine using `create_engine` with connection health checks (`pool_pre_ping=True`). Configures `SessionLocal` (`autoflush=False, expire_on_commit=False`). Exposes the `get_db` generator function for dependency injection.
- **`app/models.py`**:
  Defines the declarative database models inheriting from `Base`: `Location`, `User`, and `UserProfile`. Enforces table arguments, column types, indexes, and database-level `CheckConstraint` rules.
- **`app/auth.py`**:
  Manages Firebase Admin SDK initialization. Implements:
  - `get_firebase_claims`: Extracts the HTTP Bearer token and verifies it via `firebase_auth.verify_id_token`.
  - `get_or_create_current_user`: Takes claims, resolves or inserts the PostgreSQL user and profile atomically, and handles unique email collision recovery.
  - `get_current_user`: FastAPI dependency chaining claims verification and user retrieval.
  - `require_role(*allowed)`: Reusable role-gating dependency factory.
- **`app/users.py`**:
  Defines Pydantic DTOs (`UserRead`, `ProfileRead`, `ProfileUpdate`). Implements `GET /api/v1/users/me`, `GET /api/v1/users/me/profile`, and `PATCH /api/v1/users/me/profile`. Executes cross-field validation and ensures users can only read and mutate their own profile.
- **`app/locations.py`**:
  Defines `LocationRead`. Implements `GET /api/v1/locations` with type validation, substring querying via SQL `ILIKE`, and deterministic ordering.
- **`app/seed.py`**:
  Maintains the initial canonical catalog of Guwahati educational institutions, major medical/governmental workplaces, and residential areas. Can be executed safely repeatedly (`python -m app.seed`).

---

## 11. Frontend Architecture

The frontend is a modern Next.js App Router application in `frontend/`:

```text
frontend/
├── app/
│   ├── globals.css              # Tailwind v4 import & custom theme tokens
│   ├── layout.tsx               # Root layout wrapping app with AuthProvider
│   ├── page.tsx                 # Root page: dynamic welcome / home dashboard
│   ├── login/page.tsx           # Email/password & Google login
│   ├── signup/page.tsx          # Account creation page
│   ├── onboarding/page.tsx      # 3-step progressive onboarding journey
│   ├── profile/page.tsx         # Self-service profile viewing and editing
│   └── list-your-property/      # Owner intro & coming-soon landing page
├── components/
│   ├── AuthProvider.tsx         # React Context broadcasting Firebase user & tokens
│   ├── auth-ui.tsx              # Reusable form elements, buttons, errors, auth shell
│   ├── brand.tsx                # Brand mark icon and logo typography
│   └── location-search.tsx      # Debounced canonical location search input
└── lib/
    ├── firebase.ts              # Firebase Client SDK & Emulator initialization
    ├── api.ts                   # Typed API client, ApiError class, DTO interfaces
    ├── auth-errors.ts           # Friendly translations for Firebase Auth error codes
    └── onboarding-storage.ts    # Scoped localStorage helper for onboarding status
```

### Authentication State Management (`AuthProvider.tsx`)
The application wraps all routes inside an `AuthProvider` React Context:
- Subscribes to Firebase's `onAuthStateChanged` listener.
- Exposes `firebaseUser`, `loading`, `signOut()`, and `getIdToken(forceRefresh?: boolean)`.
- When a user logs in, `firebaseUser` updates immediately; all child components re-render automatically.

### API Client (`lib/api.ts`)
A clean, centralized fetch wrapper:
- Automatically invokes `auth.currentUser.getIdToken()` to attach `Authorization: Bearer <token>` to outgoing requests.
- Parses API errors and throws structured `ApiError` instances containing the HTTP status code and server detail message.
- Provides type-safe functions: `getMe()`, `getMyProfile()`, `patchMyProfile(patch)`, and `listLocations(type, search)`.

### Location Search Component (`location-search.tsx`)
A shared, debounced autocomplete component:
- Debounces keystrokes by 300ms before triggering `listLocations`.
- Uses **monotonic request IDs** (`useRef(0)`). If request #1 returns after request #2, request #1 is discarded to prevent stale search results from overwriting newer ones.
- Features distinct states: `idle`, `searching`, `done` (with empty result message), and `error` (with a non-blocking retry button).

---

## 12. Onboarding Flow

When a new user registers or signs in for the first time, they are directed through a progressive **3-step onboarding flow** (`/onboarding`):

```text
Step 1: College ──────> Step 2: Workplace ──────> Step 3: Budget & Move-in ──────> Dashboard (/)
(Search or Skip)        (Search or Skip)          (Select Chips or Custom Range)    (?saved=1)
```

### Steps Breakdown

1. **Step 1 — College ("Where do you study?")**:
   - Uses `LocationSearchField` filtering for `kind="college"`.
   - Users can select a canonical college or click **"Skip for now"**.
   - Saving sends `PATCH /api/v1/users/me/profile` with `{"college_location_id": id}`.
2. **Step 2 — Workplace ("Where do you work?")**:
   - Designed for young professionals and interns.
   - Uses `LocationSearchField` filtering for `kind="workplace"`.
   - Students freely click **"Skip for now"**.
   - Saving sends `PATCH /api/v1/users/me/profile` with `{"workplace_location_id": id}`.
3. **Step 3 — Monthly Budget & Move-in Date**:
   - Quick selection budget chips: `₹5k`, `₹8k`, `₹10k`, `₹15k`, `₹20k`. Selecting a chip sets `budget_max` (leaving `budget_min` null).
   - Custom input fields for explicit Min and Max budget in rupees.
   - Optional date picker for target move-in date.
   - User clicks **"Save & finish"** or **"Skip for now"**.

### Ergonomic Behaviors
- **Save-As-You-Go**: Each step persists its data immediately to the backend upon clicking "Save & continue". If the user closes the browser at Step 2, Step 1 is already saved.
- **Prefill & Resume**: When `/onboarding` loads, it fetches the existing profile via `getMyProfile()`. If data was previously entered, it prefills the inputs so the user never loses progress.
- **Completion Flag**: Upon completing or skipping Step 3, the frontend calls `markOnboardingDone(uid)` which writes `"1"` to `ag-onboarding-done:<uid>` in `localStorage`, then navigates to `/?saved=1`.
- **User-Scoped Storage Key**: The key is prefixed with the specific Firebase UID (`ag-onboarding-done:<firebaseUid>`). If User A logs out and User B logs in on the same browser, User A's completion state does not contaminate User B.
- **Why Onboarding Completion is in `localStorage` for MVP**:
  - Keeps the backend profile schema pure: a profile represents user preferences, not UI wizard wizardry.
  - Adding a `has_completed_onboarding` boolean column to PostgreSQL was deferred until multi-device synchronization is required.

---

## 13. Owner Experience

### What Is ACTUALLY Implemented Today
The repository currently contains an **Owner Entry and Intro Experience**:
- A secondary navigation link across Home and Auth pages: *"Own a property? List it on Apun-Ghar →"*.
- A dedicated route at `/list-your-property`.
- Clear value proposition messaging tailored for property managers (PGs, rooms, flats, student hostels).
- A primary CTA button ("Get started") that intentionally reveals a transparent status banner:
  > *"Owner listing setup is coming soon. There's no listing flow to complete yet — we'll open owner onboarding here once it's ready. Nothing has been created and your account role is unchanged."*
- **Crucial Security Reality**: Visiting or interacting with `/list-your-property` **grants no permissions, makes no database mutations, and leaves the user's role as `USER`**. There is currently NO listing creation UI, NO owner dashboard, and NO property management API.

### Intended Future Architecture (Phase 2 Roadmap)

```text
+-----------------------------------------------------------------------------------+
|                        INTENDED FUTURE OWNER ARCHITECTURE                         |
|                                                                                   |
|   1. Registered USER visits /list-your-property                                   |
|                          │                                                        |
|                          ▼                                                        |
|   2. Submits Owner Application (Property details, address, caretaker KYC)        |
|                          │                                                        |
|                          ▼                                                        |
|   3. Application stored in pending state (role remains 'USER')                    |
|                          │                                                        |
|                          ▼                                                        |
|   4. ADMIN reviews documentation via internal admin console                       |
|                          │                                                        |
|                          ▼                                                        |
|   5. On approval: Database updates user.role = 'OWNER'                            |
|                          │                                                        |
|                          ▼                                                        |
|   6. User unlocks access to Owner Dashboard (/owner/dashboard)                    |
|                          │                                                        |
|                          ▼                                                        |
|   7. Owner can create, edit, activate, and manage property listings               |
+-----------------------------------------------------------------------------------+
```

---

## 14. Current Product Data Model vs. Future Listing Model

To prevent architectural debt, we maintain a strict boundary between what exists in PostgreSQL today and what is planned for future phases.

### 1. Existing Implemented Entities
- **`users`**: Account identity, external Firebase UID, email verification, platform role (`USER`/`OWNER`/`ADMIN`), audit timestamps.
- **`user_profiles`**: Renter preferences (college ID, workplace ID, budget range, move-in date).
- **`locations`**: Canonical directory of physical colleges, workplaces, and urban areas.

### 2. Future Listing Entities (PLANNED / DEFERRED)

```text
[FUTURE ENTITIES - NOT YET IMPLEMENTED IN CODEBASE]

+--------------------+       +----------------------+       +-----------------------+
|     Properties     |       |       Listings       |       |     ListingPhotos     |
+--------------------+       +----------------------+       +-----------------------+
| id                 | 1   N | id                   | 1   N | id                    |
| owner_user_id (FK) +------>| property_id (FK)     +------>| listing_id (FK)       |
| address            |       | title, description   |       | cdn_url, display_order|
| canonical_loc_id   |       | rent_monthly         |       | is_cover_photo        |
| property_type (PG/ |       | security_deposit     |       +-----------------------+
|  flat/hostel/room) |       | available_from       |
+--------------------+       | status (draft/active/|       +-----------------------+
                             |         rented)      |       |       Amenities       |
                             +----------+-----------+       +-----------------------+
                                        |                   | id, name, icon_slug   |
                                        | N                 +-----------+-----------+
                                        v                               | N
                             +----------------------+                   |
                             |   ListingAmenities   |<------------------+
                             +----------------------+
                             | listing_id (FK)      |
                             | amenity_id (FK)      |
                             +----------------------+
```

- **`Property`** [FUTURE]: Physical real estate unit tied to an owner and location.
- **`Listing`** [FUTURE]: The commercial rental offering (e.g., "Private Room in 3BHK", "Double Sharing Boys PG"), specifying rent, deposit, notice period, and status.
- **`ListingPhoto`** [FUTURE]: Photo metadata referencing cloud storage CDN URLs.
- **`Amenity`** & **`ListingAmenity`** [FUTURE]: Standardized amenities (Wi-Fi, Food Included, Attached Washroom, Power Backup).
- **`Enquiry`** / **`VisitBooking`** [FUTURE]: Scheduled site visits requested by renters.
- **`SavedListing`** [FUTURE]: User bookmarks.

### Why Listing Tables Were Not Implemented Prematurely
Implementing database tables before business rules (such as room-sharing structures, utility billing models, and cancellation policies) are finalized leads to costly schema migrations and data model corruption. We build each phase end-to-end only when requirements are locked.

---

## 15. Roommate Feature Architecture

### The Roommate Concept (FUTURE / DEFERRED)
A critical differentiator for Apun-Ghar will be native roommate discovery. Roommate seekers fall into two primary user journeys:
- **Case A ("I have a room, need a roommate")**: A tenant already rents a 2BHK or 3BHK flat near Gauhati University and needs someone to take the vacant bedroom to split rent.
- **Case B ("I have no room, looking for someone to team up with")**: Two students from the same college want to find each other first, pool their budgets, and approach landlords together for a 2BHK.

### Why Both Remain `USER` Accounts
In both cases, these individuals are **renters and consumers**, not commercial landlords. They must NOT hold the `OWNER` role. Giving Case A an `OWNER` role would pollute the verified commercial landlord pool. Instead, they remain `USER` accounts with permission to post a `RoommatePost`.

### Planned Future Schema: `RoommatePost`
```text
RoommatePost [FUTURE / PLANNED]:
- id: INTEGER (PK)
- user_id: INTEGER (FK users.id)
- intent: ENUM ('HAVE_ROOM_SEEKING_MATE', 'NEED_ROOM_AND_MATE')
- listing_id: INTEGER (FK listings.id, optional for Case A, NULL for Case B)
- preferred_location_id: INTEGER (FK locations.id)
- budget_per_person: INTEGER
- move_in_date: DATE
- gender_preference: ENUM ('MALE', 'FEMALE', 'ANY')
- habits: JSONB (sleep schedule, study habits, dietary preferences)
- status: ENUM ('ACTIVE', 'FOUND', 'PAUSED')
```

---

## 16. Security Architecture

### Current Implemented Security Measures
1. **Cryptographic Token Verification**:
   - Every protected route verifies incoming Bearer JWT tokens using the official Firebase Admin SDK.
   - Signatures, expiration times, issuers, and audience claims are validated before executing any application code.
2. **Strict Server-Side Authorization**:
   - Application roles (`USER`, `OWNER`, `ADMIN`) are stored exclusively in PostgreSQL.
   - Role checks (`require_role`) inspect the database state, never client-supplied headers or claims.
3. **No Password Storage**:
   - PostgreSQL stores zero password hashes.
4. **Relational Isolation**:
   - Profile endpoints operate strictly on `user.id` resolved from the verified token (`/api/v1/users/me/profile`). Users cannot pass arbitrary `user_id` parameters in URLs to access or mutate other users' data.
5. **CORS Restrictions**:
   - FastAPI's `CORSMiddleware` is configured explicitly for `http://localhost:3000`.
   - Wildcards (`"*"`) are strictly forbidden. Only `GET` and `PATCH` methods and `Authorization` / `Content-Type` headers are permitted.
6. **SQL Injection & Data Integrity Protection**:
   - SQLAlchemy 2.0 parameterized queries eliminate SQL injection vulnerabilities.
   - Relational Foreign Keys, `CHECK` constraints, and Pydantic DTOs enforce data boundaries at the database and application layer.
7. **Secrets Segregation**:
   - `.env` files are ignored by git (`.gitignore`).
   - Repository contains only `.env.example` templates with non-sensitive development defaults.

### Intentionally Deferred Security Items
The following enterprise security features are deliberately deferred to future deployment phases to maintain development velocity:
- **Rate Limiting**: Protection against API flooding (will be implemented via Cloudflare or Redis token-bucket middleware prior to public release).
- **Revocation Checking**: Explicit check against Firebase's token revocation endpoint on every request (default 1-hour JWT expiration is currently accepted).
- **KYC & Government ID Verification**: Required for owners before publishing listings (Phase 2).
- **Production Secret Management**: GCP Secret Manager or AWS Secrets Manager integration.

---

## 17. Database Migrations

Database migrations are strictly version-controlled using Alembic under `backend/alembic/versions/`.

### Migration History Timeline

```text
0001_create_locations.py (2026-09-11)
  │
  ▼
0002_create_users.py (2026-09-12)
  │
  ▼
0003_locations_search.py (2026-09-13)
  │
  ▼
0004_profile_location_fks.py (2026-09-13)
  │
  ▼
0005_user_role.py (2026-09-13) [HEAD]
```

### Detailed Migrations Log

| Revision | File Name | Down Revision | Description & Critical Changes |
| :--- | :--- | :--- | :--- |
| **`0001`** | `0001_create_locations.py` | *None* | **Initial Table**: Creates the `locations` table with `id`, `type`, `name`, and `city`. |
| **`0002`** | `0002_create_users.py` | `0001` | **Core Identity**: Creates `users` table (`firebase_uid`, `email`, `role`, timestamps) and `user_profiles` table (`budget_min`, `budget_max`, `move_in_date`, and initial free-text `college`/`workplace` columns). Added CHECK constraints for budgets. |
| **`0003`** | `0003_locations_search.py` | `0002` | **Search Performance**: Creates composite B-Tree index `ix_locations_type_name` on `locations(type, name)` to accelerate location filtering. |
| **`0004`** | `0004_profile_location_fks.py` | `0003` | **Relational Integrity**: Adds `college_location_id` and `workplace_location_id` integer foreign keys to `user_profiles` referencing `locations.id` (`ON DELETE RESTRICT`). Safely backfills existing data via exact SQL match, drops legacy free-text columns. Downgrade restores columns and names. |
| **`0005`** | `0005_user_role.py` | `0004` | **Domain Model Correction**: Drops `ck_users_role`, migrates legacy `'STUDENT'` values to `'USER'`, updates default to `'USER'`, and establishes new constraint `role IN ('USER', 'OWNER', 'ADMIN')`. |

### Golden Rule: Migrations are Append-Only
Committed migrations must **never be edited or deleted**. If a schema change is required, a new migration (e.g. `0006_...`) must be generated and applied. Every migration script must include a fully tested, working `downgrade()` function to ensure reversible deployments.

---

## 18. Testing

Quality is verified via comprehensive automated test suites on both backend and frontend.

### Backend Automated Tests (Pytest)
The backend test suite is executed using `pytest` inside the virtual environment:
- **Total Tests**: **80 passed** (0 failures).
- **Execution Time**: ~8.5 seconds.
- **Coverage Breakdown**:
  - **`test_auth.py`**: Validates Bearer token parsing, emulator initialization, mock claim handling, and 401 responses on malformed headers.
  - **`test_cors.py`**: Verifies allowed origins (`http://localhost:3000`), methods (`GET`, `PATCH`), and headers.
  - **`test_health.py`**: Validates `/healthz` and `/readyz` database ping endpoints.
  - **`test_locations.py`**: Verifies location search, case-insensitive ILIKE matching, city queries, limit boundaries (1–50), 422 errors on invalid types, deterministic sort ordering, unauthenticated access, and seeder idempotency.
  - **`test_models.py`**: Verifies database constraints: role default (`USER`), rejection of `'STUDENT'` and invalid roles, uniqueness of `firebase_uid` and `email`, non-negative budgets, `budget_max >= budget_min`, and `CASCADE` deletion of profiles.
  - **`test_users_me.py`**: Tests provisioning: unauthenticated 401s, user + profile creation on first login, idempotent user re-use on subsequent logins, email sync policies, UID-based identity isolation, email collision handling, and race condition recovery.
  - **`test_users_profile.py`**: Tests profile endpoints: GET own profile, partial PATCH updates, explicit null clearing, 422 errors on non-existent or mismatched location types (e.g. assigning an area to a college), cross-field budget range validation, immutability of roles and identity fields via PATCH, user isolation, and `require_role` permission checks (401 unauthenticated, 403 unauthorized).

### Frontend Verification
- **TypeScript Typecheck**:
  `npm run typecheck` (`tsc --noEmit`) completes with **zero errors**.
- **Static Build**:
  `npm run build` succeeds cleanly, prerendering all static pages (`/`, `/login`, `/signup`, `/onboarding`, `/profile`, `/list-your-property`).

---

## 19. Local Development

Setting up Apun-Ghar on a new machine is completely containerized and requires zero paid third-party accounts.

### Prerequisites
- **Node.js** (v20+ recommended) & **npm**
- **Python** (v3.11+)
- **Docker Desktop** & **Docker Compose**
- **Java Runtime Environment** (JRE 11+) — *Required by the Firebase CLI to execute the Auth Emulator locally.*
- **Firebase CLI**: Install globally via `npm install -g firebase-tools`.

### Service Port Map

| Service | Port | Description |
| :--- | :--- | :--- |
| **Next.js Frontend** | `http://localhost:3000` | Web application UI |
| **FastAPI Backend** | `http://localhost:8000` | REST API service (`/docs` for interactive Swagger UI) |
| **PostgreSQL Database** | `localhost:5433` | Docker container port mapped to host **5433** (Internal: 5432) |
| **Firebase Auth Emulator** | `127.0.0.1:9099` | Local authentication service |
| **Firebase Emulator UI** | `http://127.0.0.1:4000` | Browser dashboard to view and inspect mock users |

> [!IMPORTANT]
> **Why Host Port 5433?**  
> On Windows workstations, a native PostgreSQL service often runs in the background on default port `5432`. To prevent connection conflicts and authentication failures, our `docker-compose.yml` maps host port **5433** to container port `5432`. Always use `5433` in local connection strings.

### Step-by-Step Setup Guide

#### 1. Start PostgreSQL Database
From repository root:
```powershell
docker compose up -d
```
Verify container is healthy via `docker compose ps`.

#### 2. Start Firebase Auth Emulator
From repository root in a separate terminal:
```powershell
firebase emulators:start --only auth --project demo-apun-ghar
```
Access the visual user inspector at `http://127.0.0.1:4000`.

#### 3. Setup & Start Backend
From repository root:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1   # On Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp ..\.env.example .env

# Apply database migrations and seed locations
alembic upgrade head
python -m app.seed

# Run backend API server
uvicorn app.main:app --reload --port 8000
```

#### 4. Setup & Start Frontend
From repository root in another terminal:
```powershell
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 20. Git & Team Workflow

To maintain a production-grade codebase, all contributors adhere to standard branch and pull request hygiene.

### The Standard Development Cycle

```text
1. git switch main
2. git pull origin main
3. git switch -c feature/<short-descriptive-name>
4. # ... write code, add tests, verify locally ...
5. git add <specific files>
6. git commit -m "feat: add location filtering by city"
7. git push -u origin feature/<short-descriptive-name>
8. Open Pull Request on GitHub -> Request Code Review
9. On approval & green CI -> Squash and Merge into main
```

### Critical Collaboration Rules
1. **Never Commit Directly to `main`**: All features, bug fixes, and refactors must go through a feature branch.
2. **Atomic, Descriptive Commits**: Use conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Avoid giant, monolithic commits like "updates" or "fixed stuff".
3. **Run Pre-Commit Verifications**:
   - Backend: Run `pytest` inside `.venv` (all 80 tests must pass).
   - Frontend: Run `npm run typecheck` and `npm run build`.
4. **Never Check In Secrets**: Real `.env` files, production service account keys, and credentials must never enter version control.

---

## 21. Development Decisions and Why

### "Important Architectural Decisions"

1. **Why Firebase Authentication instead of custom JWT/password auth?**
   - Writing custom authentication requires password hashing, salt management, password reset workflows, brute-force rate-limiting, refresh token rotation, and OAuth2 protocol handling. Delegating this to Firebase eliminates security vulnerabilities and lets the team focus on the rental domain.
2. **Why Email/Password + Google OAuth instead of Phone SMS OTP for MVP?**
   - Phone OTP requires SMS gateway infrastructure (Twilio, MSG91) with paid per-SMS billing, country-code complexities, DLT registration in India, and strict rate quotas. Email/Password and Google OAuth are 100% free, reliable, and provide a frictionless onboarding experience. Phone verification can be introduced later as a trust signal.
3. **Why the Firebase Auth Emulator for development?**
   - Allows developers to test complete authentication, signup, login, and token verification flows offline without creating a real Google Cloud project, without internet access, and without incurring cloud costs.
4. **Why PostgreSQL instead of SQLite?**
   - SQLite lacks production concurrency, network accessibility, granular `CHECK` constraints, rich indexing, and future extensions like PostGIS. Starting with PostgreSQL in Docker guarantees identical behavior between local development and production.
5. **Why FastAPI + SQLAlchemy 2.0?**
   - FastAPI offers high-performance asynchronous execution, native type annotations, automatic OpenAPI documentation, and intuitive dependency injection. SQLAlchemy 2.0 provides robust ORM mapping with full static type support.
6. **Why Integer Database IDs alongside Firebase UIDs?**
   - Integer Primary Keys provide fast, compact 4-byte foreign key joins across relational tables (`users` -> `user_profiles`). Decoupling internal relational keys from external Firebase UIDs protects our schema if identity providers ever change.
7. **Why rename `STUDENT` to `USER`?**
   - Apun-Ghar serves students, interns, and young working professionals. A student and an entry-level worker share the exact same permissions (search, profile, save, contact). The role describes platform capability, not educational status.
8. **Why Server-Side Authorization over Client Claims?**
   - Client-side code and tokens can be tampered with. Storing roles in PostgreSQL and checking them in FastAPI dependencies ensures authorization can never be bypassed.
9. **Why Canonical Locations instead of free-text inputs?**
   - Free-text produces duplicate, misspelled entries that break proximity search. Canonical location records ensure all students at a university link to the exact same foreign key ID.
10. **Why `ON DELETE RESTRICT` on Location Foreign Keys?**
    - Prevents accidental cascading deletion of educational institutions that are currently referenced by active user profiles.
11. **Why Lazy User Provisioning?**
    - Users are provisioned in PostgreSQL on their first authenticated API request. This prevents phantom database records if a user signs up in Firebase but immediately abandons the browser.
12. **Why Eager Profile Creation on User Provisioning?**
    - When a user row is created, an empty `UserProfile` row is provisioned in the same database transaction. This guarantees that `GET /me/profile` always finds a profile record, eliminating null-pointer edge cases.
13. **Why Client-Side Route Guards in React?**
    - Avoids jarring full-page browser reloads and provides immediate redirection for unauthenticated visitors while keeping client state smooth.
14. **Why a Modular Monolith?**
    - Keeps deployment simple, debugging straightforward, and transaction management atomic within a single database.
15. **Why no Redis yet?**
    - PostgreSQL handles current read/write volumes with sub-millisecond response times. Adding Redis adds cache invalidation overhead without performance need.
16. **Why no Elasticsearch / Meilisearch yet?**
    - PostgreSQL's `ILIKE` query across an indexed column easily handles search for hundreds of institutions.
17. **Why no Microservices yet?**
    - A 2–4 person engineering team would spend more time managing network communication, Docker networks, and deployment pipelines than building user features.
18. **Why no Kubernetes?**
    - Complete overkill for an MVP. A single containerized service deployed on modern PaaS (e.g. Render, Railway, Cloud Run) provides all necessary scalability.
19. **Why no Payment System in MVP?**
    - Apun-Ghar is focused on high-trust rental discovery. Processing rental deposits requires escrow mechanisms, banking licenses, refund workflows, and high transaction fees. Discovering the place and scheduling a visit is the initial core value.

---

## 22. Current Implemented Features

Every item in this checklist has been verified directly against the codebase:

- [x] **Monorepo Foundation**: Clean decoupled structure (`frontend/`, `backend/`, `docs/`).
- [x] **Containerized Database**: PostgreSQL 17 Alpine configured via `docker-compose.yml` on host port 5433.
- [x] **Alembic Database Migrations**: Sequential migrations 0001 through 0005 tracking all schema iterations.
- [x] **Firebase Auth Emulator**: Hermetic local auth environment configured via `firebase.json` (ports 9099 & 4000).
- [x] **Server Token Verification**: FastAPI dependency (`app.auth.get_firebase_claims`) validating Bearer JWTs.
- [x] **On-Demand User Provisioning**: Automatic, race-condition-safe provisioning of `users` and `user_profiles` in PostgreSQL.
- [x] **Three-Tier Role Model**: Server-enforced `USER`, `OWNER`, and `ADMIN` roles with database CHECK constraints.
- [x] **Role-Gating Dependencies**: Reusable `require_role(...)` dependency factory in FastAPI.
- [x] **User Account API**: `GET /api/v1/users/me` returning sanitized account metadata.
- [x] **Self Profile Management API**: `GET /api/v1/users/me/profile` and `PATCH /api/v1/users/me/profile` with partial update and null-clearing semantics.
- [x] **Canonical Location Registry**: Dedicated `locations` table with composite index `(type, name)`.
- [x] **Canonical Location Search API**: `GET /api/v1/locations` supporting type filtering, ILIKE querying, and result limits.
- [x] **Location Foreign Key Integrity**: Profiles link to locations via relational foreign keys with `RESTRICT` deletion rules.
- [x] **Idempotent Location Seeding**: `app.seed` script populating primary Guwahati colleges, workplaces, and neighborhoods.
- [x] **CORS Security**: Strict middleware restricting requests to `http://localhost:3000` with credential support.
- [x] **Frontend Authentication Context**: `AuthProvider.tsx` listening to Firebase Auth state changes.
- [x] **Frontend Email/Password Auth**: Login and signup pages with client validation and friendly error translation.
- [x] **Frontend Google OAuth**: One-click Google sign-in integration via Firebase popup.
- [x] **Progressive 3-Step Onboarding UI**: College selection, workplace selection, and budget chip/range selector.
- [x] **Save-As-You-Go Onboarding**: Immediate step-by-step profile persistence with resume/prefill support.
- [x] **Autocomplete Location Field**: Debounced search component with stale-request protection and error recovery.
- [x] **Profile Management UI**: `/profile` page allowing users to view and update preferences anytime.
- [x] **Owner Entry Landing Page**: `/list-your-property` with dedicated value proposition and coming-soon announcement.
- [x] **Automated Test Coverage**: 80 automated backend Pytest tests covering models, auth, locations, and profiles.

---

## 23. Not Implemented / Deferred

The following items are **explicitly NOT implemented** in the current codebase:

- [ ] **Property Models & Tables**: No `properties`, `listings`, `photos`, or `amenities` tables exist in the database.
- [ ] **Owner Listing Creation**: No forms or API endpoints exist for owners to submit or edit listings.
- [ ] **Owner Verification Pipeline**: No document upload or KYC verification workflows exist.
- [ ] **Owner Management Dashboard**: No `/owner/dashboard` or property management portal exists.
- [ ] **Public Marketplace Search**: No property catalog search, map view, or filter UI exists.
- [ ] **Listing Detail Pages**: No public property detail routes (`/property/[id]`) exist in the real frontend.
- [ ] **Saved Listings / Bookmarks**: No capability to save favorite listings to a user account.
- [ ] **In-App Messaging / Chat**: No chat system or communication channels exist between renters and owners.
- [ ] **Site Visit Scheduling**: No booking engine for in-person property tours.
- [ ] **Roommate Discovery Posts**: No database schema or UI for roommate matching posts.
- [ ] **Compatibility Matching**: No roommate matching algorithms.
- [ ] **Phone Number SMS OTP**: No SMS gateway or phone authentication.
- [ ] **Online Payments / Rent Escrow**: No Razorpay, Stripe, or payment gateway integration.
- [ ] **Redis Caching**: No in-memory cache server.
- [ ] **Full-Text / Trigram Search**: No `pg_trgm` or external search engines (Elasticsearch/Meilisearch).
- [ ] **WebSockets / Real-Time**: No real-time notification or message streaming layers.
- [ ] **Background Task Workers**: No Celery, ARQ, or Redis Queue workers.
- [ ] **Microservices**: All code resides strictly within the single modular FastAPI monolith.

---

## 24. Known Limitations & Technical Debt

1. **Database Port Mapping (Host Port 5433)**:
   - *Issue*: The database is exposed on host port `5433` instead of the default `5432`.
   - *Impact*: Developers connecting manual SQL clients (e.g. DBeaver, pgAdmin) who assume port 5432 will accidentally hit their local native Windows PostgreSQL instance or fail to connect.
   - *Why Deferred*: Done intentionally to avoid breaking local Windows PostgreSQL services.
2. **Onboarding Status Stored in `localStorage`**:
   - *Issue*: Whether a user has finished onboarding is tracked in browser `localStorage` (`ag-onboarding-done:<uid>`).
   - *Impact*: If a user completes onboarding on their laptop and then logs in on their phone, the mobile browser will show the onboarding flow again (though fields will prefill from the server).
   - *Solution*: Add a `has_completed_onboarding` boolean column to the `users` table in Phase 2.
3. **No Active Property Browsing on Home Page**:
   - *Issue*: The root page (`/`) displays saved preference confirmation for logged-in users rather than property cards.
   - *Impact*: Users cannot browse listings yet.
   - *Why Deferred*: Phase 1 focused strictly on authentication, identity, and renter profiling. Listing models arrive in Phase 2.
4. **PostgreSQL `ILIKE` for Location Search**:
   - *Issue*: Substring search using `%pattern%` cannot utilize standard B-Tree indexes for left-wildcard queries.
   - *Impact*: Negligible on small catalogs (< 1,000 rows), but will degrade if millions of locations are inserted.
   - *Solution*: Introduce the `pg_trgm` extension and a GIN trigram index via Alembic when scaling to nationwide institutions.
5. **No Mandatory Email Verification Gate**:
   - *Issue*: `email_verified` is synchronized from Firebase into PostgreSQL, but unverified users are not blocked from accessing the profile API.
   - *Impact*: Users with unverified emails can complete onboarding.
   - *Solution*: Add an `email_verified` check inside `get_current_user` once transactional email delivery is configured.

---

## 25. How to Explain This Project in an Interview

Use these structured responses when discussing Apun-Ghar in technical interviews:

### A. 30-Second Elevator Pitch
> "I'm building Apun-Ghar, a rental marketplace designed specifically for students and young professionals in tier-2 cities, starting with Guwahati. Unlike generic broker-dominated portals like 99acres or family-focused platforms like NoBroker, Apun-Ghar anchors rental discovery around canonical colleges and workplaces with transparent pricing. Architecturally, it's a decoupled modular monolith with a Next.js App Router frontend, a FastAPI backend, PostgreSQL for relational data, and Firebase for identity."

### B. 1-Minute Pitch
> "Finding rental housing as a student or young worker in India is broken—it's dominated by sketchy brokers, fake listings, and fragmented WhatsApp groups. With Apun-Ghar, we're building a structured, verified marketplace. Renter onboarding captures budget and target institutions, mapping them to canonical database entities rather than free-text strings. On the backend, we run FastAPI with SQLAlchemy 2.0 and PostgreSQL 17, enforcing strict database check constraints and relational foreign keys. For auth, we decoupled identity by using Firebase Authentication for JWT issuance, while our backend performs server-side signature verification and maintains its own role-based authorization model in PostgreSQL. We've completed the authentication, user provisioning, and canonical location systems with 80 passing backend tests."

### C. 3-Minute Deep Dive
> "Let me walk you through the technical architecture of Apun-Ghar. The system is intentionally designed as a decoupled modular monolith. On the frontend, we use Next.js 16 with the App Router, React 19, and Tailwind CSS v4. On the backend, we use FastAPI running on Uvicorn, with SQLAlchemy 2.0 and Alembic for migrations.
> 
> When designing authentication, we wanted to avoid the security hazards of storing passwords or building custom JWT refresh logic. We chose Firebase Authentication, which handles Email/Password and Google OAuth. In local development, we run the Firebase Auth Emulator on port 9099, so the app runs completely offline with zero cloud costs.
> 
> When a client makes a request, it attaches the Firebase ID token in the Authorization header. Our FastAPI dependency extracts and cryptographically verifies the token using the Firebase Admin SDK. Once verified, we execute an on-demand provisioning step: we query our `users` table by `firebase_uid`. If the user doesn't exist, we atomically create the user and an associated `user_profiles` row in a single transaction.
> 
> For authorization, we strictly reject frontend role claims. The database stores the authoritative role—`USER`, `OWNER`, or `ADMIN`—enforced by a PostgreSQL CHECK constraint. We renamed our initial 'STUDENT' role to 'USER' via a database migration because our target market includes young corporate professionals and renters of all kinds.
> 
> Another key architectural decision was our location system. Instead of letting users type arbitrary strings for their university or workplace, we introduced a canonical `locations` table. User profiles link to locations via foreign keys with `ON DELETE RESTRICT`. This guarantees data cleanliness for future proximity matching. The entire backend is covered by 80 automated pytest tests, and both TypeScript typechecking and static builds pass cleanly."

### D. "Explain the Architecture"
> "It's a clean client-server architecture. The Next.js frontend is a static/client-rendered SPA communicating via JSON REST APIs with FastAPI. Identity is externalized to Firebase, while application state lives in PostgreSQL. The backend acts as the single authority: verifying identity tokens, resolving internal integer user IDs, enforcing roles, and executing business logic. We intentionally avoided microservices and caching layers like Redis to keep operational complexity low while maintaining high transactional rigor."

### E. "Why Firebase?"
> "Authentication is a specialized domain with significant security liabilities. Implementing secure password hashing, brute-force mitigation, email verification, and OAuth2 token exchange takes weeks and introduces security risks. Firebase gives us audited, Google-grade authentication out of the box. Most importantly, by using the Firebase Auth Emulator, our development environment remains hermetic, fast, and completely free."

### F. "Why PostgreSQL?"
> "Rental marketplaces rely on relational integrity: users have profiles, profiles reference canonical locations, and listings will reference properties, owners, and amenities. PostgreSQL provides uncompromising ACID compliance, foreign key constraints (`ON DELETE RESTRICT` and `CASCADE`), and database-level `CHECK` constraints (like ensuring `budget_max >= budget_min`). It also offers a seamless future upgrade path to PostGIS for geospatial radius search and `pg_trgm` for fuzzy search."

### G. "How Authentication Works"
> "The client authenticates directly against Firebase using Email/Password or Google OAuth, receiving a short-lived signed JWT ID token. The frontend sends this token in the `Authorization: Bearer` header on API calls. FastAPI's `HTTPBearer` dependency intercepts the request, calls `firebase_admin.auth.verify_id_token()`, and extracts the verified claims. If valid, the backend resolves the corresponding application user from PostgreSQL using the `firebase_uid`."

### H. "How Authorization Works"
> "Authorization is strictly internal and server-side. The Firebase token only tells us *who* the user is (their UID); it does not dictate what they can do. We store the user's role in our PostgreSQL `users` table (`USER`, `OWNER`, `ADMIN`). Protected endpoints use our `require_role(...)` FastAPI dependency, which checks the role directly against the database record. There is no public API to mutate roles, preventing unauthorized self-promotion."

### I. "Explain the Database Design"
> "The schema is normalized. We separate identity and authentication metadata in `users` from preference data in `user_profiles`, linked via a 1:1 foreign key with `ON DELETE CASCADE`. Profiles reference a canonical `locations` table via foreign keys for college and workplace. We enforce constraints at the database level: budget values cannot be negative, budget max must exceed budget min, and user roles must be one of three allowed strings."

### J. "Why `USER` / `OWNER` / `ADMIN`?"
> "In our initial draft, we had a `STUDENT` role. We realized this was a domain modeling mistake: a college student, an intern, and a junior software engineer all consume housing identically. The role shouldn't describe the user's life stage; it should describe their platform permissions. `USER` is a renter/tenant. `OWNER` is an approved property manager who can publish listings. `ADMIN` is an internal moderator. We executed Alembic migration `0005` to migrate existing records and update the check constraint cleanly."

### K. "Why Not Microservices?"
> "Microservices solve organizational scaling problems for companies with hundreds of engineers and distinct domain boundaries. For an early-stage product with a small team, microservices introduce distributed transaction headaches, network latency, complex deployments, and debugging nightmares. A modular monolith provides clean code boundaries inside a single deployable unit, giving us maximum speed with zero operational overhead."

### L. "What Would You Build Next?"
> "Phase 2 focuses on supply: designing the `Property` and `Listing` relational models, building the owner verification pipeline, and creating an owner listing dashboard. Following that, we will implement public marketplace search with location-anchored filtering, in-app visit scheduling, and our roommate discovery feature."

---

## 26. Important Terms & Glossary

- **JWT (JSON Web Token)**: An open standard (RFC 7519) for securely transmitting information between parties as a cryptographically signed JSON object.
- **Firebase ID Token**: A short-lived (1 hour) signed JWT issued by Firebase Auth proving that the user successfully authenticated.
- **Firebase UID**: A unique, immutable 128-character alphanumeric string assigned by Firebase to uniquely identify a user across all sign-in providers.
- **Authentication (AuthN)**: The process of verifying *who* a user is (e.g., confirming their email and password).
- **Authorization (AuthZ)**: The process of verifying *what* an authenticated user has permission to do (e.g., verifying if a user can create a property listing).
- **RBAC (Role-Based Access Control)**: Restricting system access to authorized users based on predefined roles (`USER`, `OWNER`, `ADMIN`).
- **FastAPI Dependency Injection (`Depends`)**: A pattern where endpoint functions declare their requirements (database sessions, authenticated users, role checks), and FastAPI automatically resolves and injects them at runtime.
- **SQLAlchemy ORM**: An Object Relational Mapper that translates Python classes into SQL tables and queries, providing type safety and connection management.
- **Alembic Migration**: A version-controlled Python script that applies incremental, reversible changes (upgrades/downgrades) to the database schema.
- **Foreign Key (FK)**: A database column that establishes a link between data in two tables, enforcing referential integrity.
- **`ON DELETE CASCADE`**: A foreign key rule specifying that if the parent record is deleted, all associated child records are automatically deleted.
- **`ON DELETE RESTRICT`**: A foreign key rule specifying that a parent record cannot be deleted if child records still point to it.
- **`CHECK` Constraint**: A database rule that validates boolean conditions on column values before allowing an `INSERT` or `UPDATE` (e.g., `budget_min >= 0`).
- **CORS (Cross-Origin Resource Sharing)**: A browser security mechanism that restricts web applications running at one origin (`localhost:3000`) from making HTTP requests to a different origin (`localhost:8000`).
- **HTTP PATCH**: An HTTP method designed for applying partial modifications to a resource, leaving unmentioned fields untouched.
- **Canonical Location**: A single, authoritative, standardized database record representing a physical institution, preventing duplicate or misspelled entries.
- **Firebase Auth Emulator**: A local, offline emulator provided by the Firebase CLI that mimics Firebase Authentication for testing without hitting Google servers.
- **Modular Monolith**: A software design pattern where a single monolithic codebase is structured into strictly decoupled, self-contained modules.
- **Lazy Provisioning**: Creating a database entity on-demand only when it is first needed (e.g., creating a PostgreSQL user row on their first authenticated API call).

---

## 27. Final Architecture Map

The following end-to-end diagram displays the complete runtime architecture of Apun-Ghar as implemented today, alongside the exact integration points where future domain modules will plug in:

```text
===================================================================================================
                                      APUN-GHAR SYSTEM ARCHITECTURE
===================================================================================================

[CLIENT LAYER]
  Browser (Mobile / Desktop)
    │
    ├─► Next.js App Router (Port 3000)
    │     ├── Public Routes: / (Welcome), /login, /signup, /list-your-property
    │     ├── Protected Routes: /onboarding, /profile
    │     ├── Components: AuthProvider, LocationSearchField, AuthShell
    │     └── Storage: localStorage ('ag-onboarding-done:<uid>')
    │
    └─► Firebase Client Web SDK
          │
          ▼ Authenticate (Email/Password or Google Popup)
[IDENTITY LAYER]
  Firebase Auth Emulator (:9099) [Local Dev]  /  Google Firebase Auth [Production]
    │
    ▼ Issues Signed JWT (ID Token)
    │
    ▼ Attaches to Header: "Authorization: Bearer <ID_TOKEN>"
[API GATEWAY & APPLICATION SERVICE]
  FastAPI Modular Monolith (:8000)
    │
    ├── CORSMiddleware (allow_origins: ['http://localhost:3000'])
    │
    ├── [MODULE: Auth] app/auth.py
    │     ├── verify_id_token() via Firebase Admin SDK
    │     ├── get_or_create_current_user() (Lazy Provisioning & Email Sync)
    │     └── require_role('USER' | 'OWNER' | 'ADMIN')
    │
    ├── [MODULE: Users & Profiles] app/users.py
    │     ├── GET   /api/v1/users/me
    │     ├── GET   /api/v1/users/me/profile
    │     └── PATCH /api/v1/users/me/profile (Partial updates, validation)
    │
    ├── [MODULE: Locations] app/locations.py
    │     └── GET   /api/v1/locations (Type filter, ILIKE search, limit)
    │
    ├── [SYSTEM PROBES] app/main.py
    │     ├── GET   /healthz (Liveness)
    │     └── GET   /readyz  (PostgreSQL connectivity test)
    │
    │  =============================================================================
    │  [FUTURE PLUG-IN MODULES - PHASE 2 & BEYOND]
    │  ├── [FUTURE: Listings & Properties] (app/listings.py) ──> Listings CRUD
    │  ├── [FUTURE: Owner Application]     (app/owners.py)   ──> KYC & Admin approval
    │  ├── [FUTURE: Marketplace Search]    (app/search.py)   ──> Proximity filter
    │  ├── [FUTURE: Visits & Enquiries]    (app/visits.py)   ──> Schedule property tours
    │  ├── [FUTURE: Roommates]             (app/roommates.py)──> Roommate matching posts
    │  └── [FUTURE: In-App Messaging]      (app/messages.py) ──> WebSockets / Chat
    │  =============================================================================
    │
    ▼ SQLAlchemy 2.0 ORM Engine (app/db.py)
[PERSISTENCE LAYER]
  PostgreSQL 17 Database (Docker: container 5432 -> host 5433)
    │
    ├── CURRENT TABLES (Alembic Head: 0005)
    │     ├── users          (id, firebase_uid, email, role, display_name, timestamps)
    │     ├── user_profiles  (user_id, college_loc_id, workplace_loc_id, budgets, move_in)
    │     └── locations      (id, type, name, city) [Index: ix_locations_type_name]
    │
    └── FUTURE TABLES [PLANNED]
          ├── properties     (owner_id, address, property_type)
          ├── listings       (property_id, rent, deposit, status)
          ├── listing_photos (listing_id, cdn_url, display_order)
          ├── amenities      (name, icon_slug)
          ├── visits         (listing_id, user_id, scheduled_time, status)
          └── roommate_posts (user_id, intent, budget, preferences)
===================================================================================================
```
