# ADR-0008: Single Source Registration — Backend as the Authoritative Source

> Date: 2026-07-24
> Status: Accepted
> Companion specs: [Spec 1 — Single-Source Registration](../../.claude/spec-1-single-source-registration.md), [Spec 2 — Refined Action Model](../../.claude/spec-2-refined-action-model.md)

---

## Context

Every mod currently duplicates static configuration across frontend and backend. Schema types are declared in both `registerWorkspace().schemaType` (frontend `index.ts`) and `register_schema_type()` (backend `apps.py`) — and the values already drift (LIMS prefix: `"E"` in frontend vs `"BLOOD"` in backend). Workspace identity, entity type prefixes, and action catalogs have no single source of truth.

The `modManifest.json` already exists as a shared identity document, but carries only `id`, `displayName`, `version`, and `dependsOn`. Frontend-only registration APIs (`registerWorkspace`, `registerLibraryItem`, `registerSidebarAction`) create interfaces the backend cannot participate in. Mod authors have no clear rule for which file owns which concern — the documented contract says `mod.py` is the backend entry point, yet every mod has an empty `mod.py` and uses `apps.py` instead.

Three approaches were considered:

| Approach | Single source of truth | Mod author clarity | Backend participation |
|----------|----------------------|-------------------|----------------------|
| **Status quo — dual registration** | No (frontend + backend per concern) | No (no rule for what goes where) | Partial (apps.py, not mod.py) |
| **Manifest owns everything** | Yes (modManifest.json) | Yes | No (JSON is runtime-agnostic, can't declare backend logic) |
| **Backend owns data, frontend owns UI** (chosen) | Yes (one owner per concern) | Yes (clear rule by concern type) | Full (backend is canonical for data) |

---

## Decision

**The backend is the authoritative source for anything that exists as system data. The frontend discovers what exists by calling API endpoints at boot. The frontend only registers in-process UI behavior.**

### Registration ownership

Every concern has exactly one owner, determined by a single rule: **if it has a database row, a URL, or is queryable via API, the backend owns it.**

| Concern | Owner | Registration file |
|---|---|---|
| Mod identity + dependencies | Shared | `modManifest.json` (read by both loaders) |
| Schema types + workspace identity | **Backend** | `mod.py` → `register_schema_type()` |
| Custom actions catalog | **Backend** | `mod.py` → `register_custom_action()` |
| Action models (CRUD logging) | **Backend** | `mod.py` → `register_action_model()` |
| URL patterns | **Backend** | `mod.py` → `register_urls()` |
| Services, signals, settings | **Backend** | `mod.py` |
| Hubs | Frontend | `index.ts` → `registerHub()` |
| Routes (workspace pages, etc.) | Frontend | `index.ts` → `registerRoute()` |
| Blocks (components, serialize, handlers) | Frontend | `index.ts` → `registerBlock()` |
| Buttons | Frontend | `index.ts` → `registerButton()` |
| Slots + bindings | Frontend | `index.ts` → `declareSlot()` + `registerIntoSlot()` |
| Settings sections | Frontend | `index.ts` → `registerSettingsSection()` |

### Boot sequence

```
Loading screen ("Loading Helix…")
  → Frontend globs modManifest.json → identity + dependency graph
  → Frontend globs index.ts → collects register() functions (no more meta export)
  → GET /api/mod-registry/ → backend-owned data: workspace IDs, schema types, action catalogs
  → Topological sort by dependsOn
  → Call each mod's register() in order
  → App renders
```

### Eliminated APIs

| Removed | Replaced by |
|---|---|
| `registerWorkspace()` (frontend) | Backend `register_schema_type()` + boot-time discovery via `GET /api/mod-registry/` |
| `registerLibraryItem()` | Library hub is generic, renders entities from LIMS schema column definitions |
| `registerSidebarAction()` | Tabs mod (née Pins) listens to workspace events, owns pinning |
| `meta` export from `index.ts` | `modManifest.json` is the sole source of identity |

### Per-mod file contract

```
src/mods/<id>/
├── modManifest.json    # id, displayName, version, dependsOn — identity only
├── index.ts            # UI only: registerHub, registerRoute, registerBlock,
│                       #   declareSlot, registerIntoSlot, registerSettingsSection
├── mod.py              # Data + wiring: register_schema_type, register_custom_action,
│                       #   register_action_model, register_urls, register_service,
│                       #   register_signal, register_setting
├── models.py / views.py / serializers.py / urls.py / ...
└── components/ / workspace/ / hub/ / ...
```

### Discovery endpoint

`GET /api/mod-registry/` returns per-mod:
- `id`, `displayName`
- `workspaceId` (for mods that register a schema type)
- `schemaTypes`: array of `{ id, displayName, prefix, columns }`
- `actions`: array of `{ id, label, core }` where core is `"created" | "edited" | "deleted"`

---

## Rationale

### Why the backend as the authority

If something has a database row (schema types, entity types), the backend is already the system of record — making it also the registration authority eliminates duplication rather than creating a new mechanism. The alternative (making the manifest the authority) would require the manifest to describe backend concepts (prefix validation, column schemas, action routing) that JSON cannot enforce. Backend ownership means validation happens at registration time, not at a later "check" step.

### Why frontend discovery instead of build-time codegen

Code generation from backend declarations into TypeScript types creates a build dependency between Django and Vite, adds a codegen step to every frontend build, and introduces version skew (generated types can be stale). A boot-time API call (`GET /api/mod-registry/`) is simpler: the backend is the live authority, the frontend is always current, and the contract is testable with a shared JSON schema.

### Why workspace identity moves to the backend

Workspace ID is used for URL namespaces, mention resolution, and action routing — all backend concerns. The frontend's only use of workspace registration was `resolveCurrentWorkspace()`, which reads workspace IDs from the URL pathname. Moving workspace identity to the backend and exposing it via `GET /api/mod-registry/` gives the frontend the same information without the frontend declaring it.

### Why `registerLibraryItem()` is eliminated

The Library hub is a browsing surface over the folder hierarchy. Entity types in the library are LIMS entities — their schema (columns, types, display name) is already registered in the backend. Registering a separate card component per entity type duplicates that schema knowledge on the frontend. Generic card rendering from column definitions means new entity types appear in the Library with zero frontend changes.

### Why `registerSidebarAction()` is eliminated

The only consumer was the Pins mod, which injected a "pin/unpin" button into workspace sidebar rows. This is better modeled as a listener: the Tabs mod listens to workspace navigation events and renders pinned tabs accordingly. No registration API needed — it's purely reactive UI behavior.

### Why `meta` export is removed

`ModLoader` already prefers `modManifest.json` when present — which is always. The `meta` export from `index.ts` is redundant dead weight. Removing it simplifies the `index.ts` contract to a single export: the `register` function.

---

## Consequences

### Current benefits

- **Zero duplication.** Schema types, workspace identity, and action catalogs are declared exactly once, in `mod.py`. The frontend discovers them from the backend.
- **Clear mod author contract.** Three files, each with a distinct concern: `modManifest.json` (identity), `mod.py` (data + wiring), `index.ts` (UI components). No ambiguity about what goes where.
- **Drift elimination.** The LIMS prefix drift (`"E"` vs `"BLOOD"`) is structurally impossible — there is only one declaration.
- **Generic Library hub.** New entity types appear in the Library automatically from their column definitions. No per-mod card component registration.
- **Testable contract.** The `GET /api/mod-registry/` response is a shared JSON schema. Backend tests verify the endpoint produces it; frontend tests use it as mock input. Neither side needs the other running to verify correctness.
- **Eliminated APIs.** Four registration APIs removed (`registerWorkspace`, `registerLibraryItem`, `registerSidebarAction`, `meta` export), reducing the API surface mod authors must learn.

### Constraints

- **Backend must boot before frontend.** The `GET /api/mod-registry/` endpoint must be available before the frontend can complete its boot sequence. This is already the case in the Docker startup flow.
- **Loading screen required.** The frontend boot sequence now includes an async API call, so a loading screen is needed. This was already a user-facing desire ("Loading Helix…" before the app renders).
- **Schema type registration is synchronous at boot.** `register_schema_type()` uses `update_or_create` — it touches the database at import time. This is the existing behavior and is acceptable because mod boot happens once at startup.
- **mod.py becomes the canonical backend entry point.** Every mod that has backend code MUST use `mod.py` instead of `apps.py` for registration. The `apps.py` `ready()` hook is no longer the registration surface.

### Future considerations

- **Hot-reloading after boot.** The registry is loaded once at startup. If dynamic mod loading becomes a requirement, the `GET /api/mod-registry/` endpoint can be re-queried and the frontend registry patched — but the current design does not support this.
- **External mod schema types.** External mods register schema types through the same `register_schema_type()` API. The frontend discovers them through the same `GET /api/mod-registry/` endpoint. No new mechanism needed.
- **Schema type evolution.** When a schema type's columns change, the frontend picks up the new definition on next boot. Migration of existing entity data to new schemas is a separate concern.
- **Per-mod custom discovery fields.** The `GET /api/mod-registry/` payload can grow per-mod sections (e.g., custom settings schemas, permission models) without changing the discovery contract.

---

## Amendment: Schema type capability tags

> Origin: [Spec: Table Kit — typed cells, Formula Columns, and Result Tables #492](https://github.com/TimHoogervorst/Helix/issues/492)

### Context

The Table Kit needs to distinguish schema types that are applicable to registration tables from schema types that represent result tables. Workspace identity alone does not express that capability, and duplicating the classification in frontend configuration would violate the backend-owned registration rule.

### Decision

`SchemaType` gains a JSON `tags` list declared by the owning mod through `register_schema_type()`, for example:

```python
register_schema_type(..., tags=["RegistrationTable", "ResultTable"])
```

Tags are backend-owned capability markers and are not settings-editable. The canonical tags are `RegistrationTable` and `ResultTable`. Existing LIMS entity types are seeded with `RegistrationTable`; ELN Entry receives no table tag. Tags may be combined when a schema type supports multiple table capabilities. The discovery payload exposes the hydrated tags, and frontend pickers filter schemas client-side using those values.

### Consequences

- Mod declarations remain the single source of truth for schema capabilities, extending rather than replacing backend-owned registration.
- Registry Table pickers can exclude untagged types such as ELN Entry, while Result Table pickers can include only `ResultTable` types.
- Settings can separate Entity Schemas from Result Schemas without introducing a second frontend registration mechanism.
- Changing a capability remains a backend/mod change and is reflected after registry discovery; users cannot edit the tags as settings.
