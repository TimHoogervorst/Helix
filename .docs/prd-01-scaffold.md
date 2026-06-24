# PRD-01: OpenScience — Project Scaffold & Dockerized Foundation

> Status: `ready-for-agent`
> Date: 2026-06-24
> Target: `docker-compose up` delivers a running Django + React + PostgreSQL application

---

## Problem Statement

OpenScience currently has no codebase. Developers and contributors cannot stand up a working instance of the application. A researcher evaluating the project cannot run it locally to see the ELN in action. Before any feature work can begin, the foundational project infrastructure must exist — a single command must bring up the full stack with the three core apps registered, the database migrated, and the frontend serving.

The project needs to prove that the architecture decisions from the grilling session (Django + DRF + PostgreSQL + React SPA, 3-app structure, Docker deployment) actually compose into a runnable system.

## Solution

A project scaffold that delivers `docker-compose up` → a working application with:

- **Django backend** with the `core`, `eln`, and `lims` apps registered and migrated
- **PostgreSQL 16** database with pgvector extension enabled (AI-ready from day 1)
- **React frontend** (Vite + TypeScript) served in dev mode, talking to the Django API
- **Django admin** accessible and functional (free CRUD during early development)
- **DRF browseable API** for all registered endpoints
- **One working end-to-end feature**: create an ELN entry via the API, see it in the list

This is not a feature PRD. It's a foundation PRD. The goal is to make the architecture real enough that subsequent phases (ELN editor, LIMS entities, # references, permissions) can be built on a solid, runnable base.

## User Stories

### Primary: Developer / Contributor

1. As a developer, I want to clone the repository and run `docker-compose up`, so that I have a fully running application in under 5 minutes with no manual setup.
2. As a developer, I want the backend to auto-reload on code changes, so that I can iterate quickly during development.
3. As a developer, I want the frontend to hot-reload on code changes, so that I can see UI changes immediately.
4. As a developer, I want database migrations to run automatically on container startup, so that I never need to run `python manage.py migrate` manually.
5. As a developer, I want a Django superuser auto-created on first startup, so that I can immediately log into the admin panel.
6. As a developer, I want to see all three apps (`core`, `eln`, `lims`) registered in Django, so that I can verify the project structure is correct.
7. As a developer, I want `pgvector` extension installed and available, so that I can add vector columns later without a migration to enable it.
8. As a developer, I want DRF's OpenAPI schema available at a known URL, so that I can explore the API surface and generate types.
9. As a developer, I want the build to fail fast with clear errors if PostgreSQL is unreachable, so that I don't waste time debugging silent failures.
10. As a developer, I want project documentation in the README covering how to start, stop, and reset the dev environment, so that I don't need tribal knowledge to contribute.

### Secondary: Evaluator / Researcher

11. As a researcher evaluating OpenScience, I want to run `docker-compose up` and see a web interface, so that I can judge whether this tool fits my lab.
12. As a researcher, I want to log into Django admin and create an ELN entry, so that I can see the core data model working even before the full UI exists.
13. As a researcher, I want to browse a list of ELN entries via a basic React page, so that I understand the application is real and functional.

### Stretch (if time): Early Adopter

14. As a lab member, I want to register a user account, so that I can start using the system without admin intervention.
15. As a lab member, I want to create a simple rich-text ELN entry from the React UI, so that I can begin capturing my lab notes.

## Implementation Decisions

### Stack & Versions

- **Python 3.12**, **Django 5.1**, **Django REST Framework 3.15**
- **PostgreSQL 16** with `pgvector` extension
- **Node 22**, **React 19**, **Vite 6**, **TypeScript 5.7**
- **Docker Compose v2** with 3 services: `db`, `backend`, `frontend`

### Project Layout

Three Django apps live inside a single Django project, all in one repo:

```
openscience/
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── backend/
│   ├── manage.py
│   ├── config/              # Django project settings, urls, wsgi
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── core/                # Folder, User, Group, Permission, base Entity
│   │   ├── models.py
│   │   ├── admin.py
│   │   └── migrations/
│   ├── eln/                 # NotebookEntry, EntryVersion, Mention
│   │   ├── models.py
│   │   ├── admin.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   └── migrations/
│   └── lims/                # Entity, EntityType, Action
│       ├── models.py
│       ├── admin.py
│       ├── serializers.py
│       ├── views.py
│       ├── urls.py
│       └── migrations/
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── api/             # API client, fetch wrappers
│   │   ├── pages/           # ELN list, ELN detail (basic)
│   │   └── components/      # Shared UI components
│   ├── vite.config.ts
│   └── package.json
└── .docs/                   # Architecture docs, PRDs
```

### Docker Compose Design

Three services:

- **`db`**: PostgreSQL 16 image, pgvector installed. Data persisted via named volume. Health check so `backend` waits for it.
- **`backend`**: Python 3.12, Django served via `runserver` in dev. Depends on `db` being healthy. Auto-runs `migrate` and `create_superuser` on start via an entrypoint script. Source code mounted as a volume for hot-reload.
- **`frontend`**: Node 22, Vite dev server with HMR. Proxies `/api` and `/admin` to `backend`. Depends on `backend` being healthy.

No production hardening. No gunicorn, no nginx, no built static files. This is a dev environment.

### Data Models (Initial Migration)

Only the models needed for Phase 1 scaffold are created. Later phases extend these.

**`core` app — first migration:**
- `User` — extends Django's `AbstractUser`. Fields: `username`, `email`, `password` (Django default hasher), `auth_token` (DRF Token). Groups via Django's built-in M2M.
- `Group` — Django's built-in `Group`.
- `Folder` — `name`, `parent` (FK to self, nullable), `created_at`. No permissions yet (Phase 4).

**`eln` app — first migration:**
- `NotebookEntry` — `title`, `content` (TextField for now; rich text JSONB later), `folder` (FK to Folder), `author` (FK to User), `created_at`, `updated_at`. No version history yet (comes later in Phase 1 when rich text is added).
- `Mention` — `source_entry` (FK to NotebookEntry), `target_type` (ContentType FK), `target_id` (PositiveIntegerField), `context` (TextField). Parsed from `#` references on save.

**`lims` app — first migration:**
- `EntityType` — `name` (CharField, unique). No schema field yet.
- `Entity` — `name`, `entity_type` (FK to EntityType), `barcode` (CharField, unique, nullable), `properties` (JSONField, default=dict), `folder` (FK to Folder, nullable), `created_by` (FK to User), `created_at`.
- `Action` — `entity` (FK to Entity), `action_type` (CharField with choices), `performed_by` (FK to User), `source_entry` (FK to NotebookEntry, nullable), `data` (JSONField, default=dict), `created_at`.

### API Endpoints (Phase 1)

All endpoints use DRF `ModelViewSet` + `DefaultRouter`. DRF browseable API available for all.

**ELN:**
- `GET /api/eln/entries/` — list all entries (title, author, folder, created_at). Paginated.
- `POST /api/eln/entries/` — create entry (title, content, folder_id). Auth required.
- `GET /api/eln/entries/<id>/` — retrieve single entry with full content.
- `PUT /api/eln/entries/<id>/` — update entry. Auth required.
- `DELETE /api/eln/entries/<id>/` — delete entry. Auth required.

**LIMS (read-only for now, fully implemented in Phase 2):**
- `GET /api/lims/entities/` — list all entities. Paginated, filterable by entity_type.
- `GET /api/lims/entities/<id>/` — retrieve single entity with properties.
- `GET /api/lims/entity-types/` — list entity types.

**Core:**
- `GET /api/core/folders/` — list root folders. Each folder includes children.
- `GET /api/core/folders/<id>/` — retrieve folder with children and contents.
- `POST /api/auth/register/` — register new user. Returns auth token.
- `POST /api/auth/login/` — login. Returns auth token.

### Frontend (Phase 1)

React 19 with React Router. Minimal styling — raw HTML or a lightweight utility class approach. No component library yet.

Pages:
- **`/`** — redirect to `/eln`
- **`/eln`** — ELN entry list (title, author, date). "New Entry" button.
- **`/eln/new`** — basic form: title textarea, content textarea. Submit creates via API.
- **`/eln/:id`** — read-only entry view. Title, author, date, content.

State management: React component state + fetch. No Redux, no TanStack Query yet — we add those when we need them.

### OpenAPI / API Documentation

DRF's `spectacular` generates an OpenAPI 3.0 schema at `/api/schema/`. Swagger UI at `/api/docs/`. This is the contract the React frontend and future AI agents consume.

### pgvector Readiness

The `pgvector` extension is enabled in the PostgreSQL container and the `vector` type is available. No vector columns are created yet (that's for AI search in a later phase). The migration that enables the extension lives in the `core` app.

## Testing Decisions

### What Makes a Good Test

- Tests exercise external behavior (HTTP requests/responses), not implementation details (model fields, queryset internals)
- Tests use the DRF test client or plain `requests` against the running API
- Database state is reset between tests (Django's `TransactionTestCase`)
- No frontend unit tests in Phase 1 — the API is the contract

### Seams

The **REST API** is the primary seam. Every feature is testable through HTTP calls. We do not test models, serializers, or views in isolation — we test the API endpoint, the response shape, and the side effects.

The **`#` reference parser** is a secondary seam — a pure function (text → list of parsed references). This is tested as a unit because it has well-defined input/output and no dependencies.

### Tests Written

**`eln/tests/test_api.py`:**
- `test_list_entries_empty` — GET /api/eln/entries/ returns empty list with 200
- `test_create_entry_authenticated` — POST with valid token returns 201, entry appears in DB
- `test_create_entry_unauthenticated` — POST without token returns 401
- `test_retrieve_entry` — GET by ID returns full entry including content
- `test_update_entry` — PUT updates title and content, returns 200
- `test_delete_entry` — DELETE removes entry, subsequent GET returns 404
- `test_list_entries_pagination` — 50 entries, GET with page_size=20 returns 20 + next link

**`eln/tests/test_parser.py`:**
- `test_no_references` — text with no # returns empty list
- `test_single_eln_reference` — `"see #123 for details"` returns one mention with id 123
- `test_multiple_references` — `"used #45 and #67"` returns two mentions
- `test_mixed_references` — `"#eln42 and #sample7"` returns correctly typed mentions
- `test_number_edge_cases` — `"pH 7.0 at #50"` does not parse `7.0`

**`lims/tests/test_api.py`:**
- `test_list_entity_types` — GET returns the seeded types
- `test_list_entities_empty` — GET returns empty list
- `test_create_entity_requires_auth` — POST without token returns 401

### Seed Data

A management command or migration seeds:
- One superuser (`admin` / `admin`, force-password-change on first login)
- Three EntityTypes: `"DNA"`, `"Chemical"`, `"General"`
- One root Folder: `"Default"`

## Out of Scope

- **Rich text editor** (TipTap/ProseMirror). Content is plain text via `<textarea>` for now.
- **Entry version history.** Save overwrites; no EntryVersion table yet.
- **Entry search or filtering.** Simple paginated list only.
- **Entity CRUD via UI.** Entities viewable via API/Django admin only.
- **Entity schema/templates.** EntityType has no schema field yet.
- **Actions system.** Action model exists but no UI or API for recording actions.
- **Permissions / RBAC.** Auth tokens exist, but no role enforcement yet. All authenticated users can CRUD all entries.
- **Group management.**
- **Folder management UI.** Flat "Default" folder for all entries. No folder tree yet.
- **Cross-folder references / graph system.**
- **Plugin system / MolBio.**
- **MCP endpoints / AI features.**
- **Production hardening** (gunicorn, nginx, static file serving, HTTPS, proper secret management).
- **CI/CD pipeline.** Local dev only.

## Further Notes

### Why Django Admin Is Included

Django admin gives us free CRUD during early development. Before the React UI catches up to the data model, developers and evaluators can create/edit/delete any model through the admin panel at `/admin/`. This is a deliberate accelerator — we don't build admin features, we leverage Django's built-in one, and we remove reliance on it as the React UI matures.

### Why Vite and Not Next.js

Vite is chosen over Next.js for the React frontend because:
- No SSR requirement. This is a SPA behind an API.
- Faster dev startup and HMR.
- Simpler deployment story for the Docker setup (just a dev server proxy).
- Less framework lock-in. The frontend can evolve independently.

### Why DRF and Not Django Ninja

Django REST Framework is chosen over newer alternatives (Django Ninja, Strawberry) because:
- Mature ecosystem, massive community, well-known patterns for contributors
- DRF's browseable API is a free debug UI during development
- DRF spectacular gives OpenAPI 3.0 out of the box
- Django Ninja's FastAPI-like approach is appealing but has fewer real-world plugin/auth integrations

### Docker Entrypoint Script

The backend container's entrypoint script (`backend/entrypoint.sh`) should:
1. Wait for PostgreSQL to be healthy (poll or `pg_isready`)
2. Run `python manage.py migrate --noinput`
3. Run `python manage.py seed_data` (idempotent — skips if data exists)
4. Start `python manage.py runserver 0.0.0.0:8000`

This means `docker-compose up` on a fresh clone goes from nothing to fully functional in one command.

### API Client Conventions

The React frontend uses a thin API client module (`frontend/src/api/client.ts`) that wraps `fetch`:
- Reads the auth token from localStorage
- Attaches `Authorization: Token <token>` header to all requests
- Handles 401 responses by redirecting to `/login`
- Parses JSON responses and returns typed objects

No code generation from OpenAPI yet — manual types for Phase 1. We add code generation when the API surface stabilizes.

### Next PRDs

- **PRD-02: ELN Rich Editor** — TipTap integration, rich text content model, entry versioning
- **PRD-03: LIMS Entities** — full entity CRUD, entity type schemas, barcode scanning
- **PRD-04: References & Actions** — # reference parser, mention system, action recording
- **PRD-05: Permissions** — RBAC, group management, folder-level access control
