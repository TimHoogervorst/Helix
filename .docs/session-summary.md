# OpenScience — Grilling Session Summary

> 2026-06-24 · 19 decisions · 6-phase roadmap

---

## The Vision

An open-source **ELN + LIMS** (Benchling model) for research labs. Free, extensible, AI-native. Labs install the core, add only the modules they need (MolBio, etc.). The ELN captures narrative; the LIMS tracks structured samples. They're coupled through a `#` reference system that lets entries link to samples, buffers, anything — without leaving the notebook.

**1-month demo goal:** A functional prototype. Fewer features, fully working, architecturally sound. Something labs could trial for real work.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | Django 5 + DRF | AppConfig = natural plugin system. Admin, ORM, auth, migrations built-in. |
| Database | PostgreSQL 16 | JSONB for flexible schemas. pgvector for future AI search. Full-text search. |
| Frontend | React 19 + Vite + TypeScript | Decoupled SPA. Fast interactions, rich editor support, modern contributor appeal. |
| Auth | DRF TokenAuthentication | Simple per-user tokens. Not JWT, not sessions. MCP tokens later. |
| Deploy | Docker Compose | 3 services: `db`, `backend`, `frontend`. One command to start. |

---

## Domain Model (Condensed)

```
Folder ──┬── Folder (recursive, tree)
         ├── NotebookEntry (ELN — rich text narrative)
         └── Entity (LIMS — structured sample data)

NotebookEntry ──references (#123)──▶ Entity
Entity ──"mentioned in"────────────▶ NotebookEntry
```

- **Folders** are the tree. They own data and permissions. Permissions inherit downward.
- **ELN Entries** are narrative. Rich text, versioned, human-authored.
- **Entities** are structured. Name, type, barcode, JSONB properties. Machine-readable.
- **`#` references** create the graph. `#123` in an ELN entry links to an entity. The mention appears on the entity's page. No implicit auto-actions — users explicitly record actions.
- **Actions** are user-driven. "Used 50µL of this buffer" is a recorded action on the entity, not parsed from text.

---

## Architecture (Condensed)

```
openscience/
├── backend/
│   ├── core/     # Folder, User, Group, Permission, base classes
│   ├── eln/      # NotebookEntry, EntryVersion, Mention
│   └── lims/     # Entity, EntityType, Action
├── frontend/     # React SPA (Vite)
└── plugins/      # (deferred) MolBio, etc.
```

- Plugins = **mods**, not external APIs. They inherit core classes, register hooks, core discovers them. Like Skyrim mods, not microservices.
- v1: plugins ship as `pip install` packages + config toggle. In-browser marketplace deferred.
- **Tree + graph hybrid**: folders own data and permissions (tree). Cross-folder references create a link network (graph). Permission resolution at boundaries needs more design.

---

## Permissions (4 Roles)

| Role | Can do |
|------|--------|
| Reader | View |
| Creator | + Create ELN entries, samples |
| Designer | + Modify tables, templates, schemas |
| Admin | + Manage users, groups, full access |

- Users belong to Groups
- Groups are assigned to Folders with a role
- Permissions inherit down the folder tree
- Items created in a folder ask: "which group owns this?"

---

## 6-Phase Roadmap

| Phase | What | Status |
|-------|------|--------|
| **1. ELN** | Django + React scaffold, Docker, plain-text entries, list view | → PRD-01 written |
| **2. LIMS** | Entity model, EntityType, CRUD, detail page, sample tracking | |
| **3. Linking** | `#` reference parser, Mention system, bidirectional links, Action records | |
| **4. Permissions** | Users, groups, 4 roles, folder-level assignment, API enforcement | |
| **5. Integration** | Cross-folder graph, permission-aware references, edge case resolution | |
| **6. Polish** | Testing, UI polish, plugin system design, MolBio plugin (if time) | |

---

## Key Design Choices

1. **ELN-first, LIMS-integrated.** The notebook is the primary interface. Samples are referenced from narrative, not managed in a separate system.
2. **Async collaboration only.** Save = new version. Real-time co-editing is v2.
3. **Different domain objects, tightly coupled.** ELN entries ≠ Entities. They're separate tables, separate APIs, linked through the `#` reference system.
4. **Actions are user-explicit.** No text-parsing magic. A user says "I used 50µL" — the system records it. Templates can auto-track (Buffer volume) but only when applicable.
5. **AI-native from day 1.** pgvector installed. OpenAPI documented. Schema designed for embeddings. No live AI features yet.
6. **Django over FastAPI.** Django's AppConfig, admin, ORM, and auth map directly to the plugin/mod system requirements. FastAPI would mean rebuilding those from scratch.

---

## What's Deferred (Not In Demo)

- Real-time collaboration (CRDTs/WebSocket)
- In-browser plugin marketplace
- Plugin frontend loading mechanism
- MCP endpoints / AI agent access
- MolBio plugin (stretch goal)
- Dashboards, workflows
- Production hardening

---

## Docs Index

| Doc | Contents |
|-----|----------|
| [.docs/architecture.md](.docs/architecture.md) | Full decision log, data model sketch, open questions |
| [.docs/prd-01-scaffold.md](.docs/prd-01-scaffold.md) | Phase 1 PRD: Docker scaffold, models, API endpoints, tests |
| [.docs/session-summary.md](.docs/session-summary.md) | This document — quick-reference summary |
