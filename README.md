# Helix

Open-source ELN/LIMS for research labs. Flexible, extensible, AI-native.

> **Status:** Phase 1 scaffold — Dockerized Django + React + PostgreSQL foundation.
> ELN entries with TipTap rich-text editor, LIMS entities with typed schemas, and inline
> `#` reference system all functional. Permissions and plugin system deferred.

## Quick Start

```bash
git clone <repo-url> openscience
cd openscience
docker-compose up
```

On first run, the backend automatically:
- Runs database migrations
- Seeds initial data (superuser + entity types + root folder)

## Access Points

| Service | URL | Notes |
|---------|-----|-------|
| Frontend (React) | http://localhost:5173 | SPA with hot-reload |
| Backend API | http://localhost:8000/api/ | DRF browseable API |
| Django Admin | http://localhost:8000/admin/ | Login: `admin` / `admin` |
| API Schema (OpenAPI) | http://localhost:8000/api/schema/ | OpenAPI 3.0 spec |
| API Docs (Swagger) | http://localhost:8000/api/docs/ | Interactive API docs |

## API Endpoints

### ELN

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/eln/entries/` | No | List entries (paginated) |
| POST | `/api/eln/entries/` | Yes | Create entry with TipTap JSON content |
| GET | `/api/eln/entries/{display_id}/` | No | Retrieve entry by display ID (e.g. `E1`) |
| PUT | `/api/eln/entries/{display_id}/` | Yes | Update entry (re-triggers mention sync) |
| PATCH | `/api/eln/entries/{display_id}/` | Yes | Partial update |
| DELETE | `/api/eln/entries/{display_id}/` | Yes | Delete entry |

### LIMS

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/lims/entities/` | No | List entities (filterable by `?type=` and `?search=`) |
| POST | `/api/lims/entities/` | Yes | Create entity |
| GET | `/api/lims/entities/{display_id}/` | No | Retrieve entity by display ID (e.g. `BLOOD1`) |
| PUT | `/api/lims/entities/{display_id}/` | Yes | Update entity |
| PATCH | `/api/lims/entities/{display_id}/` | Yes | Partial update |
| DELETE | `/api/lims/entities/{display_id}/` | Yes | Delete entity |
| POST | `/api/lims/entities/batch/` | No | Batch-resolve display IDs |
| GET | `/api/lims/entity-types/` | No | List entity types (schemas) |
| POST | `/api/lims/entity-types/` | Yes | Create entity type |
| GET | `/api/lims/entity-types/{id}/` | No | Retrieve entity type |
| PUT | `/api/lims/entity-types/{id}/` | Yes | Update entity type |
| PATCH | `/api/lims/entity-types/{id}/` | Yes | Partial update |
| DELETE | `/api/lims/entity-types/{id}/` | Yes | Soft-delete (sets `is_active=False`) |
| GET | `/api/lims/actions/` | No | List actions (filterable by `?entity=` and `?action_type=`) |

### References

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/references/resolve/` | No | Batch-resolve display IDs to target details |
| GET | `/api/references/search/?q=` | No | Search references by display ID prefix |

### Core

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/core/folders/` | No | List root folders |
| GET | `/api/core/folders/{id}/` | No | Retrieve folder with children |

Authentication is via Django sessions (login through `/admin/`). DRF `TokenAuthentication` is available but no registration endpoint exists yet — tokens are created through Django admin for now.

## Running Tests

```bash
# Backend tests (Django)
docker-compose exec backend python manage.py test

# Frontend tests (Vitest)
docker-compose exec frontend npx vitest run
```

## Resetting the Environment

```bash
# Stop and remove containers, networks, and the database volume
docker-compose down -v

# Fresh start
docker-compose up
```

### Danger Zone

For development/testing, bulk-delete endpoints are available:

| Method | Endpoint | Description |
|--------|----------|-------------|
| DELETE | `/api/eln/entries/delete_all/` | Delete all ELN entries |
| DELETE | `/api/lims/entities/delete_all/` | Delete all LIMS entities |
| DELETE | `/api/lims/entity-types/delete_all/` | Delete all entity types (and entities) |
| DELETE | `/api/delete-everything/` | Delete all data across all apps |

## Architecture

```
openscience/
├── backend/
│   ├── config/          # Django project settings, urls, wsgi
│   ├── core/            # User, Folder, base models, seed data
│   ├── eln/             # NotebookEntry, Mention, TipTap validation
│   ├── lims/            # Entity, EntityType, Action, entity sync
│   └── references/      # Display ID resolution, mention sync, search
├── frontend/            # React 19 SPA (Vite + TypeScript)
│   └── src/
│       ├── extensions/  # TipTap extensions (Reference, LimsTable, SlashCommands)
│       ├── components/  # ReferenceBadge, LimsTableNode, LimsDetailCard
│       └── pages/       # ElnList, ElnDetail, ElnNew, LimsList, Settings
├── docs/                # ADRs and technical documentation
│   └── adr/
├── .docs/               # Architecture design docs and PRDs
├── docker-compose.yml
├── Dockerfile.backend
└── Dockerfile.frontend
```

**Stack:** Python 3.12 · Django 5.1 · DRF 3.15 · PostgreSQL 16 (pgvector) · Node 22 · React 19 · Vite 6 · TypeScript 5.7 · TipTap 2.x

## Key Design Decisions

- **TipTap JSON** for ELN entry content — zero-translation storage, queryable via PostgreSQL JSONB, safe rendering ([ADR-0001](docs/adr/0001-tiptap-json-content-format.md))
- **Display IDs** (e.g. `E1`, `BLOOD1`) with prefix-based routing for cross-app references
- **Dynamic entity type prefixes** — adding a new `EntityType` with prefix `"DNA"` automatically registers it in the reference resolver (no code changes needed)
- **Entity sync on ELN save** — creating/updating an ELN entry that references entities via `#` or inline references automatically keeps mentions in sync
- **Soft-delete for entity types** — schemas can be deactivated without breaking existing entities

## Next Phases

- **PRD-02:** ELN Rich Editor ✅ (TipTap integrated — polish & versioning remain)
- **PRD-03:** LIMS Entities ✅ (full CRUD, entity type schemas, emoji icons)
- **PRD-04:** References & Actions ✅ (# parser, inline reference nodes, mention sync, batch resolve)
- **PRD-05:** Permissions (RBAC, group management, folder-level access control)

See [.docs/](.docs/) for detailed PRDs and [docs/adr/](docs/adr/) for architecture decision records.
