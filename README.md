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
- Seeds initial data (superuser + entity types + root folder)

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

Narrative lab documentation. An **Entry** is a single page of rich-text content (TipTap JSON), authored by a user, living in a folder. Entries contain `#`-style **Mentions** that link to other entries and entities, and inline **LimsTable** nodes that embed structured entity data directly in the document.

- **Rich-Text Document** — tree of blocks (paragraphs, headings, lists, tables) stored as TipTap/ProseMirror JSON
- **Tags** — user-created labels with colours, reusable across entries, managed inline
- **Entry Status** — In Progress → Finished lifecycle; cascades to entities created in the entry
- **Workspace** — TipTap editor at `/eln/:displayId`

### LIMS — Laboratory Information Management

Structured, typed lab data. An **Entity** is a trackable physical or conceptual item (a DNA sample, a reagent, a piece of equipment) with a schema-driven set of properties. Each entity belongs to an **Entity Type**, which defines its display ID prefix and column schema.

- **Entity Types** — schemas with typed columns (Text, Number, Date, Boolean, Reference), name, icon, and prefix
- **Actions** — user-recorded operations on entities ("Used", "Measured", "Aliquoted")
- **Workspace** — tabbed detail view (Activity, Insights, Storage) at `/lims/:displayId`

### Library — Filesystem-like Browsing

The **Folder** hierarchy is the primary organisational structure. The Library console (`/library`) presents a unified, mixed view of folders and entries at each level — folders navigated into, entries opened. Every entry and entity lives in exactly one folder.

### Cross-Cutting Concepts

- **Display IDs** — human-readable `<PREFIX><N>` identifiers (e.g. `E1`, `DNA42`) with gap-tolerant auto-generation and prefix-based routing
- **References** — cross-cutting resolution layer; `#BLOOD1` in an entry resolves to the entity, clickable via **ReferenceBadge**
- **Console Pattern** — three-panel progressive-disclosure layout (Master → Detail → Workspace) shared by Library and LIMS

See [CONTEXT.md](CONTEXT.md) for the full domain glossary and [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) for canonical terminology.

## Running Tests

```bash
# Backend tests (Django)
docker-compose exec backend python manage.py test

# Frontend tests (Vitest)
docker-compose exec frontend npx vitest run
```

For lightweight local runs without Docker, the backend tests work against SQLite — set `DATABASE_URL=sqlite` or point `settings.py` at a local SQLite file. This skips the PostgreSQL/pgvector dependency and is fine for most test suites. Frontend tests need only Node.

## Architecture

The platform is built on a **Mod System**. Everything — LIMS, ELN, Library, Settings, Pins — is a **Core Mod**: a self-contained directory under `core-mods/` that declares what it provides by calling `register*()` functions in its `index.ts`. **Core** is the thin immutable shell that loads mods, resolves their dependency graph (topological sort), and provides the frame they render into.

### The Mod API

Each mod calls imperative registration functions to declare its contributions:

| Function | What it registers |
|----------|------------------|
| `registerConsole()` | A three-panel browsing surface with sidebar nav item (e.g. Library at `/library`, LIMS at `/lims`) |
| `registerWorkspace()` | An item type with detail card + full work surface + standalone route (e.g. `lims.entity`, `eln.entry`) |
| `registerSettingsSection()` | A panel in the Settings shell (e.g. LIMS entity schemas) |
| `registerSlashCommand()` | A `/` command in the ELN editor's slash menu |
| `registerRoute()` | A standalone route not tied to a console (e.g. `/settings`) |
| `registerSidebarAction()` | A button or badge on a workspace's sidebar row (e.g. pin/unpin) |
| `registerService()` | A callable service for mod-to-mod communication |

Mods must not import directly from each other — all cross-mod communication goes through the registry. Shared components live in `shared/`. See [docs/mod-system.md](docs/mod-system.md) for the full architecture.

### Frontend

```
frontend/src/
├── core/                         # Immutable app shell
│   ├── shell/                    # Layout, routing, WorkspacePage
│   ├── mod-system/               # ModLoader, ModRegistry, register*() API
│   ├── console/                  # Three-panel console shell (Master/Detail/Workspace)
│   ├── references/               # Cross-cutting reference resolution
│   ├── api/                      # Core API client
│   └── types/                    # Shared types (ViewState, etc.)
│
├── core-mods/                    # Built-in mods — always loaded
│   ├── lims/                     # LIMS mod (entities, entity types, actions)
│   ├── eln/                      # ELN mod (notebook entries, TipTap editor)
│   ├── library/                  # Library mod (folder browsing)
│   ├── settings/                 # Settings shell (hosts sections from other mods)
│   └── pins/                     # Pinned workspaces sidebar
│
└── shared/                       # Cross-mod shared components
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
└── references/                   # Cross-cutting reference resolution
```

Each backend mod is a standard Django app registered in `INSTALLED_APPS`. The backend mod system is organisational — Django's built-in app system handles discovery.

**Stack:** Python 3.12 · Django 5.1 · DRF 3.15 · PostgreSQL 16 (pgvector) · Node 22 · React 19 · Vite 6 · TypeScript 5.7 · TipTap 2.x

## Further Reading

- [docs/mod-system.md](docs/mod-system.md) — full mod system architecture, registration API reference, boot sequence
- [CONTEXT.md](CONTEXT.md) — domain glossary with definitions, relationships, and key distinctions
- [UBIQUITOUS_LANGUAGE.md](UBIQUITOUS_LANGUAGE.md) — canonical terminology, deprecated term mappings, example dialogue
- [docs/adr/](docs/adr/) — architecture decision records
