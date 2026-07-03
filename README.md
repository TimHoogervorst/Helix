# Helix

Open-source ELN/LIMS for research labs. Flexible, extensible, AI-native.

> **Status:** Phase 1 scaffold — Dockerized Django + React + PostgreSQL foundation.
> ELN entries with TipTap rich-text editor, LIMS entities with typed schemas, and inline
> `#` reference system all functional. The frontend has been restructured around a **Mod System**
> (see [docs/mod-system.md](docs/mod-system.md)) — everything is a self-contained mod under
> `core-mods/`. Some legacy files remain in transitional locations; see
> [docs/migration-status.md](docs/migration-status.md).

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

The platform is organized around a **Mod System**. Everything — LIMS, ELN, Library, Settings, Pins — is a **Core Mod**: a self-contained directory that declares what it provides via `register*()` functions. **Core** is the thin immutable shell that loads mods and provides the frame they render into.

See [docs/mod-system.md](docs/mod-system.md) for the full architecture, [CONTEXT.md](CONTEXT.md) for the domain glossary, and [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) for canonical terminology.

### Frontend

```
frontend/src/
├── core/                         # Immutable app shell
│   ├── shell/                    # Layout, routing, WorkspacePage
│   ├── mod-system/               # ModLoader, ModRegistry, register*() API
│   ├── console/                  # Three-panel console shell components
│   ├── references/               # Cross-cutting reference resolution
│   ├── api/                      # Core API client
│   └── types/                    # Shared types (ViewState, etc.)
│
├── core-mods/                    # Built-in mods — always loaded
│   ├── lims/                     # LIMS mod (entities, entity types, actions)
│   │   ├── console/              #   LimsConsole, LimsDetailCard
│   │   ├── workspace/            #   EntityWorkspace, standalone page
│   │   ├── settings/             #   TypeMasterPanel, TypeDetailPanel, ColumnEditor
│   │   └── components/           #   EntityDetailFields
│   ├── eln/                      # ELN mod (notebook entries)
│   │   ├── console/              #   ElnDetailCard
│   │   └── index.ts / types.ts   #   Wiring only — editor + workspace still in legacy locations
│   ├── library/                  # Library mod (folder browsing)
│   │   ├── console/              #   LibraryConsole, LibraryTable, LibraryNewDropdown
│   │   └── api.ts                #   Library API calls
│   ├── settings/                 # Settings shell (hosts sections from other mods)
│   │   └── pages/                #   SettingsPage
│   └── pins/                     # Pinned workspaces
│       ├── components/           #   PinnedWorkspacesSidebar
│       └── hooks/                #   usePinnedWorkspaces
│
├── shared/                       # Cross-mod shared components
│   ├── ReferenceBadge.tsx
│   ├── ContentPreview.tsx
│   └── useContentPreview.ts
│
├── extensions/                   # ⚠️ Legacy — TipTap extensions (migrating to core-mods/eln/editor/)
├── components/                   # ⚠️ Legacy — ElnEditor, ReferenceNode (migrating to core-mods/eln/)
├── pages/                        # ⚠️ Legacy — ElnDetail (migrating to core-mods/eln/workspace/)
├── hooks/                        # ⚠️ Legacy — useEntryEditor (migrating to core-mods/eln/hooks/)
├── api/                          # ⚠️ Legacy — old API clients (migrated to core/api/ and mod api.ts)
│
├── App.tsx                       # Thin: <ModLoader> → <LegacyApp>
├── LegacyApp.tsx                 # Transitional router (routes from registry + legacy hardcoded)
└── main.tsx                      # Entry: BrowserRouter + StrictMode
```

### Backend

```
backend/
├── config/                       # Django project settings, root URL conf
├── core/                         # Auth, base models (User, BrowsableItem), Folder
├── core_mods/                    # Built-in mods (mirrors frontend core-mods/)
│   ├── lims/                     # Entity, EntityType, Action
│   ├── eln/                      # NotebookEntry, Tag, Mention
│   ├── library/                  # LibraryContentsView (mixed folder+entry listing)
│   └── pins/                     # PinnedWorkspace
├── references/                   # Cross-cutting reference resolution
└── conftest.py                   # Shared test fixtures
```

Each backend mod is a standard Django app registered in `INSTALLED_APPS`. The mod system on the backend is organizational — Django's built-in app system handles discovery.

**Stack:** Python 3.12 · Django 5.1 · DRF 3.15 · PostgreSQL 16 (pgvector) · Node 22 · React 19 · Vite 6 · TypeScript 5.7 · TipTap 2.x

## Key Design Decisions

- **Mod System** for organizing all functionality — the same `register*()` API will serve future external mods. See [docs/mod-system.md](docs/mod-system.md).
- **TipTap JSON** for ELN entry content — zero-translation storage, queryable via PostgreSQL JSONB, safe rendering ([ADR-0001](docs/adr/0001-tiptap-json-content-format.md))
- **Display IDs** (e.g. `E1`, `BLOOD1`) with prefix-based routing for cross-app references ([ADR-0002](docs/adr/0002-display-id-prefix-routing.md))
- **Library as filesystem-like console** — unified browsing over Folders and Entries ([ADR-0003](docs/adr/0003-library-filesystem-browsing.md))
- **Unified Console Pattern** — Master/Detail/Workspace three-panel layout shared by all consoles ([ADR-0004](docs/adr/0004-unified-console-pattern.md))
- **Entry Status Cascade** — entity status cascades from source entry status changes ([ADR-0005](docs/adr/0005-entry-status-cascade.md))
- **Dynamic entity type prefixes** — adding a new `EntityType` with prefix `"DNA"` automatically registers it in the reference resolver
- **Entity sync on ELN save** — creating/updating an ELN entry that references entities keeps mentions in sync
- **Soft-delete for entity types** — schemas can be deactivated without breaking existing entities

## Next Phases

- **PRD-02:** ELN Rich Editor ✅ (TipTap integrated — editor migration to core-mods/eln in progress)
- **PRD-03:** LIMS Entities ✅ (full CRUD, entity type schemas, emoji icons)
- **PRD-04:** References & Actions ✅ (# parser, inline reference nodes, mention sync, batch resolve)
- **PRD-05:** Permissions (RBAC, group management, folder-level access control)
- **EPIC:** Mod System Architecture ✅ (core infrastructure, LIMS/library/settings/pins migrated; ELN partial)

See [docs/](docs/) for architecture documentation and [docs/adr/](docs/adr/) for decision records.
