# Mod System Architecture

> Date: 2026-07-16 (updated for monorepo restructure, slot system, backend mod system)
> Status: Accepted
> Companion to: [Slot System & Event Bus](slot-system.md), [Actions System Design](actions-system-design.md), [Backend Mod System Design](backend-mod-system.md)
>
> This document captures the full architecture for the Helix Mod System. It reflects the monorepo restructure (ADR-0007), the slot system and workspace event bus (#210), the backend mod system (#208), and the declarative action logging system (#209).

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Directory Structure](#directory-structure)
3. [Registration API](#registration-api)
4. [Boot Sequence](#boot-sequence)
5. [Hub Architecture](#hub-architecture)
6. [Sidebar Navigation](#sidebar-navigation)
7. [Workspace Pages](#workspace-pages)
8. [Slot System](#slot-system)
9. [Settings System](#settings-system)
10. [Mod-to-Mod Communication](#mod-to-mod-communication)
11. [Backend Mod System](#backend-mod-system)
12. [Internal Mod Directory Contract](#internal-mod-directory-contract)
13. [Future: External Mod API](#future-external-mod-api)

---

## Core Concepts

| Term | Definition |
|------|-----------|
| **Mod** | A self-contained unit of functionality — owns its own hub, workspace pages, library items, blocks, buttons, settings, routes, and sidebar actions. Both built-in functionality (LIMS, ELN, Library) and future external plugins are mods. Each mod lives in a single co-located directory under `src/mods/<id>/` containing both frontend (TypeScript) and backend (Python) code. |
| **Mod Manifest** | The identity document (`modManifest.json`) at the root of every mod folder. Declares `id`, `displayName`, `version`, `dependsOn` (with optional version constraints), `coreVersion` (minimum platform version), and `description`. The **single source of truth** for mod identity — both frontend and backend loaders read this file. Does NOT describe capabilities (routes, blocks, settings) — those are discovered from `register*()` calls at boot. |
| **Core / Shell** | The immutable app shell — Layout, routing, mod loader, mention resolution, API client. Lives at `src/shell/` (frontend) and `src/server/` (backend). The shell provides the frame; mods provide the content. |
| **Core Mod** | A mod that ships with the repository under `src/mods/`. Always loaded. First-party. Uses the same registration API that external mods will use. |
| **Mod API** | The registration surface (`register*()` functions) that every mod calls to declare what it provides. Internal mods and future external mods use the same API. |
| **Mod Registry** | Central data structure populated by all `register*()` calls during boot. Read by Core to build routes, sidebar nav, settings panels, slash command menus, and slot content. |
| **Hub** | A free-form browsing page that links to Workspaces. Each hub is registered by a mod and appears in the sidebar nav. Hubs are minimal — they own no defaults, no `accepts` filter, and no workspace type registry. Each hub manages its own item registrations internally (e.g., `registerLibraryItem()` for the Library hub). |
| **Workspace** | A full work surface for a specific item, accessed via a dedicated URL (e.g., `/eln/E-1234`). Workspaces are registered via `registerWorkspace()` for identity and `registerRoute()` for the URL. The workspace `id` doubles as the URL namespace (`/{workspaceId}/{displayId}`). |
| **Block** | A reusable, renderer-agnostic content unit registered via `registerBlock()`. Can render in a TipTap editor, a sidebar panel, or a tab without the block author writing any rendering-mode-specific code. Blocks declare `listensTo` + `onEvent` for event bus reactions, and optional `messages` for action logging. |
| **Button** | A simple fire-only action registered via `registerButton()`. Buttons emit events on the workspace bus but never listen. If a UI element needs to both listen and fire, use a block. |
| **Slot** | A named placeholder in a workspace that owns how things are rendered. Declared via `declareSlot()`. The slot's `renderer` determines presentation; blocks/buttons bind into slots via `registerIntoSlot()`. |
| **Library Item** | A card rendered in the Library hub. Mods register a `listCard` component via `registerLibraryItem()`. The library core wraps it in a `BaseLibraryCard` that handles view-mode CSS, selection state, and field visibility toggles. |
| **Mention** | A cross-reference from one piece of content to another via a display ID (e.g., `#DNA34`). Previously called "reference" — the entire stack (backend app, frontend module, components, API routes) has been renamed from `references` to `mentions`. |

---

## Directory Structure

```
src/
├── mods/                               # Co-located mods — each owns full stack
│   ├── eln/                            # Electronic Lab Notebook
│   │   ├── modManifest.json            # Identity source of truth (frontend + backend)
│   │   ├── package.json                # @helix/eln
│   │   ├── index.ts                    # Frontend register*() entry point
│   │   ├── types.ts                    # TypeScript interfaces
│   │   ├── api.ts                      # Backend API calls
│   │   ├── mod.py                      # Backend register() entry point
│   │   ├── models.py                   # Django models (NotebookEntry, Tag, etc.)
│   │   ├── views.py                    # DRF viewsets
│   │   ├── serializers.py
│   │   ├── urls.py                     # Mod URL patterns
│   │   ├── admin.py
│   │   ├── blocks/                     # Content blocks (LimsTable, etc.)
│   │   ├── editor/                     # TipTap editor + extensions + hooks
│   │   ├── workspace/                  # Entry workspace page (/eln/:displayId)
│   │   ├── library/                    # Card component for Library hub
│   │   ├── settings/                   # Tag settings panels
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── migrations/                 # Django migrations
│   │   └── tests/                      # Backend tests
│   │
│   ├── lims/                           # LIMS — entities, entity types, actions
│   │   ├── modManifest.json
│   │   ├── package.json                # @helix/lims
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── mod.py
│   │   ├── models.py                   # EntityType, Entity, Action
│   │   ├── views.py
│   │   ├── serializers.py
│   │   ├── urls.py
│   │   ├── components/                 # EntityDetailFields
│   │   ├── workspace/                  # Entity workspace page (/lims/:displayId)
│   │   ├── settings/                   # SchemaSettings, ColumnEditor, DangerZone
│   │   ├── migrations/
│   │   └── tests/
│   │
│   ├── library/                        # Library hub — folder browsing
│   │   ├── modManifest.json
│   │   ├── package.json                # @helix/library
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── api.ts
│   │   ├── mod.py
│   │   ├── views.py                    # LibraryContentsView
│   │   ├── serializers.py
│   │   ├── urls.py
│   │   ├── hub/                        # Hub page at /library
│   │   ├── components/                 # BaseLibraryCard, views, dropdown, toggle
│   │   ├── hooks/
│   │   ├── settings/
│   │   ├── migrations/
│   │   └── tests/
│   │
│   ├── home/                           # Home landing page
│   │   ├── modManifest.json
│   │   ├── package.json                # @helix/home
│   │   ├── index.ts
│   │   └── HomePage.tsx
│   │
│   ├── settings/                       # Settings shell
│   │   ├── modManifest.json
│   │   ├── package.json                # @helix/settings
│   │   ├── index.ts
│   │   └── pages/                      # SettingsPage.tsx
│   │
│   ├── pins/                           # Pinned workspaces sidebar
│   │   ├── modManifest.json
│   │   ├── package.json                # @helix/pins
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── api.ts
│   │   ├── mod.py
│   │   ├── models.py                   # PinnedWorkspace
│   │   ├── views.py
│   │   ├── serializers.py
│   │   ├── urls.py
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── migrations/
│   │   └── tests/
│   │
│   ├── tags/                           # Tagging system
│   │   ├── modManifest.json
│   │   ├── package.json                # @helix/tags
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── api.ts
│   │   ├── constants.ts
│   │   ├── mod.py
│   │   ├── models.py                   # Tag
│   │   ├── views.py
│   │   ├── serializers.py
│   │   ├── urls.py
│   │   ├── ui/                         # TagPill shared component
│   │   ├── hooks/
│   │   ├── settings/
│   │   ├── migrations/
│   │   └── tests/
│   │
│   └── users/                          # User management
│       ├── modManifest.json
│       ├── package.json                # @helix/users
│       ├── index.ts
│       ├── types.ts
│       ├── api.ts
│       ├── mod.py
│       ├── models.py
│       ├── views.py
│       ├── serializers.py
│       ├── urls.py
│       ├── pages/
│       ├── settings/
│       ├── migrations/
│       └── tests/
│
├── shell/                              # Frontend — immutable app shell (Vite/React)
│   └── src/
│       ├── core/
│       │   ├── shell/                  # Layout, AppShell, Router
│       │   ├── mod-system/             # ModLoader, ModRegistry, register*() functions
│       │   ├── workspace/              # WorkspaceBus, SlotRenderer
│       │   ├── mentions/               # Cross-cutting mention resolution
│       │   └── api/                    # Core API client
│       └── shared/                     # Platform SDK — BaseCard, StatusBadge, etc.
│
└── server/                             # Backend — Django project
    ├── config/                         # settings.py, wsgi.py, root urls.py
    ├── core/                           # Auth, User, Folder, BrowsableItem, mentions
    ├── helix_core/                     # Platform SDK — mod loader, registry, actions
    └── manage.py
```

---

## Registration API

Every mod declares what it provides by calling `register*()` functions in its `index.ts` (frontend) and `mod.py` (backend). The Mod Registry collects all registrations. This is the same API that future external mods will use.

### Full API Reference

| Function | What it registers | Layer |
|----------|------------------|-------|
| `registerHub()` | A free-form browsing hub with sidebar nav item (e.g. Library at `/library`, Home at `/home`) | App |
| `registerLibraryItem()` | A card component rendered in the Library hub (e.g. ELN entry cards with List/Grid/Compact views) | App |
| `registerBlock()` | A reusable, renderer-agnostic content block that can render in TipTap, a sidebar panel, or a tab | Slot |
| `registerButton()` | A fire-only button rendered in toolbar slots | Slot |
| `declareSlot()` | A named placeholder in a workspace that owns how bound content is rendered | Slot |
| `registerIntoSlot()` | Binds a block or button into a declared slot, with optional per-binding overrides | Slot |
| `registerSettingsSection()` | A panel in the Settings shell (e.g. entity schemas) | App |
| `registerRoute()` | A standalone route (e.g. `/settings`, workspace pages like `/eln/:displayId`) | App |
| `registerPublicRoute()` | A route outside the Layout shell — no sidebar, no app chrome (e.g. `/login`) | App |
| `registerSidebarAction()` | A button or badge on a workspace's sidebar row (e.g. pin/unpin) | App |
| `registerWorkspace()` | A workspace identity — `id` doubles as the URL namespace for mention resolution | App |

### registerHub()

Registers a free-form browsing hub. Automatically adds a sidebar nav item. Hubs are minimal — no defaults, no `accepts` filter, no workspace type registry.

```ts
registerHub({
  id: string;                        // e.g. 'library'
  label: string;                     // e.g. 'Library' — shown in sidebar
  icon: React.ComponentType;         // Lucide icon
  route: string;                     // e.g. '/library'
  component: React.LazyComponent;    // The hub page component
  order: number;                     // Sidebar sort order
}): void;
```

**Current hubs:**

| Hub | ID | Route | Description |
|-----|----|-------|-------------|
| Home | `home` | `/home` | Landing page, order: 0 |
| Library | `library` | `/library` | Card-based filesystem browser (List/Grid/Compact) |
| Settings | `settings` | `/settings` | Application settings shell |

### registerLibraryItem()

Registers a card component for rendering in the Library hub. Mods contribute one `listCard` component; the library core wraps it in `BaseLibraryCard`.

```ts
registerLibraryItem({
  id: string;                        // e.g. 'eln.entry'
  icon: React.ComponentType;
  listCard: React.ComponentType;     // Card component rendered inside BaseLibraryCard
  property_fields?: PropertyField[]; // Optional inline metadata fields
}): void;
```

**Current library items:**

| ID | Mod | Card Component |
|----|-----|---------------|
| `eln.entry` | ELN | `ElnLibraryCard` |

### registerBlock()

Registers a reusable, renderer-agnostic content block. The same block can render in a TipTap editor, a sidebar panel, or a tab — the slot's renderer owns presentation.

```ts
registerBlock({
  id: string;                                          // Globally unique, e.g. "eln.table"
  label: string;                                       // Human-readable, e.g. "Table"
  icon: ComponentType<any>;                             // Lucide icon
  component: ComponentType<BlockComponentProps>;        // React component
  listensTo: string[];                                  // Events this block reacts to
  onEvent: Record<string, (instance, payload) => unknown | void>;
  messages?: { created?: string; edited?: string; deleted?: string };
  getDisplayName?: (attrs: Record<string, unknown>) => string;
  tags?: string[];                                      // For slash menu filtering
  serialize: (state: Record<string, unknown>) => string;
  deserialize: (json: string) => Record<string, unknown>;
  defaultState: Record<string, unknown>;
}): void;
```

**How blocks are consumed:**

1. **TipTapRenderer** slot → embedded as NodeViews in the editor. Slash menu auto-derives from registered blocks.
2. **PanelRenderer** slot → rendered as standalone panels. Receives the workspace bus.
3. **TabRenderer** slot → rendered as tabs. Uses declarative `onEvent` handlers.

See [slot-system.md](slot-system.md) for the full renderer model.

### declareSlot()

Declares a named placeholder in a workspace. The slot's `renderer` determines how bound content is presented.

```ts
declareSlot({
  id: string;                        // "{workspaceId}.{region}.{name}", e.g. "eln.editor"
  accepts: "block" | "button";      // What can be bound into this slot
  renderer: ComponentType<any>;      // The rendering strategy component
  layout: "horizontal" | "vertical";
  order: number;
  defaults: Record<string, unknown>; // Default overrides for all bindings
}): void;
```

### registerButton()

Registers a simple fire-only button rendered in toolbar slots.

```ts
registerButton({
  id: string;                        // Globally unique, e.g. "eln.export"
  label: string;                     // Human-readable, e.g. "Export"
  icon?: ComponentType<any>;
  onClick: (args: { bus: WorkspaceBus; context: SlotContext }) => void;
}): void;
```

### registerIntoSlot()

Binds a block or button into a declared slot, with optional per-binding overrides.

```ts
registerIntoSlot(
  slotId: string,                    // The slot to bind into, e.g. "eln.editor"
  targetId: string,                  // The block or button ID, e.g. "eln.table"
  overrides?: Record<string, unknown>, // Per-binding overrides
  order?: number,                    // Position within the slot
): void;
```

### registerRoute()

Registers a standalone route not tied to a hub (e.g., `/settings`, workspace pages like `/lims/:displayId`).

```ts
registerRoute({
  id: string;
  modId: string;
  path: string;                      // e.g. '/settings'
  component: React.LazyComponent;
}): void;
```

### registerPublicRoute()

Registers a route that renders **outside** the Layout shell (no sidebar, no app chrome). Use for login, register, and other full-page routes.

```ts
registerPublicRoute({
  id: string;
  modId: string;
  path: string;                      // e.g. '/login'
  component: React.LazyComponent;
}): void;
```

### registerSettingsSection()

Registers a panel in the Settings shell.

```ts
registerSettingsSection({
  id: string;                        // e.g. 'lims.schemas'
  modId: string;
  label: string;                     // e.g. 'Entity Schemas'
  icon?: React.ComponentType;
  component: React.LazyComponent;
  order: number;
}): void;
```

### registerSidebarAction()

Registers a button or badge on a workspace's sidebar row (e.g., pin/unpin).

```ts
registerSidebarAction({
  id: string;                        // e.g. 'pins.pin'
  workspaceId: string;               // Which workspace this action targets
  component: React.ComponentType;
  position: 'inline' | 'hover';
}): void;
```

### registerWorkspace()

Registers a workspace identity. The `id` doubles as the URL namespace for mention resolution and navigation.

```ts
registerWorkspace({
  id: string;                        // URL namespace, e.g. 'eln', 'lims'
  displayName: string;               // Human-readable, e.g. 'Electronic Lab Notebook'
  icon?: React.ComponentType;
}): void;
```

Workspace pages are registered separately via `registerRoute()` with a path like `/{workspaceId}/:displayId`.

---

## Boot Sequence

```
main.tsx
  → BrowserRouter
    → App.tsx
      → <ModLoader>
          1. Read modManifest.json from each src/mods/*/ directory
             → Parse id, displayName, version, dependsOn, coreVersion
          2. Topological sort mods by dependsOn graph
          3. Validate: no circular deps, no missing deps, no duplicate IDs,
             coreVersion constraints satisfied
          4. Glob all src/mods/*/index.ts files
          5. Call each mod's register function in sorted order
             → Each index.ts calls register*() → populates ModRegistry
          6. Validate registry: slot bindings resolve, cross-references valid
          7. Render <AppShell>
             → Layout reads registry for sidebar nav (getHubs())
             → Router reads registry for route tree
             → Hub pages read registry for items/blocks
             → Settings shell reads registry for settings panels
             → Workspaces resolve slots via registry.resolveSlot()
          8. App renders, mods are live
```

**Error handling:** Fail-fast. If a mod fails to load or a dependency is missing, the app shows the error in the terminal and does not boot. Slot binding errors are warn-and-skip — bad bindings are logged but don't crash the app.

**Mod metadata** is read from `modManifest.json` — there is no inline `meta` export in `index.ts`. The manifest is the single source of truth for mod identity.

---

## Hub Architecture

The Console-to-Hub migration (EPIC #140) replaced the three-panel Console pattern with free-form Hub pages.

### What was removed

- **`registerConsole()`** → replaced by `registerHub()`
- **`registerWorkspace()` as a console member** → workspaces are now standalone identities
- **`core/console/`** → deleted
- **Mutual-agreement pattern** (`consoleIds` + `accepts`) → dead
- **Three-panel layout** (Master/Detail/Workspace) → replaced by Hub + dedicated Workspace URLs

### How navigation works now

```
Sidebar (dynamic: registry.getHubs())
  → Click hub → navigate to /{hubId}
    → Hub page renders (free-form, owns its layout)
      → Click item → navigate to /{workspaceId}/{displayId}
        → Workspace page renders (full-page, fetches own data)
```

---

## Sidebar Navigation

The sidebar is auto-populated from `registerHub()`. Every registered hub gets a sidebar nav item with its icon, label, and route. The `order` field controls sort order.

The Pins mod registers a sidebar section via `registerSidebarAction()` — the pinned workspaces list renders below the nav items.

---

## Workspace Pages

Every workspace has a dedicated URL (e.g., `/lims/E-1234`, `/eln/E-1234`). The workspace identity is registered via `registerWorkspace()`; the route is registered via `registerRoute()`:

1. Mod registers workspace identity: `registerWorkspace({ id: 'eln', displayName: '...' })`
2. Mod registers route: `registerRoute({ path: '/eln/:displayId', ... })`
3. Router matches the pattern, workspace component is lazy-loaded
4. Workspace component **fetches its own data** — receives `displayId` as a route param
5. Workspace declares slots and resolves bindings at render time

---

## Slot System

The slot system extends the mod API for embedded UI extension. Workspaces declare named slots; mods register blocks and buttons, then bind them into slots. See [slot-system.md](slot-system.md) for the full design.

**Key principles:**
- **Renderer owns presentation** — the same block renders differently in TipTap vs. a sidebar vs. a tab
- **Block authors write once** — one `component`, no rendering-mode-specific code
- **Buttons are fire-only** — they emit events, never listen
- **Lifecycle events are renderer-emitted** — block authors never call `bus.emit()` for lifecycle
- **Defaults + overrides merge** — slot defaults apply to all bindings; per-binding overrides win

---

## Settings System

The Settings mod (`src/mods/settings/`) provides the shell at `/settings`. It reads `registry.getSettingsSections()`, sorts by `order`, and renders a nav layout. Each section is lazy-loaded when selected.

Other mods register sections into it:

```ts
// In src/mods/lims/index.ts
registerSettingsSection({
  id: 'lims.schemas',
  modId: 'lims',
  label: 'Entity Schemas',
  icon: Database,
  component: () => import('./settings/SchemaSettings'),
  order: 10,
});
```

---

## Mod-to-Mod Communication

Mods must not import directly from each other. All cross-mod communication goes through the registry.

**Primary pattern: Service registry.** Mod A registers a service; Mod B calls it.

```ts
// LIMS registers a service
registry.registerService({
  id: 'lims.resolveEntity',
  handler: (displayId: string) => api.getEntity(displayId),
});

// ELN calls it
const entity = await registry.call('lims.resolveEntity', displayId);
```

**Direct imports between mods are forbidden.** If two mods share code, it lives in `src/shell/src/shared/` or is accessed via the service registry.

---

## Backend Mod System

The backend mod system mirrors the frontend — mods are discovered from `modManifest.json`, loaded in topological order, and register their contributions through a unified `BackendModRegistry`. See [backend-mod-system.md](backend-mod-system.md) for the full design.

### Server Structure

```
src/server/
├── config/                    # Django project config (immutable shell)
│   ├── settings.py            # HELIX_MODS setting, computed INSTALLED_APPS
│   ├── urls.py                # Root URL conf — aggregates mod URLs
│   └── wsgi.py
│
├── core/                      # Core Django app — auth, base models
│   ├── models.py              # User, BrowsableItem (abstract base)
│   ├── urls.py                # /api/core/...
│   └── mentions/              # Cross-cutting mention resolution
│       ├── models.py          # Mention model
│       ├── urls.py            # /api/mentions/resolve/
│       ├── views.py
│       ├── serializers.py
│       └── sync.py            # Mention sync pipeline
│
└── helix_core/                # Platform SDK — mod system, actions, registry
    ├── loader.py              # Auto-discovery, topological sort, INSTALLED_APPS
    ├── registry.py            # BackendModRegistry — register_*() + call()
    ├── manifest.py            # ModManifest dataclass (parses modManifest.json)
    ├── actions.py             # AbstractBaseAction, ActionLoggingMixin, @logs_action
    └── exceptions.py          # ModNotFoundError, CircularDependencyError
```

### Backend mod.py Contract

Every backend mod provides a `mod.py` at its root with a `register()` function:

```python
# src/mods/lims/mod.py
from helix_core.registry import registry

def register():
    """Called by ModLoader after topological sort."""
    registry.register_entity_type("lims", "sample", prefix="SAMP")
    registry.register_urls("lims", "mods.lims.urls")
```

### BackendModRegistry Methods

| Method | Purpose |
|--------|---------|
| `register_action_model()` | Register a concrete action log model |
| `register_entity_type()` | Register an entity type prefix for mention resolution |
| `register_urls()` | Register URL patterns for root URL conf |
| `register_settings()` | Declare settings keys the mod needs |
| `register_signal()` | Wire cross-mod signal handlers |
| `register_service()` | Register a callable cross-mod service |

---

## Internal Mod Directory Contract

Every mod follows this structure:

| Entry | Purpose | Required? |
|-------|---------|-----------|
| `modManifest.json` | Mod identity (id, displayName, version, dependsOn) — single source of truth | ✅ Required |
| `index.ts` | Frontend `register*()` calls — the entry point loaded during boot | ✅ Required |
| `types.ts` | Mod's TypeScript interfaces | ✅ Required |
| `package.json` | npm package identity (`@helix/<id>`) | ✅ Required |
| `mod.py` | Backend `register()` function — called by ModLoader | If mod has backend code |
| `models.py` | Django models | If mod has backend data |
| `views.py` | DRF viewsets | If mod has API endpoints |
| `serializers.py` | DRF serializers | If mod has API endpoints |
| `urls.py` | Mod URL patterns | If mod has API endpoints |
| `admin.py` | Django admin registration | Optional |
| `api.ts` | Frontend API calls to mod's backend | If mod has API endpoints |
| `blocks/` | Content blocks registered via `registerBlock()` | If mod contributes editor blocks |
| `library/` | Card components registered via `registerLibraryItem()` | If mod appears in Library hub |
| `workspace/` | Full workspace + standalone page shell | If mod has a workspace |
| `settings/` | Settings panels registered to the Settings shell | If mod has settings |
| `editor/` | Rich editor + extensions | If mod owns an editor |
| `components/` | Mod-specific shared components | Optional |
| `hooks/` | Mod-specific hooks | Optional |
| `migrations/` | Django migrations | If mod has backend models |
| `tests/` | Backend tests | ✅ Required |

---

## Future: External Mod API

External mods will live in separate repositories and be installed via npm (frontend) and pip (backend). They will use the same `register*()` API and `modManifest.json` schema as internal mods.

**Future concerns (not yet designed):**

- **Discovery**: External mods will be listed in a JSON config file that the UI can read/write
- **Loading**: External mods are loaded after core mods, respecting the same dependency graph
- **`@helix/core` npm package**: External mods will depend on `@helix/core`, which exports all registration functions and shared components
- **`helix_core` Python package**: External backend mods will depend on `helix_core` (pip-installable), which provides `ModManifest`, `BackendModRegistry`, `AbstractBaseAction`
- **Python entry points**: External mods declare a `helix_mod` entry point pointing to their `mod.py`

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Internal + external same API | ✅ | Battle-test the API on first-party code before third parties touch it |
| Registration style | Imperative (`register*()` in `index.ts` / `mod.py`) | Flexible, testable, explicit control over order |
| Identity source of truth | `modManifest.json` at mod root | Both loaders read the same file; no dual declaration |
| Mod co-location | `src/mods/<id>/` — frontend + backend together | One folder per mod; no cross-directory drift |
| Discovery (internal) | Auto-glob `src/mods/*/modManifest.json` | No config file needed for always-loaded core mods |
| Discovery (backend) | `HELIX_MODS` setting + `modManifest.json` glob | Explicit list prevents surprises; glob automates loading |
| Dependency model | Explicit `dependsOn` with topological sort | Detect circular deps and missing deps at boot |
| Error handling | Fail-fast for deps; warn-and-skip for slot bindings | Broken dep graph = no boot; misconfigured slot = graceful degradation |
| Hub config | Minimal (`id`, `label`, `icon`, `route`, `component`, `order`) | No shared panel layout to constrain design |
| Workspace routing | `registerWorkspace()` for identity + `registerRoute()` for URL | Workspace identity used by mentions; route used by router |
| Library | Custom hub layout via `registerLibraryItem()` | Card-based List/Grid/Compact views |
| Blocks | Renderer-agnostic via slot system | Same block renders in TipTap, sidebar, or tab |
| Slot validation | Warn-and-skip for bad bindings | Misconfiguration shouldn't be catastrophic |
| Backend mod system | `BackendModRegistry` with `register_*()` methods | Same pattern as frontend; shared mental model |
| Cross-mod communication | Service registry (`registry.call()`) | No direct imports between mods |
| Action logging | Declarative (`ActionLoggingMixin` + `@logs_action`) | Zero boilerplate for mod authors |
| Block actions | Batching via `bus.collect()` + flush on save | Reduces API calls; ensures atomicity |
