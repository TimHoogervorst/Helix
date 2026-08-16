# Helix

Open-source ELN/LIMS for research labs. Flexible, extensible, AI-native.

Helix is built for labs that **tinker** — with their data, their workflows, and their tools. At its core is a **Mod API**: a `register*()` surface that treats every piece of functionality (LIMS, ELN, Library, Settings, Pins) as a self-contained mod. The same API that powers the built-in mods will serve future external mods, so you can extend the platform without touching core. Swap the editor, add a plate viewer, wire in a machine-learning pipeline — register it, and it's a first-class citizen.

## Quick Start

```bash
git clone <repo-url> openscience
cd openscience
docker-compose up
```

On first run, the backend automatically:
- Runs database migrations
- Seeds initial data (superuser + entity types + default Project folder)

## Access Points

| Service | URL | Notes |
|---------|-----|-------|
| Frontend (React) | http://localhost:5173 | SPA with hot-reload |
| Backend API | http://localhost:8000/api/ | DRF browseable API |
| Django Admin | http://localhost:8000/admin/ | Login: `admin` / `admin` |
| API Docs (Swagger) | http://localhost:8000/api/docs/ | Interactive API docs — full endpoint reference |
| API Schema (OpenAPI) | http://localhost:8000/api/schema/ | OpenAPI 3.0 spec |

Authentication is via Django sessions (login through `/admin/`). DRF `TokenAuthentication` is available but no registration endpoint exists yet — tokens are created through Django admin for now.

## Domains

Helix is organised around a handful of core domains, each owned by a mod:

### ELN — Electronic Lab Notebook

Narrative lab documentation. An **Entry** is a single page of rich-text content (TipTap JSON), authored by a user, living in a folder. Entries contain `#`-style **Mentions** that link to other entries and entities, and inline **Registry Table** blocks that embed structured entity data directly in the document.

- **Rich-Text Document** — tree of blocks (paragraphs, headings, lists, tables) stored as TipTap/ProseMirror JSON
- **Blocks** — extensible content blocks (tables, future: images, attachments, protocols) inserted via `/` slash menu; mods contribute blocks through `registerBlock()`
- **Auto-Save** — always-editable workspace with debounced saves, `ContentVersion` immutable history, and lock-based conflict prevention
- **Tags** — user-created labels with colours, reusable across entries, managed inline
- **Entry Status** — In Progress → Finished lifecycle; cascades to entities created in the entry
- **Entry Locking** — exclusive lock acquired on mount, released on unmount; read-only mode when another user holds the lock
- **Workspace** — TipTap editor at `/eln/:displayId`

### LIMS — Laboratory Information Management

Structured, typed lab data. An **Entity** is a trackable physical or conceptual item (a DNA sample, a reagent, a piece of equipment) with a schema-driven set of properties. Each entity belongs to an **Entity Type**, which defines its display ID prefix and column schema.

- **Entity Types** — schemas with typed columns (Text, Number, Date, Boolean, Reference), name, icon, and prefix
- **Actions** — user-recorded operations on entities ("Used", "Measured", "Aliquoted")
- **Workspace** — tabbed detail view (Activity, Insights, Storage) at `/lims/:displayId`

### Library — Filesystem-like Browsing

The **Folder** hierarchy is the primary organisational structure. The Library hub (`/library`) presents a unified, mixed card-based view of folders and entries at each level with three view modes (List, Grid, Compact). Mods contribute cards via `registerLibraryItem()`. Every entry and entity lives in exactly one folder.

### Cross-Cutting Concepts

- **Display IDs** — human-readable `<PREFIX><N>` identifiers (e.g. `E1`, `DNA42`) with gap-tolerant auto-generation and prefix-based routing
- **Mentions** — cross-cutting resolution layer; `#BLOOD1` in an entry resolves to the entity, clickable via **MentionBadge**; workspace-aware via the entity type registry (ADR-0006)
- **Hub Architecture** — free-form browsing pages (Home, Library, Settings) registered via `registerHub()`; each hub owns its layout, and workspaces are plain routes at `/{workspaceId}/{displayId}`

See [CONTEXT.md](CONTEXT.md) for the full domain glossary and [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) for canonical terminology.

## Running Tests

Backend tests use **pytest** — one command runs `helix_core`, `core`, and every mod's tests. Frontend tests use Vitest.

```bash
# Backend (Docker)
docker-compose exec backend pytest -n auto

# Backend (local, no Docker) — from the repo root
cd src && pytest -n auto

# Frontend
docker-compose exec frontend npx vitest run   # or: npm test
```

For lightweight local runs without Docker, the backend tests work against SQLite — set `DATABASE_URL=sqlite:///local.db` (a local SQLite file is created). This skips the PostgreSQL/pgvector dependency and is fine for most test suites; a few suites that depend on Postgres-specific behaviour should be run against Docker. See [docs/agents/testing.md](docs/agents/testing.md) for the full picture.

## Architecture

The platform is built on a **Mod System**. Everything — LIMS, ELN, Library, Settings, Pins — is a **Core Mod**: a self-contained directory under `src/mods/<id>/` containing both frontend (TypeScript) and backend (Python) code. Each mod declares what it provides by calling `register*()` functions in its `index.ts` (frontend) and `mod.py` (backend). The **Shell** (`src/shell/` and `src/server/`) is the thin immutable frame that loads mods, resolves their dependency graph (topological sort), reads their `modManifest.json` for identity, and provides the services they render into.

### The Mod API

Each mod calls imperative registration functions to declare its contributions:

| Function | What it registers | Layer |
|----------|------------------|-------|
| `registerHub()` | A free-form browsing hub with sidebar nav item (e.g. Library at `/library`, Home at `/home`) | App |
| `registerLibraryItem()` | A card component rendered in the Library hub (e.g. ELN entry cards with List/Grid/Compact views) | App |
| `registerBlock()` | A reusable, renderer-agnostic content block (e.g. Registry Table, ActivityFeed) that can render in a TipTap editor, a sidebar panel, or a tab | Slot |
| `registerButton()` | A fire-only button rendered in toolbar slots (e.g. Export, Lock) | Slot |
| `declareSlot()` | A named placeholder in a workspace that owns how bound content is rendered | Slot |
| `registerIntoSlot()` | Binds a block or button into a declared slot, with optional per-binding overrides | Slot |
| `registerSettingsSection()` | A panel in the Settings shell (e.g. entity schemas) | App |
| `registerRoute()` | A standalone route (e.g. `/settings`, workspace pages like `/eln/:displayId`) | App |
| `registerPublicRoute()` | A route outside the Layout shell — no sidebar, no app chrome (e.g. `/login`) | App |
| `registerSidebarAction()` | A button or badge on a workspace's sidebar row (e.g. pin/unpin) | App |
| `registerWorkspace()` | A workspace identity — its `id` doubles as the URL namespace for mention resolution | App |

Mods must not import directly from each other — all cross-mod communication goes through the registry. Shared frontend components live in `src/shell/src/shared/`. The backend has an equivalent `BackendModRegistry` in `helix_core` with `register_*()` methods and a service registry. See [docs/mod-system.md](docs/mod-system.md) for the full architecture.

### Slot System

Workspaces declare named **slots** (placeholders that own rendering), and mods register **blocks** (renderer-agnostic content units) and **buttons** (fire-only actions) that bind into those slots. The same block can render in a TipTap editor, a sidebar panel, or a tab — the slot's renderer owns presentation, and the block author writes one component. A **workspace-scoped event bus** provides decoupled communication: buttons emit events, blocks listen via declarative handlers, and lifecycle events are renderer-emitted. See [docs/slot-system.md](docs/slot-system.md).

### Directory Structure

```
src/
├── mods/                           # Co-located mods — each owns full stack (frontend + backend)
│   ├── eln/                        # Electronic Lab Notebook (entries, blocks, TipTap editor)
│   ├── lims/                       # LIMS (entities, entity types, actions)
│   ├── library/                    # Library hub (card-based folder browsing)
│   ├── home/                       # Home landing page
│   ├── settings/                   # Settings shell
│   ├── pins/                       # Pinned workspaces sidebar
│   ├── tags/                       # Tagging system
│   └── users/                      # User management
│
├── shell/                          # Frontend — immutable app shell (Vite/React)
│   └── src/
│       ├── core/
│       │   ├── shell/              # Layout, AppShell, Router
│       │   ├── mod-system/         # ModLoader, ModRegistry, register*() API
│       │   ├── workspace/          # WorkspaceBus, SlotRenderer
│       │   ├── mentions/           # Cross-cutting mention resolution
│       │   └── api/                # Core API client
│       └── shared/                 # Platform SDK — BaseCard, StatusBadge, hooks
│
└── server/                         # Backend — Django project
    ├── config/                     # settings.py, root urls.py
    ├── core/                       # Auth, User, Folder, BrowsableItem, mentions
    └── helix_core/                 # Platform SDK — ModLoader, BackendModRegistry, actions
```

### Backend Mod System

The backend mirrors the frontend mod system. Mods are discovered from `modManifest.json`, loaded in topological order by `ModLoader` in `helix_core`, and register contributions through `BackendModRegistry` (`register_entity_type()`, `register_urls()`, `register_service()`, etc.). Each mod provides a `mod.py` with a `register()` function. `INSTALLED_APPS` is populated programmatically — no manual maintenance. Cross-mod communication goes through `registry.call()`. External mods will use the same API via a pip-installable `helix_core` package. See [docs/backend-mod-system.md](docs/backend-mod-system.md).

### Action Logging

All mutating operations are automatically logged for CFR Part 11 audit compliance. HTTP endpoints use `ActionLoggingMixin` (a DRF viewset mixin) or `@logs_action` (a decorator for service-layer functions). Block actions are routed through the workspace event bus and batched on save. The `ActivityFeed` is a cross-mod block that renders actions from any mod. Action types use triple-dotted naming: `"{mod}.{target}.{verb_past}"`. See [docs/actions-system-design.md](docs/actions-system-design.md).

**Stack:** Python 3.12 · Django 5.1 · DRF 3.15 · PostgreSQL 16 (pgvector) · Node 22 · React 19 · Vite 6 · TypeScript 5.7 · TipTap 2.x

## Further Reading

- [docs/mod-system.md](docs/mod-system.md) — full mod system architecture, registration API reference, boot sequence
- [docs/slot-system.md](docs/slot-system.md) — slot system design, renderers, event bus, block serialization
- [docs/backend-mod-system.md](docs/backend-mod-system.md) — backend mod system, helix_core SDK, BackendModRegistry
- [docs/actions-system-design.md](docs/actions-system-design.md) — declarative action logging, AbstractBaseAction, CFR Part 11
- [CONTEXT.md](CONTEXT.md) — domain glossary with definitions, relationships, and key distinctions
- [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) — canonical terminology, deprecated term mappings, example dialogue
- [docs/adr/](docs/adr/) — architecture decision records
