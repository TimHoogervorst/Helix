# Mod System Architecture

> Date: 2026-07-02
> Status: Accepted
> This document captures the full architecture for the Helix Mod System, decided during a `/grill-with-docs` session. It supersedes ad-hoc workspace structure and establishes the canonical layout for the frontend and backend repositories.

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Directory Structure](#directory-structure)
3. [Registration API](#registration-api)
4. [Boot Sequence](#boot-sequence)
5. [Console ↔ Workspace Resolution](#console--workspace-resolution)
6. [Sidebar Navigation](#sidebar-navigation)
7. [Standalone Workspace Pages](#standalone-workspace-pages)
8. [Settings System](#settings-system)
9. [Mod-to-Mod Communication](#mod-to-mod-communication)
10. [Backend Structure](#backend-structure)
11. [Internal Mod Directory Contract](#internal-mod-directory-contract)
12. [Future: External Mod API](#future-external-mod-api)

---

## Core Concepts

| Term | Definition |
|------|-----------|
| **Mod** | A self-contained unit of functionality — owns its own console, workspace, detail cards, settings, routes, slash commands, and sidebar actions. Both built-in functionality (LIMS, ELN, Library) and future external plugins are mods. |
| **Core** | The immutable app shell — Layout, routing, console panels, mod loader, reference resolution, API client. Core provides the frame; mods provide the content. |
| **Core Mod** | A mod that ships with the repository under `core-mods/`. Always loaded. First-party. Uses the same registration API that external mods will use. |
| **Mod API** | The registration surface (`register*()` functions) that every mod calls to declare what it provides. Internal mods and future external mods use the same API. |
| **Mod Registry** | Central data structure populated by all `register*()` calls during boot. Read by Core to build routes, sidebar nav, console behavior, settings panels, and slash command menus. |
| **Console** | A browsing surface implementing the three-panel pattern (Master → Detail → Workspace). Each console is registered by a mod and appears in the sidebar nav. |
| **Workspace** | The full work surface for a specific item type. Has two faces: a detail card (shown in a console's Detail panel) and a full workspace (shown in the console's Expanded panel or a standalone page). |

---

## Directory Structure

```
frontend/src/
│
├── core/                              # Immutable app shell
│   ├── shell/                         # Layout & routing
│   │   ├── Layout.tsx                 # Sidebar + shell chrome
│   │   ├── AppShell.tsx               # Route outlet, global providers
│   │   ├── Router.tsx                 # Dynamic route generation from registry
│   │   └── ConsolePage.tsx            # 3-panel layout (master + detail + workspace)
│   │
│   ├── mod-system/                    # Mod lifecycle & registration API
│   │   ├── ModLoader.tsx              # Glob → topological sort → register → boot
│   │   ├── ModRegistry.ts             # Central registry for all registrations
│   │   ├── registerWorkspace.ts       # registerWorkspace()
│   │   ├── registerConsole.ts         # registerConsole()
│   │   ├── registerSlashCommand.ts    # registerSlashCommand()
│   │   ├── registerRoute.ts           # registerRoute()
│   │   ├── registerSidebarAction.ts   # registerSidebarAction()
│   │   ├── registerSettingsSection.ts # registerSettingsSection()
│   │   ├── registerService.ts         # registerService() — mod-to-mod communication
│   │   ├── types.ts                   # ModManifest, WorkspaceConfig, ConsoleConfig, etc.
│   │   └── README.md                  # Mod contract docs
│   │
│   ├── references/                    # Cross-cutting reference resolution
│   │   ├── ReferenceProvider.tsx
│   │   ├── resolveDisplayId.ts
│   │   └── useReferences.ts
│   │
│   ├── api/                           # Core API client
│   │   ├── client.ts                  # Generic request helper (get/post/put/patch/del)
│   │   └── csrf.ts
│   │
│   ├── console/                       # Console shell (view-state agnostic)
│   │   ├── ConsoleMasterPanel.tsx     # Table shell with headers + load-more
│   │   ├── ConsoleDetailPanel.tsx     # Panel shell with close/expand/collapse
│   │   ├── ConsoleWorkspacePanel.tsx  # Full-width work surface
│   │   ├── ConsoleCollapsedStrip.tsx  # Minimized master strip
│   │   ├── ConsoleContext.tsx         # ViewState context + transitions
│   │   └── useConsoleView.ts          # View state machine hook
│   │
│   └── types/
│       ├── console.ts                 # ViewState, ConsoleContextValue
│       └── references.ts              # ResolvedRef
│
├── core-mods/                         # Built-in mods — always loaded
│   │
│   ├── lims/                          # LIMS mod — entity management
│   │   ├── index.ts                   # All register*() calls
│   │   ├── types.ts                   # Entity, EntityType, ColumnDef, etc.
│   │   ├── api.ts                     # entities, entity-types, actions API calls
│   │   ├── console/
│   │   │   ├── LimsConsole.tsx        # Data-fetching + wire master/detail/workspace
│   │   │   ├── LimsTable.tsx          # Master panel row rendering
│   │   │   └── LimsDetailCard.tsx     # Detail panel card
│   │   ├── workspace/
│   │   │   ├── LimsWorkspace.tsx      # Tabbed workspace (Activity, Insights, Storage)
│   │   │   └── LimsWorkspacePage.tsx  # Standalone page: /lims/:displayId
│   │   ├── settings/
│   │   │   ├── SchemaSettings.tsx     # Entity type CRUD (TypeMasterPanel + TypeDetailPanel)
│   │   │   ├── ColumnEditor.tsx       # Column definition editor
│   │   │   └── DangerZone.tsx         # Delete everything
│   │   ├── components/
│   │   │   └── EntityDetailFields.tsx
│   │   ├── hooks/
│   │   └── __tests__/
│   │
│   ├── eln/                           # ELN mod — notebook entries + rich text
│   │   ├── index.ts
│   │   ├── types.ts                   # EntryDetail, Tag, Mention, TipTapDoc
│   │   ├── api.ts                     # entries, tags API calls
│   │   ├── console/
│   │   │   ├── ElnConsole.tsx         # ELN list view
│   │   │   ├── ElnTable.tsx           # Master panel row rendering
│   │   │   └── ElnDetailCard.tsx      # Detail panel card
│   │   ├── workspace/
│   │   │   ├── ElnWorkspace.tsx       # Rich editor + metadata + references
│   │   │   └── ElnWorkspacePage.tsx   # Standalone page: /eln/:id (and /eln/new)
│   │   ├── editor/
│   │   │   ├── ElnEditor.tsx          # TipTap editor component
│   │   │   └── extensions/            # TipTap extensions
│   │   │       ├── createElnExtensions.ts
│   │   │       ├── LimsTable.ts / LimsTableNode.tsx
│   │   │       ├── Reference.ts / ReferenceNode.tsx
│   │   │       ├── ReferenceSuggestion.ts
│   │   │       ├── SlashCommands.ts
│   │   │       └── suggestionDropdown.ts
│   │   ├── settings/
│   │   │   └── TagSettings.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── __tests__/
│   │
│   ├── library/                       # Library mod — folders + mixed listing
│   │   ├── index.ts
│   │   ├── types.ts                   # LibraryItem, LibraryEntryItem, LibraryFolderItem
│   │   ├── api.ts                     # library contents API
│   │   ├── console/
│   │   │   ├── LibraryConsole.tsx
│   │   │   ├── LibraryTable.tsx
│   │   │   ├── LibraryDetailCard.tsx
│   │   │   └── LibraryNewDropdown.tsx
│   │   ├── settings/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── __tests__/
│   │
│   ├── settings/                      # Settings mod (the shell itself)
│   │   ├── index.ts                   # Registers /settings route + settings shell
│   │   ├── types.ts
│   │   ├── pages/
│   │   │   └── SettingsPage.tsx       # Shell: renders registered settings sections
│   │   └── __tests__/
│   │
│   └── pins/                          # Pinned workspaces mod
│       ├── index.ts                   # Registers sidebar section + pin actions
│       ├── types.ts
│       ├── api.ts
│       ├── components/
│       │   └── PinnedWorkspacesSidebar.tsx
│       ├── hooks/
│       │   └── usePinnedWorkspaces.ts
│       └── __tests__/
│
├── shared/                            # Cross-mod shared components & hooks
│   ├── ReferenceBadge.tsx
│   ├── ContentPreview.tsx
│   ├── useContentPreview.ts
│   └── __tests__/
│
├── App.tsx                            # Thin: <ModLoader> → <AppShell>
├── main.tsx                           # Entry: BrowserRouter + StrictMode
├── styles.css                         # Global Tailwind directives + custom classes
│
└── test/                              # Shared test infrastructure
    ├── factories.tsx
    ├── factories.test.tsx
    └── setup.ts
```

---

## Registration API

Every mod declares what it provides by calling `register*()` functions in its `index.ts`. The Mod Registry collects all registrations. This is the same API that future external mods will use.

### registerConsole()

Registers a browsing surface. Automatically adds a sidebar nav item.

```ts
registerConsole({
  id: string;                        // e.g. 'lims'
  label: string;                     // e.g. 'Database' — shown in sidebar
  icon: React.ComponentType;         // Lucide icon
  route: string;                     // e.g. '/lims'
  component: React.LazyComponent;    // The console page component
  order: number;                     // Sidebar sort order
  defaults: {                        // Default renderers for items in this console
    row?: React.ComponentType;       // Fallback row renderer
    detailCard?: React.ComponentType;// Fallback detail card
    workspace?: React.ComponentType; // Fallback workspace
  };
  accepts?: {                        // Which workspace types this console shows
    only?: string[];                 // Whitelist: only these workspace IDs
    except?: string[];               // Blacklist: everything except these IDs
  };
}): void;
```

**Current consoles:**

| Console | ID | Route | `accepts` | Master items |
|---------|----|-------|-----------|-------------|
| Library | `library` | `/library` | `{ only: ['eln.entry'] }` | Folders + ELN entries |
| LIMS | `lims` | `/lims` | `{ except: ['eln.entry'] }` | Entities (any type) |

### registerWorkspace()

Registers an item type that can appear in consoles. Tied to one or more consoles via `consoleIds`.

```ts
registerWorkspace({
  id: string;                        // Globally unique — includes mod prefix, e.g. 'lims.entity', 'eln.entry'
  consoleIds: string[];              // Which consoles host this workspace
  label: string;                     // Display name
  icon?: React.ComponentType;
  route: string;                     // Standalone page route — auto-registers as a route
  row?: React.ComponentType;         // Custom row renderer (falls back to console default)
  detailCard?: React.ComponentType;  // Custom detail card (falls back to console default)
  workspace?: React.ComponentType;   // Custom workspace (falls back to console default)
}): void;
```

**Layered defaults:** If a workspace only overrides `workspace`, the console defaults are used for `row` and `detailCard`. If it overrides nothing but `id`/`consoleIds`, the console defaults apply to everything.

**Current workspaces:**

| ID | Console | Overrides |
|----|---------|-----------|
| `lims.entity` | `lims` | `row`, `detailCard`, `workspace` |
| `eln.entry` | `library` | `detailCard`, `workspace` |

### registerSettingsSection()

Registers a panel in the Settings shell.

```ts
registerSettingsSection({
  id: string;                        // e.g. 'lims.schemas'
  modId: string;                     // Which mod owns this section
  label: string;                     // e.g. 'Entity Schemas'
  icon?: React.ComponentType;
  component: React.LazyComponent;    // Lazy-loaded settings panel
  order: number;                     // Sort order in settings nav
}): void;
```

### registerSlashCommand()

Registers a `/` command for the ELN editor's slash menu. *(Detailed design deferred to the slash command system refactor.)*

```ts
registerSlashCommand({
  id: string;                        // e.g. 'molbio.translate'
  label: string;                     // e.g. 'Translate DNA'
  icon?: React.ComponentType;
  workspaces: string[];              // Which workspace IDs this appears in
  action: (context: SlashContext) => void;
}): void;
```

### registerRoute()

Registers a standalone route not tied to a console or workspace (e.g., `/settings`).

```ts
registerRoute({
  id: string;
  modId: string;
  path: string;                      // e.g. '/settings'
  component: React.LazyComponent;
}): void;
```

### registerSidebarAction()

Registers a button or badge on a workspace's sidebar row (e.g., pin/unpin).

```ts
registerSidebarAction({
  id: string;                        // e.g. 'pins.pin'
  workspaceId: string;               // Which workspace this action targets
  component: React.ComponentType;    // Button/badge component
  position: 'inline' | 'hover';      // Always shown vs shown on hover
}): void;
```

### registerService()

Registers a callable service for mod-to-mod communication. *(Detailed design deferred.)*

```ts
registerService({
  id: string;                        // e.g. 'lims.resolveEntity'
  handler: (...args: any[]) => Promise<any>;
}): void;
```

---

## Boot Sequence

```
main.tsx
  → BrowserRouter
    → App.tsx
      → <ModLoader>
          1. Glob all core-mods/*/index.ts files
          2. Import each, read exported `meta.dependsOn`
          3. Topological sort mods by dependency graph
          4. Validate: no circular deps, no missing deps, no duplicate IDs
          5. Call each mod's register function in sorted order
             → Each index.ts calls register*() → populates ModRegistry
          6. Validate registry: all references resolve, no conflicts
          7. Render <AppShell>
             → Layout reads registry for sidebar nav
             → Router reads registry for route tree
             → ConsolePage reads registry for detail cards & workspaces
             → Settings shell reads registry for settings panels
          8. App renders, mods are live
```

**Error handling:** Fail-fast. If a mod fails to load or a dependency is missing, the app shows the error in the terminal and does not boot. No degraded mode — the dependency graph must be correct.

**Mod metadata** (in each `index.ts`):

```ts
export const meta = {
  id: 'eln',
  displayName: 'Electronic Lab Notebook',
  dependsOn: ['lims'],              // LIMS must load first
};
```

The `dependsOn` array is honored during topological sort. Circular dependencies cause a boot failure.

---

## Console ↔ Workspace Resolution

When a user clicks a row in a console's Master panel:

1. The row data identifies the workspace type (e.g., `type: 'lims.entity'`)
2. The console checks its `accepts` filter — is this workspace type allowed?
3. If allowed, the registry resolves the detail card for that workspace type
4. The console's Detail panel renders the detail card (workspace override → console default)
5. If the user expands, the console's Workspace panel renders the full workspace (same layering)

**The workspace decides which consoles it belongs to** via `consoleIds`. **The console has the final say** via `accepts` (whitelist or blacklist). Both must agree for a workspace to appear in a console.

**Library console** (`accepts: { only: ['eln.entry'] }`): Only ELN entries appear. Folders are navigational — clicking navigates into the folder, not to a detail card.

**LIMS console** (`accepts: { except: ['eln.entry'] }`): Everything *except* ELN entries appears — LIMS entities today, and future mod workspaces (e.g., `molbio.dna`, `storage.location`) tomorrow.

---

## Sidebar Navigation

The sidebar is auto-populated from `registerConsole()`. Every registered console gets a sidebar nav item with its icon, label, and route. The `order` field controls sort order.

The Pins mod registers a sidebar *section* (not a nav item) via `registerSidebarAction()` — the pinned workspaces list renders below the nav items. Future mods can register additional sidebar sections the same way (e.g., a "Recent" section, a "Favorites" section).

There is no separate "register sidebar nav item" function — registering a console is the mechanism. If you want a sidebar link, you register a console.

---

## Standalone Workspace Pages

Every workspace has a dedicated URL (e.g., `/lims/E-1234`). The `<WorkspacePage>` component handles all standalone workspace routes:

1. Router matches the pattern (registered automatically from `registerWorkspace({ route })`)
2. `<WorkspacePage>` renders with a loader (Suspense fallback)
3. The workspace component is lazy-loaded from the registry
4. The workspace component **fetches its own data** — WorkspacePage passes `displayId` as a prop, the workspace handles loading/error/data states internally
5. The workspace renders full-page with a back button

```tsx
// WorkspacePage.tsx — thin shell
function WorkspacePage() {
  const { displayId } = useParams();
  const workspace = registry.resolveWorkspaceFromRoute(pathname);
  return (
    <Suspense fallback={<WorkspaceLoader />}>
      <ErrorBoundary fallback={<WorkspaceError />}>
        <workspace.component displayId={displayId} />
      </ErrorBoundary>
    </Suspense>
  );
}
```

---

## Settings System

The Settings mod (`core-mods/settings/`) provides the shell at `/settings`. It reads `registry.settingsSections`, sorts by `order`, and renders a tabbed or sidebar-nav layout. Each section is lazy-loaded when selected.

Other mods register sections into it:

```ts
// In core-mods/lims/index.ts
registerSettingsSection({
  id: 'lims.schemas',
  modId: 'lims',
  label: 'Entity Schemas',
  icon: Database,
  component: () => import('./settings/SchemaSettings'),
  order: 10,
});
```

The Settings mod owns nothing except the shell. All settings panels are distributed across their owning mods.

---

## Mod-to-Mod Communication

Mods must not import directly from each other. All cross-mod communication goes through the registry.

**Primary pattern: Service registry.** Mod A registers a service; Mod B calls it.

```ts
// LIMS registers a service
registerService({
  id: 'lims.resolveEntity',
  handler: (displayId: string) => api.getEntity(displayId),
});

// ELN calls it
const entity = await registry.call('lims.resolveEntity', displayId);
```

**Direct imports between mods are forbidden.** If two mods share code, it lives in `shared/` or is accessed via the service registry.

---

## Backend Structure

The backend mirrors the frontend's mod structure:

```
backend/
├── config/                    # Django project config (immutable shell)
│   ├── settings.py
│   ├── urls.py                # Root URL conf — aggregates mod URLs
│   └── wsgi.py
│
├── core/                      # Core Django app — auth, base models
│   ├── models.py              # User, BrowsableItem (abstract base)
│   ├── urls.py                # /api/core/... (csrf, ...)
│   └── ...
│
├── core_mods/                 # Built-in mods (mirrors frontend core-mods/)
│   ├── lims/
│   │   ├── __init__.py        # AppConfig
│   │   ├── models.py          # EntityType, Entity, Action
│   │   ├── urls.py            # /api/lims/entities/, /api/lims/entity-types/, etc.
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── admin.py
│   │
│   ├── eln/
│   │   ├── __init__.py
│   │   ├── models.py          # NotebookEntry, Tag, Mention
│   │   ├── urls.py            # /api/eln/entries/, /api/eln/tags/
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── admin.py
│   │
│   ├── library/
│   │   ├── __init__.py
│   │   ├── views.py           # LibraryContentsView (mixed folder+entry)
│   │   ├── urls.py
│   │   └── serializers.py
│   │
│   └── pins/
│       ├── __init__.py
│       ├── models.py          # PinnedWorkspace
│       ├── urls.py
│       ├── views.py
│       └── serializers.py
│
├── references/                # Cross-cutting reference resolution
│   ├── models.py
│   ├── urls.py
│   ├── views.py
│   └── resolve.py
│
└── shared/                    # Shared Django utilities
    ├── pagination.py
    └── permissions.py
```

The backend uses Django's **`INSTALLED_APPS`** for mod registration — no custom backend registry. Each `core_mods/*/` is a standard Django app listed in `INSTALLED_APPS`. The mod system on the backend is purely organizational (directory structure + naming convention).

`BrowsableItem` (the abstract base model with `display_id` generation) lives in `core/` so it can be exported as part of the future `@helix/core` Python package for external mods.

**Backend mod structure:**

| Current location | New location |
|---|---|
| `workspaces/eln/` | `core_mods/eln/` |
| `workspaces/lims/` | `core_mods/lims/` |
| `console/library/` | `core_mods/library/` |
| `core/` (PinnedWorkspace) | `core_mods/pins/` |
| `core/` (User, BrowsableItem) | `core/` (unchanged — core infrastructure) |
| `references/` | `references/` (unchanged) |

---

## Internal Mod Directory Contract

Every mod follows this structure — both current core mods and future mods:

| Directory | Purpose | Required? |
|---|---|---|
| `index.ts` | All `register*()` calls — the single entry point Core loads during boot | ✅ Required |
| `types.ts` | Mod's TypeScript interfaces | ✅ Required |
| `api.ts` | Mod's backend API calls | If mod has API endpoints |
| `console/` | Console contributions (Console page, Table, DetailCard) | If mod has a console |
| `workspace/` | Full workspace + standalone page shell | If mod has a workspace |
| `settings/` | Settings panels registered to the Settings shell | If mod has settings |
| `editor/` | Rich editor + extensions | If mod owns an editor |
| `components/` | Mod-specific shared components | Optional |
| `hooks/` | Mod-specific hooks | Optional |
| `__tests__/` | Tests | ✅ Required |

---

## Future: External Mod API

External mods will live in separate repositories and be installed via npm. They will use the same `register*()` API as internal mods.

**Future concerns (not yet designed):**

- **Discovery**: External mods will be listed in a JSON config file (`helix.mods.json`) that the UI can read/write. This config becomes the single source of truth for which external mods are installed.
- **Loading**: External mods are loaded after core mods, respecting the same dependency graph (`dependsOn`).
- **`@helix/core` npm package**: External mods will depend on `@helix/core`, which exports all registration functions, the registry, core types, and shared components (`ReferenceBadge`, console shell components, etc.).
- **HMR during development**: How core mods hot-reload during development will be addressed when the external mod loader is designed.
- **Backend mods**: External backend mods will import `BrowsableItem` and shared utilities from `@helix/core` (Python package), register as Django apps, and be listed in `INSTALLED_APPS`.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Internal + external same API | ✅ | Battle-test the API on first-party code before third parties touch it |
| Registration style | Imperative (`register*()` in `index.ts`) | Flexible, testable, explicit control over order |
| Discovery (internal) | Auto-glob `core-mods/*/index.ts` | No config file needed for always-loaded core mods |
| Discovery (external) | JSON config file (future) | Single source of truth, UI-writable, version-controllable |
| Dependency model | Explicit `dependsOn` with topological sort | Detect circular deps and missing deps at boot |
| Error handling | Fail-fast | Broken dependency graph = no boot, error in terminal |
| Console workspace filtering | Whitelist/blacklist via `accepts` | Console has final say; workspace declares intent via `consoleIds` |
| Sidebar | Auto-populated from `registerConsole()` | One registration, two effects (route + sidebar nav) |
| Standalone workspace | Workspace fetches own data | Different workspaces fetch different data shapes |
| Settings | Distributed — Settings mod owns shell, other mods register sections | Flexible, scalable |
| Mod-to-mod communication | Service registry (`registry.call()`) | No direct imports between mods |
| Backend mod system | Django `INSTALLED_APPS` | Django already handles model/URL/admin discovery |
| `BrowsableItem` location | `core/` | Importable by external mods via `@helix/core` |
| Migration strategy | Big-bang restructure | Clean break, no legacy paths to maintain |
