# Mod System Architecture

> Date: 2026-07-13 (updated with slot system references)
> Status: Accepted
> Companion to: [Slot System & Event Bus](slot-system.md), [Actions System Design](actions-system-design.md), [Backend Mod System Design](backend-mod-system.md)
>
> This document captures the full architecture for the Helix Mod System. It reflects the Hub-based architecture (EPIC #140), the Block Registry (#175), the Library UI rework (#133), and the references→mentions consolidation (#131). The slot system and workspace event bus (#205) extend this architecture — see [slot-system.md](slot-system.md).

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Directory Structure](#directory-structure)
3. [Registration API](#registration-api)
4. [Boot Sequence](#boot-sequence)
5. [Hub Architecture](#hub-architecture)
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
| **Mod** | A self-contained unit of functionality — owns its own hub, workspace pages, library items, blocks, settings, routes, and sidebar actions. Both built-in functionality (LIMS, ELN, Library) and future external plugins are mods. |
| **Core** | The immutable app shell — Layout, routing, mod loader, mention resolution, API client. Core provides the frame; mods provide the content. |
| **Core Mod** | A mod that ships with the repository under `core-mods/`. Always loaded. First-party. Uses the same registration API that external mods will use. |
| **Mod API** | The registration surface (`register*()` functions) that every mod calls to declare what it provides. Internal mods and future external mods use the same API. |
| **Mod Registry** | Central data structure populated by all `register*()` calls during boot. Read by Core to build routes, sidebar nav, settings panels, slash command menus, and block extensions. |
| **Hub** | A free-form browsing page that links to Workspaces. Each hub is registered by a mod and appears in the sidebar nav. Hubs are minimal — they own no defaults, no `accepts` filter, and no workspace type registry. Each hub manages its own item registrations internally (e.g., `registerLibraryItem()` for the Library hub). |
| **Workspace** | A full work surface for a specific item, accessed via a dedicated URL (e.g., `/eln/E-1234`). Workspaces are plain routes registered via `registerRoute()`. There is no `registerWorkspace()` — the mutual-agreement Console↔Workspace pattern has been removed. |
| **Block** | A content block that can be inserted into the ELN editor via the `/` slash menu. Blocks are registered as `BlockSlotContent` (type: `"block"`) via `registerIntoSlot()` into the editor's `"block-container"` slot. Carries `listensTo` + `onEvent` for event bus reactions, and optional `messages` overrides for action logging. The legacy `registerBlock()` function is replaced by the slot system — see [slot-system.md](slot-system.md). |
| **Library Item** | A card rendered in the Library hub. Mods register a `listCard` component via `registerLibraryItem()`. The library core wraps it in a `BaseLibraryCard` that handles view-mode CSS, selection state, and field visibility toggles. |
| **Mention** | A cross-reference from one piece of content to another via a display ID (e.g., `#DNA34`). Previously called "reference" — the entire stack (backend app, frontend module, components, API routes) has been renamed from `references` to `mentions`. |

---

## Directory Structure

```
frontend/src/
│
├── core/                              # Immutable app shell
│   ├── shell/                         # Layout & routing
│   │   ├── Layout.tsx                 # Sidebar + shell chrome (dynamic hub loop)
│   │   ├── AppShell.tsx               # Route outlet, global providers
│   │   └── Router.tsx                 # Dynamic route generation from registry
│   │
│   ├── mod-system/                    # Mod lifecycle & registration API
│   │   ├── ModLoader.tsx              # Glob → topological sort → register → boot
│   │   ├── ModRegistry.ts             # Central registry for all registrations
│   │   ├── registerHub.ts             # registerHub()
│   │   ├── registerBlock.ts           # registerBlock()
│   │   ├── registerLibraryItem.ts     # registerLibraryItem()
│   │   ├── registerRoute.ts           # registerRoute()
│   │   ├── registerSidebarAction.ts   # registerSidebarAction()
│   │   ├── registerSettingsSection.ts # registerSettingsSection()
│   │   ├── registerService.ts         # registerService() — mod-to-mod communication
│   │   ├── types.ts                   # ModManifest, HubConfig, BlockConfig, etc.
│   │   └── README.md                  # Mod contract docs
│   │
│   ├── mentions/                      # Cross-cutting mention resolution
│   │   ├── MentionProvider.tsx
│   │   ├── resolveDisplayId.ts
│   │   └── useMentions.ts
│   │
│   ├── api/                           # Core API client
│   │   ├── client.ts                  # Generic request helper (get/post/put/patch/del)
│   │   └── csrf.ts
│   │
│   └── types/
│       └── mentions.ts                # ResolvedMention
│
├── core-mods/                         # Built-in mods — always loaded
│   │
│   ├── lims/                          # LIMS mod — entity management
│   │   ├── index.ts                   # All register*() calls (hub removed, workspace route kept)
│   │   ├── types.ts                   # Entity, EntityType, ColumnDef, etc.
│   │   ├── api.ts                     # entities, entity-types, actions API calls
│   │   ├── workspace/
│   │   │   ├── LimsWorkspace.tsx      # Tabbed workspace (Activity, Insights, Storage)
│   │   │   └── LimsWorkspacePage.tsx  # Standalone page: /lims/:displayId (registered as route)
│   │   ├── settings/
│   │   │   ├── SchemaSettings.tsx     # Entity type CRUD
│   │   │   ├── ColumnEditor.tsx       # Column definition editor
│   │   │   └── DangerZone.tsx         # Delete everything
│   │   ├── components/
│   │   │   └── EntityDetailFields.tsx
│   │   ├── hooks/
│   │   └── __tests__/
│   │
│   ├── eln/                           # ELN mod — notebook entries + rich text
│   │   ├── index.ts
│   │   ├── types.ts                   # EntryDetail, Tag, ContentVersion, TipTapDoc
│   │   ├── api.ts                     # entries, tags, locks API calls
│   │   ├── library/
│   │   │   └── ElnLibraryCard.tsx      # Card component registered via registerLibraryItem()
│   │   ├── workspace/
│   │   │   ├── ElnWorkspace.tsx        # Rich editor + metadata + mentions
│   │   │   └── ElnWorkspacePage.tsx    # Standalone page: /eln/:displayId (registered as route)
│   │   ├── blocks/                     # Content blocks registered via registerBlock()
│   │   │   ├── LimsTable.ts            # TipTap Node for LIMS tables
│   │   │   └── LimsTableNode.tsx       # Node view component
│   │   ├── editor/
│   │   │   ├── ElnEditor.tsx           # TipTap editor component
│   │   │   ├── extensions/
│   │   │   │   ├── createElnExtensions.ts  # Reads blocks from registry, spreads into extensions
│   │   │   │   ├── Reference.ts / ReferenceNode.tsx
│   │   │   │   ├── ReferenceSuggestion.ts
│   │   │   │   ├── SlashCommands.ts        # / menu — reads items from getBlocks()
│   │   │   │   └── suggestionDropdown.ts
│   │   │   ├── hooks/
│   │   │   │   ├── useAutoSave.ts       # Debounced auto-save with flush-on-unmount
│   │   │   │   ├── useSaveQueue.ts      # Serial in-memory save queue with retry
│   │   │   │   ├── useEntryCrud.ts      # Lock acquisition, save pipeline, CRUD state
│   │   │   │   └── useEntryLock.ts      # Lock status derivation (isLockedByOther, lockHeldBy)
│   │   │   └── components/
│   │   │       ├── MoreActions.tsx      # Portal dropdown (Delete moved here as destructive action)
│   │   │       └── LockedBanner.tsx     # "Locked by {user} — read-only" info strip
│   │   ├── settings/
│   │   │   └── TagSettings.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── __tests__/
│   │
│   ├── library/                       # Library hub mod — folders + card-based listing
│   │   ├── index.ts                   # Registers hub at /library, library items, routes
│   │   ├── types.ts                   # LibraryItem, LibraryEntryItem, LibraryFolderItem
│   │   ├── api.ts                     # library contents API
│   │   ├── components/
│   │   │   ├── LibraryHub.tsx          # Hub page: top bar + filter bar + content + sidebar
│   │   │   ├── BaseLibraryCard.tsx     # Shared card wrapper (view-mode CSS, selection, fields)
│   │   │   ├── LibraryListView.tsx     # List view mode
│   │   │   ├── LibraryGridView.tsx     # Grid view mode (2-3 columns)
│   │   │   ├── LibraryCompactView.tsx  # Compact view mode (single row)
│   │   │   ├── LibraryNewDropdown.tsx  # + New menu
│   │   │   └── ViewToggle.tsx          # List / Grid / Compact toggle
│   │   ├── hooks/
│   │   └── __tests__/
│   │
│   ├── home/                           # Home hub mod
│   │   ├── index.ts                    # Registers hub at /home with order: 0
│   │   ├── components/
│   │   │   └── HomeHub.tsx
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
├── shared/                            # Cross-mod shared components & hooks (platform SDK)
│   ├── components/
│   │   ├── BaseCard.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── TagChips.tsx
│   │   ├── Breadcrumbs.tsx            # Generalized: BreadcrumbSegment[]
│   │   ├── Activity.tsx
│   │   ├── MentionBadge.tsx            # Formerly ReferenceBadge
│   │   └── ContentPreview.tsx
│   ├── hooks/
│   │   ├── useContentPreview.ts
│   │   ├── usePaginatedData.ts         # Formerly useConsoleData
│   │   └── useActivity.ts
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

Each hub manages its own internal item registrations. For example, the Library hub uses `registerLibraryItem()` internally to collect cards from mods. A hub that only needs a single page (like Home) registers nothing beyond the hub itself.

**Current hubs:**

| Hub | ID | Route | Description |
|-----|----|-------|-------------|
| Home | `home` | `/home` | Landing page, order: 0 |
| Library | `library` | `/library` | Card-based filesystem browser (List/Grid/Compact) |
| Settings | `settings` | `/settings` | Application settings shell |

> **Note:** The LIMS hub was removed. LIMS entities are accessed directly via their workspace URLs (`/lims/:displayId`) — needed for cross-reference (mention) resolution. The Database browsing surface may return as a future hub.

> **Note:** Starred was removed entirely (deferred to a future hub EPIC).

### registerLibraryItem()

Registers a card component for rendering in the Library hub. Mods contribute one `listCard` component; the library core wraps it in `BaseLibraryCard`.

```ts
registerLibraryItem({
  id: string;                        // e.g. 'eln.entry'
  modId: string;                     // Which mod owns this item
  label: string;                     // Display name for the item type
  icon: React.ComponentType;
  listCard: React.ComponentType;     // Card component rendered inside BaseLibraryCard
  propertyFields?: PropertyField[];  // Optional inline metadata fields
}): void;
```

The `BaseLibraryCard` wrapper provides:
- **Three view modes** (purely CSS-driven from the same DOM):
  - **List:** Full card — icon, display ID, type, status chip, title, description, tags, metadata row, owner
  - **Grid:** Card-style 2-3 column grid — larger icon, title, status, ID, owner (no description/tags)
  - **Compact:** Single minimal row — icon, name, ID, owner only
- Selection state management
- Field visibility toggles per view mode

**Current library items:**

| ID | Mod | Card Component |
|----|-----|---------------|
| `eln.entry` | ELN | `ElnLibraryCard` |

### registerBlock()

Registers a content block that can be inserted into the ELN editor via the `/` slash menu. This replaces the stubbed `registerSlashCommand()` — the old `SlashCommandConfig`/`SlashContext` types have been removed.

```ts
registerBlock({
  id: string;                        // e.g. 'eln.table'
  label: string;                     // e.g. 'Table' — shown in slash menu
  description: string;               // e.g. 'Insert a LIMS data table'
  icon: React.ComponentType;         // Lucide icon
  type: 'tiptap-node';               // Discriminator for payload shape
  payload: TipTapBlockPayload;       // Type-specific payload
}): void;
```

**`TipTapBlockPayload`** (for `type: "tiptap-node"`):

```ts
interface TipTapBlockPayload {
  node: Node;                        // TipTap Node extension
  defaultAttrs?: Record<string, unknown>;
}
```

**How blocks are consumed:**

1. **`createElnExtensions`** reads from `registry.getBlocks()`, filters by `type === "tiptap-node"`, and spreads `payload.node` into the extensions array. No hardcoded `LimsTable` dependency.
2. **`SlashCommands`** reads from `registry.getBlocks()`, filters by `"tiptap-node"`, and auto-derives insert actions from `payload.node.name` and `payload.defaultAttrs`. Blocks are sorted alphabetically by `label`.
3. **Block files** live under each mod's `blocks/` directory (e.g., `eln/blocks/LimsTable.ts`).

**Current blocks:**

| ID | Mod | Type | Node |
|----|-----|------|------|
| `eln.table` | ELN | `tiptap-node` | `LimsTable` |

Future block types (not yet implemented) may include non-TipTap consumers with different payload shapes.

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

Workspace pages are registered as plain routes. There is no `registerWorkspace()` — the old mutual-agreement pattern (`consoleIds` + `accepts`) has been removed. Each mod registers its workspace page(s) directly:

```ts
// In core-mods/lims/index.ts
registerRoute({
  id: 'lims.entity-workspace',
  modId: 'lims',
  path: '/lims/:displayId',
  component: () => import('./workspace/LimsWorkspacePage'),
});

// In core-mods/eln/index.ts
registerRoute({
  id: 'eln.entry-workspace',
  modId: 'eln',
  path: '/eln/:displayId',
  component: () => import('./workspace/ElnWorkspacePage'),
});
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

Internally calls `registerRoute()` with `public: true`. The Router renders public routes without the `<Layout>` wrapper.

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

Registers a callable service for mod-to-mod communication.

```ts
registerService({
  id: string;                        // e.g. 'lims.resolveEntity'
  handler: (...args: any[]) => Promise<any>;
}): void;
```

### Slot System (extends this API)

The slot system adds two new registration functions for embedded UI extension. Workspaces declare named slots; mods register content into them. See [slot-system.md](slot-system.md) for the full design.

```ts
// Workspace declares a named placeholder
declareSlot({ id: string; type: SlotType; maxItems?: number }): void;

// Mod registers content into a declared slot
registerIntoSlot(slotId: string, content: ButtonSlotContent | BlockSlotContent | ComponentSlotContent): void;
```

The eight `register*()` functions above remain for app-level concerns (hubs, routes, settings). Slots handle embedded UI extension only — not everything is a slot.

> **Note:** `registerBlock()` will be superseded by `registerIntoSlot()` with `BlockSlotContent` when the slot system lands. During the transition, both exist. New blocks should use the slot API.

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
             → Layout reads registry for sidebar nav (getHubs())
             → Router reads registry for route tree
             → Hub pages read registry for items/blocks
             → Settings shell reads registry for settings panels
          8. App renders, mods are live
```

**Error handling:** Fail-fast. If a mod fails to load or a dependency is missing, the app shows the error in the terminal and does not boot. No degraded mode — the dependency graph must be correct.

**Mod metadata** (in each `index.ts`):

```ts
export const meta = {
  id: 'eln',
  displayName: 'Electronic Lab Notebook',
  version: '0.1.0',
  dependsOn: ['lims'],              // LIMS must load first
};
```

The `dependsOn` array is honored during topological sort. Circular dependencies cause a boot failure.

---

## Hub Architecture

The Console-to-Hub migration (EPIC #140) replaced the three-panel Console pattern with free-form Hub pages.

### What was removed

- **`registerConsole()`** → replaced by `registerHub()`
- **`registerWorkspace()`** → workspaces are now plain `registerRoute()` calls
- **`core/console/`** → deleted. The three-panel layout (`ConsolePage`, `ConsoleMasterPanel`, `ConsoleDetailPanel`, `ConsoleWorkspacePanel`, `ConsoleCollapsedStrip`, `ConsoleContext`, `useConsoleView`) is all gone.
- **Mutual-agreement pattern** (`consoleIds` + `accepts`) → dead. Hubs don't filter workspace types; workspaces don't declare console membership.
- **Starred** → removed entirely, deferred to a future hub.

### What survived

| Old location | New location | Notes |
|-------------|-------------|-------|
| `core/console/Breadcrumbs.tsx` | `shared/components/Breadcrumbs.tsx` | Generalized to `BreadcrumbSegment[]` |
| `core/console/useConsoleData.ts` | `shared/hooks/usePaginatedData.ts` | Generic paginated data hook |

### What was added

- **`registerHub()`** — minimal config: `id`, `label`, `icon`, `route`, `component`, `order`
- **`shared/` platform SDK** — `BaseCard`, `StatusBadge`, `TagChips`, `Breadcrumbs`, `Activity`, `MentionBadge`, `ContentPreview`, `useContentPreview`, `usePaginatedData`, `useActivity`
- **Home hub** — registered at `/home` with `order: 0`, provides the landing page

### How navigation works now

```
Sidebar (dynamic: registry.getHubs())
  → Click hub → navigate to /{hubId}
    → Hub page renders (free-form, owns its layout)
      → Click item → navigate to /{workspaceId}/{displayId}
        → Workspace page renders (full-page, fetches own data)
```

There is no shared panel layout. Each hub is a free-form page. The Library hub has its own custom layout (top bar, filter bar, card grid, right sidebar). The Home hub is a simple landing page. Future hubs are free to design their own layouts.

---

## Sidebar Navigation

The sidebar is auto-populated from `registerHub()`. Every registered hub gets a sidebar nav item with its icon, label, and route. The `order` field controls sort order.

The hardcoded `<button>` placeholder in `Layout.tsx` has been replaced by a dynamic loop over `registry.getHubs()`.

The Pins mod registers a sidebar *section* (not a nav item) via `registerSidebarAction()` — the pinned workspaces list renders below the nav items. Future mods can register additional sidebar sections the same way (e.g., a "Recent" section, a "Favorites" section).

There is no separate "register sidebar nav item" function — registering a hub is the mechanism. If you want a sidebar link, you register a hub.

---

## Standalone Workspace Pages

Every workspace has a dedicated URL (e.g., `/lims/E-1234`, `/eln/E-1234`). Workspaces are registered as plain routes via `registerRoute()`:

1. Mod registers a route with a path like `/lims/:displayId`
2. Router matches the pattern
3. The workspace page component is lazy-loaded
4. The workspace component **fetches its own data** — receives `displayId` as a route param, handles loading/error/data states internally
5. The workspace renders full-page

```tsx
// WorkspacePage.tsx — thin shell (conceptual)
function WorkspacePage() {
  const { displayId } = useParams();
  return (
    <Suspense fallback={<WorkspaceLoader />}>
      <ErrorBoundary fallback={<WorkspaceError />}>
        <WorkspaceComponent displayId={displayId} />
      </ErrorBoundary>
    </Suspense>
  );
}
```

There is no workspace registry. No `consoleIds`. No `accepts` filter. Each mod owns its workspace routes completely.

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
│   │
│   ├── mentions/              # Cross-cutting mention resolution (formerly references/)
│   │   ├── __init__.py        # AppConfig
│   │   ├── models.py          # Mention model (moved from ELN)
│   │   ├── urls.py            # /api/mentions/resolve/
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── sync.py            # Mention sync (formerly mention_sync.py)
│   │
│   └── ...
│
├── core_mods/                 # Built-in mods (mirrors frontend core-mods/)
│   ├── lims/
│   │   ├── __init__.py        # AppConfig
│   │   ├── models.py          # EntityType, Entity, Action, RegisteredEntityType
│   │   ├── urls.py            # /api/lims/entities/, /api/lims/entity-types/, etc.
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── admin.py
│   │
│   ├── eln/
│   │   ├── __init__.py
│   │   ├── models.py          # NotebookEntry, Tag, ContentVersion, EntryLock
│   │   ├── urls.py            # /api/eln/entries/, /api/eln/tags/, /api/eln/locks/
│   │   ├── views.py
│   │   ├── serializers.py
│   │   └── admin.py
│   │
│   ├── library/
│   │   ├── __init__.py
│   │   ├── views.py           # LibraryContentsView (mixed folder+entry, enriched API)
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
└── shared/                    # Shared Django utilities
    ├── pagination.py
    └── permissions.py
```

Key backend changes from the old architecture:

| Old location | New location | Notes |
|---|---|---|
| `references/` | `core/mentions/` | Full rename — app, routes, serializers, views |
| `references/mention_sync.py` | `core/mentions/sync.py` | Renamed for consistency |
| `eln/models.py` (Mention model) | `core/mentions/models.py` | Mention model moved to the mentions app |
| `/api/references/...` | `/api/mentions/...` | API routes renamed |
| `eln/models.py` (no ContentVersion, EntryLock) | `eln/models.py` (with ContentVersion, EntryLock) | New models for auto-save pipeline |

---

## Internal Mod Directory Contract

Every mod follows this structure — both current core mods and future mods:

| Directory | Purpose | Required? |
|---|---|---|
| `index.ts` | All `register*()` calls — the single entry point Core loads during boot | ✅ Required |
| `types.ts` | Mod's TypeScript interfaces | ✅ Required |
| `api.ts` | Mod's backend API calls | If mod has API endpoints |
| `blocks/` | Content blocks registered via `registerBlock()` | If mod contributes editor blocks |
| `library/` | Card components registered via `registerLibraryItem()` | If mod appears in Library hub |
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
- **`@helix/core` npm package**: External mods will depend on `@helix/core`, which exports all registration functions, the registry, core types, and shared components (`MentionBadge`, `BaseCard`, `Breadcrumbs`, etc.).
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
| Console→Hub migration | Full rename + remove mutual-agreement pattern | Hubs are free-form pages; workspaces are plain routes. No shared panel layout to constrain design. |
| Hub config | Minimal (`id`, `label`, `icon`, `route`, `component`, `order`) | No `defaults`, `accepts`, or `workspaceTypes` — each hub manages its own internals |
| Workspace routing | Plain `registerRoute()` | No `registerWorkspace()`, no `consoleIds`, no `accepts`. Each mod owns its workspace URLs completely. |
| Library | Custom hub layout via `registerLibraryItem()` | Card-based List/Grid/Compact views, CSS-driven from same DOM. Not a shared panel pattern. |
| Editor blocks | `registerBlock()` with type-discriminated payload | Mods contribute blocks without importing from ELN. Slash menu auto-derives from registry. |
| Mention system | `core/mentions/` (frontend + backend), workspace-aware via LIMS registry | Single term across stack. Entity type registry in LIMS eliminates hardcoded type→URL branching. |
| Sidebar | Auto-populated from `registerHub()` | One registration, two effects (route + sidebar nav) |
| Standalone workspace | Workspace fetches own data | Different workspaces fetch different data shapes |
| Settings | Distributed — Settings mod owns shell, other mods register sections | Flexible, scalable |
| Mod-to-mod communication | Service registry (`registry.call()`) | No direct imports between mods |
| Slot system | Extends mod API with `declareSlot()` + `registerIntoSlot()` | Embedded UI extension; flat registrations stay for app-level concerns |
| Block lifecycle events | Framework-emitted on workspace bus, triple-dotted naming | Block authors never call `bus.emit()`; pit of success |
| Backend mod system | Django `INSTALLED_APPS` with `ModManifest` validation layer | Builds on Django, doesn't fight it |
| `BrowsableItem` location | `core/` | Importable by external mods via `@helix/core` |
| Migration strategy | Incremental per phase | No big-bang — each phase adopted by mods one at a time |
