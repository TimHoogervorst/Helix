# OpenScience — Architecture & Design Decisions

> Working document. Captured during grilling session, 2026-06-24.

---

## Context

Open-source ELN/LIMS for research-focused labs. Goal: flexibility + extensibility, core installable with optional add-ons (MolBio, etc.). 1-month demo target.

---

## Decisions Log

| # | Decision | Rationale | Date |
|---|----------|-----------|------|
| 1 | ELN-first, LIMS-integrated | ELN is the primary interface; LIMS capabilities are integrated, not a separate system | 2026-06-24 |
| 2 | Async collaboration in v1 (not real-time) | Versioned entries + optimistic locking solves actual lab needs. Real-time CRDT/WebSocket sync deferred to later. | 2026-06-24 |
| 3 | Plugins as Python packages + config toggle (v1) | `pip install` + `INSTALLED_APPS` toggle. In-browser marketplace deferred. Only first-party plugins (MolBio) in the demo. | 2026-06-24 |
| 4 | Plugin model: modding, not external API | Plugins inherit from core classes, register via hooks. Core discovers and surfaces them. Like a mod library, not microservices. | 2026-06-24 |
| 5 | Folder hierarchy replaces Project/Study | Folders can contain folders or notebooks. Hierarchical, filesystem-like. Permissions inherit down from folders. | 2026-06-24 |
| 6 | Simple group-based RBAC | 4 roles: Reader, Creator, Designer, Admin. Groups assigned to folders. Items inherit folder permissions. | 2026-06-24 |
| 7 | "Entity" replaces Sample Type | A generic, extensible base class. Mods/plugins expand into specific sample types (DNA, Chemical, etc.). | 2026-06-24 |
| 8 | Tree + graph hybrid | Hierarchical folders own data and permissions (tree). Cross-folder references create a discoverable link network (graph). Permission resolution at reference boundaries needs more design. | 2026-06-24 |
| 9 | ELN entries and Entities are different, but tightly coupled | Different domain objects (unstructured narrative vs structured data). ELN text references samples via `#` syntax. | 2026-06-24 |
| 10 | References = mentions, not auto-actions | `#123` creates a mention/link — it appears on the referenced item's "mentioned in" page. No implicit parsing of quantities or actions. | 2026-06-24 |
| 11 | Actions are user-explicit, not text-inferred | Each item has a page listing available actions. Users explicitly choose and record actions. Templates (e.g., Buffer) can enable auto-behavior (volume tracking), but only when the item was created from that template. | 2026-06-24 |
| 12 | Django + PostgreSQL for backend | Django's AppConfig maps naturally to the plugin/mod system. Built-in admin, ORM, auth, migrations save weeks. Postgres for JSONB, full-text search, pgvector. | 2026-06-24 |
| 13 | React SPA frontend (decoupled) | DRF API + React. Two separate codebases. Modern, fast interactions, rich editor support (TipTap/ProseMirror). | 2026-06-24 |
| 14 | Plugin frontend loading mechanism — deferred | Too abstract without code. Design the registry API, decide bundling after the core frontend exists. | 2026-06-24 |
| 15 | AI is a core design constraint, not a bolt-on | Design for AI from day 1. v1 realistic scope: pgvector schema support, semantic search, OpenAPI-documented API. MCP endpoint and AI agents are v2+. | 2026-06-24 |
| 16 | Project structure: 3 core apps | `core/` (Folder, User, Group, Permission, base Entity), `eln/` (NotebookEntry, EntryVersion, Mention), `lims/` (Entity types, Actions, structured data). Plugins deferred. | 2026-06-24 |
| 17 | Docker-based deployment | docker-compose with Django + Postgres + (later) React static serving. Plugins configured via environment/volume, not in-browser install. | 2026-06-24 |
| 18 | Simple token auth (DRF TokenAuthentication) | Per-user auth tokens. Not JWT, not sessions. MCP tokens and API tokens deferred. Just hashed/salted passwords + token for the demo. | 2026-06-24 |
| 19 | Demo goal: functional prototype (A) | Fewer features, fully working, solid architecture. Something that can be expanded, not a lazy combined system. | 2026-06-24 |
| 20 | Library as unified filesystem-like browser | Mixed table of folders + entries with breadcrumb navigation. Reuses LIMS three-step fold pattern (list → detail card → expanded editor). Single API endpoint returns mixed content sorted folders-first. See [ADR-0003](../docs/adr/0003-library-filesystem-browsing.md). | 2026-06-26 |
| 21 | Unified Browser Pattern — shared components + backend base | Extracted shared `browser/` components (Master/Detail/Workspace panels, View State machine) from duplicated LIMS and Library code. Added `BrowsableItem` abstract Django model for shared display ID generation. Canonicalized terminology: Master/Detail/Workspace panels, List/Detail/Expanded states, Item types. See [ADR-0004](../docs/adr/0004-unified-browser-pattern.md) and [PRD-10](prd-10-unified-browser-pattern.md). | 2026-06-27 |

---

## Architecture Notes

### Project Structure
```
openscience/
├── core/          # Folder, User, Group, Permission, base Entity class
├── eln/           # NotebookEntry, EntryVersion, Mention, rich text API
├── lims/          # Entity types, structured data, Actions
├── plugins/       # (deferred) e.g., molbio/
├── docker-compose.yml
├── backend/        # Django project settings, wsgi, urls
└── frontend/       # React SPA (Vite)
```

### Data Model (draft)
```
Folder (core)
  ├── parent: FK to self (nullable, for nesting)
  ├── name, path
  └── group_permissions: M2M through GroupFolderPermission

NotebookEntry (eln)
  ├── folder: FK to Folder
  ├── title, content (JSON/rich text), author: FK to User
  ├── created_at, updated_at
  └── versions: reverse FK to EntryVersion

EntryVersion (eln)
  ├── entry: FK to NotebookEntry
  ├── content, version_number, created_at, created_by

Mention (eln)
  ├── source_entry: FK to NotebookEntry
  ├── target_type: ContentType (eln.NotebookEntry or lims.Entity)
  ├── target_id: int
  └── context: text snippet around the reference

Entity (lims)
  ├── name, entity_type: FK to EntityType
  ├── barcode, properties: JSONB
  ├── folder: FK to Folder (optional, for tree placement)
  └── created_by: FK to User

EntityType (lims)
  ├── name (e.g., "DNA", "Chemical", "Buffer")
  └── schema: JSON (optional, for template-driven forms)

Action (lims)
  ├── entity: FK to Entity
  ├── action_type (e.g., "Used", "Created", "Measured")
  ├── performed_by: FK to User
  ├── source_entry: FK to NotebookEntry (optional, the ELN entry where this action was recorded)
  └── data: JSONB (e.g., {"volume_ul": 50})

User (core)
  ├── username, password (hashed/salted), email
  ├── groups: M2M to Group
  └── auth_token

Group (core)

GroupFolderPermission (core)
  ├── group: FK, folder: FK
  └── role: choice(Reader, Creator, Designer, Admin)
```

## Milestones

### Phase 1: ELN
- Django + React scaffold, Docker running
- Rich text entry: create, edit, save
- Simple all-entries list view
- Entry version history (save = new version)

### Phase 2: LIMS
- Entity model + EntityType
- Entity CRUD, list, filter by type
- Entity detail page
- All sample-related issues tackled

### Phase 3: Linking (# references + Actions)
- # reference parser on ELN save: creates Mention records
- Bidirectional linking: entry shows linked entities, entity shows "mentioned in"
- Action system: user-explicit actions on entities (Used, Created, Measured, Noted)

### Phase 4: Users, Groups, Permissions
- User registration, login, token auth
- Groups, 4 roles (Reader, Creator, Designer, Admin)
- Folder-level group-role assignment
- Permission enforcement on all endpoints

### Phase 5: Integration & Graph
- Cross-folder reference resolution with permission awareness
- Graph navigation (follow links between entries and entities)
- Tree + graph hybrid: resolve all permission edge cases

### Phase 6: Polish & Extensions
- Integration testing, bug fixes
- UI polish
- Plugin system design + MolBio plugin (if time allows)

---

## Open Questions

1. Tree + graph permission resolution — exact rules for cross-boundary references
2. Rich text editor selection — TipTap vs ProseMirror vs Slate
3. Entity type schema format — how to define structured fields for each type
4. Plugin API surface — what hooks/registries plugins can use (deferred)

---

## Open Questions

(To be populated.)
