# OpenScience — Console Architecture

> **Blueprint for the Console refactor.** Derived from a `/grill-with-docs` session on 2026-06-27, building on ADRs 0001–0004, the Ubiquitous Language, and the architecture review in `.docs/architecture-review-20260627.html`.
>
> This document is the single source of truth for the implementation phase. A fresh session should be able to read this and understand every architectural decision without referring back to the conversation.

---

## 1. The Console: Redefining the Three-Panel Pattern

### Why "Console" and not "Browser"

The term "Browser" collides with web browsers (Chrome, Firefox) and creates confusion in code reviews, documentation, and onboarding. **Console** is the canonical SaaS/product-design term for "the operational center where you browse, inspect, and work with items." Precedent: AWS Console, GCP Console, Stripe Dashboard.

### The Console in One Sentence

> The **Console** is a shell with named slots. It owns panel layout, view states (List → Detail → Expanded), and animations. Everything else — chrome components, item detail cards, workspaces — is injected through slots.

### The Three View States

| State | Master Panel | Detail Panel | Workspace Panel | User's Mental Model |
|-------|-------------|-------------|-----------------|-------------------|
| **List** | Full-width table | Hidden | Hidden | "I'm looking for something" |
| **Detail** | Shared-width table | Slides in from right | Hidden | "What is this thing?" |
| **Expanded** | Collapsed to thin strip (~40px) | Visible | Slides in from right | "I want to work with this" |

**Transitions are strict:** List → Detail → Expanded. Reverse: Expanded → Detail → List. Skipping states is not allowed. The Detail panel is the gateway to the Workspace.

---

## 2. Architecture: Three Cleanly Separated Concerns

| Concern | Who owns it | Where it lives (frontend) | Where it lives (backend) |
|---------|------------|---------------------------|--------------------------|
| **Panel shells + view state machine** | Console Core | `console/core/` | `core/` (shared BrowsableItem base, walker) |
| **Reusable chrome widgets** | Console Components | `console/components/` | — (frontend-only) |
| **Concrete console composition** | Console Instances | `console/instances/<name>/` | `console/<name>/` |
| **Detail + Workspace content** | Workspace Domains | `workspaces/<name>/` | `workspaces/<name>/` |
| **Cross-cutting references** | References | `components/` (ReferenceBadge) | `references/` |

### Design Principle: Items own Detail + Workspace; Chrome Components decorate the shell.

When a user clicks an Entry:
1. The **Item type** (Entry) dictates what renders in the Detail Panel and Workspace Panel
2. The **Console instance** (Library) dictates what chrome widgets decorate the shell (breadcrumbs, back-button, search)
3. The **Console Core** provides the panel layout, view state machine, and animations — it knows nothing about entries or breadcrumbs

---

## 3. Named Slots (the Console Shell API)

These are the canonical slot names. Every component registered into a Console targets one of these slots.

| Slot | Position | Multi? | Contract (Props Interface) | Purpose |
|------|----------|--------|---------------------------|---------|
| `header` | Above the three-panel layout | Yes (ordered stack) | `{ path, onNavigate, ...browserInstance }` | Breadcrumbs, action buttons, search filters |
| `master.table` | Master panel body | No (single) | Item-type dependent | The primary item table |
| `master.toolbar` | Inside master panel, above table | Yes (ordered stack) | `{ selectedItems, ...actions }` | Filter chips, bulk actions |
| `master.footer` | Inside master panel, below table | Yes (ordered stack) | `{ hasMore, onLoadMore, loadingMore }` | Pagination, load-more, status bar |
| `detail.card` | Detail panel body | No (single) | Item-type dependent | Item summary card — owned by the workspace domain |
| `workspace.content` | Workspace panel body | No (single) | Item-type dependent | Full work surface — owned by the workspace domain |
| `workspace.header-left` | Top-left of workspace panel | Yes (ordered stack) | `{ item, ...workspaceContext }` | Back button, item title |
| `workspace.header-right` | Top-right of workspace panel | Yes (ordered stack) | `{ item, ...workspaceContext }` | Save status indicator, dedicated-link, extra actions |

### Multi vs. Single

- **Multi slots** accept an ordered list of components. They render in registration order (top-to-bottom or left-to-right).
- **Single slots** accept exactly one component. They render the component that matches the current item type.

### Item-Driven Slots vs. Chrome Slots

| Slot | Driven by |
|------|-----------|
| `detail.card` | **Item type** — Entry → ElnDetailCard, Entity → LimsDetailCard |
| `workspace.content` | **Item type** — Entry → ElnWorkspace, Entity → EntityWorkspace |
| `header`, `master.toolbar`, `master.footer`, `workspace.header-left`, `workspace.header-right` | **Console instance composition** — Library declares `[Breadcrumbs, NewDropdown]` in header |

---

## 4. Component Contract Pattern

Chrome components receive their context via **props**, not hooks. This keeps contracts explicit, testable in isolation, and type-checked.

```tsx
// Example: Breadcrumbs component
interface BreadcrumbsProps {
  /** Current folder path, e.g. "/Experiments/Q1" */
  path: string;
  /** Navigate to a path segment */
  onNavigate: (path: string) => void;
  /** Navigate to parent folder */
  onUp: () => void;
}

function Breadcrumbs({ path, onNavigate, onUp }: BreadcrumbsProps) {
  // Pure component — no Console context dependency
  // Can be tested by passing mock props
}

// In the Console instance, the page wires:
<ConsolePage
  slots={{
    header: [
      <Breadcrumbs path={currentPath} onNavigate={navigateToPath} onUp={navigateUp} />,
      <NewDropdown currentPath={currentPath} currentFolderId={folderId} onCreated={refetch} />,
    ],
  }}
/>
```

### Why Props Over Hooks

1. **Testability** — Render `<Breadcrumbs path="/foo" onNavigate={jest.fn()} onUp={jest.fn()} />` in a unit test. No provider wrapping needed.
2. **Explicit contract** — The component's signature IS its documentation. You know exactly what it needs.
3. **Plugin-ready** — A plugin's component receives the same props interface. No need to teach plugins about internal context shapes.

---

## 5. Full Folder Structure

### Frontend (`frontend/src/`)

```
frontend/src/
├── console/                          ← The Console pattern (was: components/browser/)
│   │
│   ├── core/                         ← Panel shells, view state machine, provider
│   │   ├── ConsolePage.tsx           ← Three-panel layout shell with named slots
│   │   ├── ConsoleProvider.tsx       ← View state context (was: BrowserProvider)
│   │   ├── ConsoleMasterPanel.tsx    ← Master panel table wrapper
│   │   ├── ConsoleDetailPanel.tsx    ← Detail panel shell with action buttons
│   │   ├── ConsoleWorkspacePanel.tsx ← Workspace panel shell with header
│   │   ├── ConsoleCollapsedStrip.tsx ← Thin strip when master is collapsed
│   │   ├── useConsoleView.ts         ← View state machine hook (was: useBrowserView)
│   │   ├── __tests__/
│   │   │   ├── ConsolePage.test.tsx
│   │   │   ├── ConsoleCollapsedStrip.test.tsx
│   │   │   ├── ConsoleDetailPanel.test.tsx
│   │   │   ├── ConsoleWorkspacePanel.test.tsx
│   │   │   └── useConsoleView.test.tsx
│   │   └── README.md                 ← Explains the Console pattern, view states, slot system
│   │
│   ├── components/                   ← Reusable chrome widgets (shared across console instances)
│   │   ├── Breadcrumbs.tsx
│   │   ├── BackButton.tsx
│   │   ├── SearchBar.tsx
│   │   ├── __tests__/
│   │   │   ├── Breadcrumbs.test.tsx
│   │   │   └── BackButton.test.tsx
│   │   └── README.md                 ← Explains chrome components, slot contracts, props interfaces
│   │
│   └── instances/                    ← Concrete console instances (was: pages/ + inline composition)
│       ├── library/
│       │   ├── LibraryConsole.tsx     ← Composes ConsolePage with slots (was: LibraryView.tsx)
│       │   ├── LibraryTable.tsx
│       │   ├── LibraryNewDropdown.tsx
│       │   ├── __tests__/
│       │   │   ├── LibraryConsole.test.tsx
│       │   │   ├── LibraryTable.test.tsx
│       │   │   └── LibraryNewDropdown.test.tsx
│       │   └── README.md             ← Library console: slot composition, items rendered, extension points
│       │
│       └── lims/
│           ├── LimsConsole.tsx        ← Composes ConsolePage with slots (was: LimsList.tsx)
│           ├── LimsTable.tsx
│           ├── __tests__/
│           │   └── LimsConsole.test.tsx
│           └── README.md             ← LIMS console: slot composition, items rendered, extension points
│
├── workspaces/                       ← Item-driven content: detail cards + workspace surfaces
│   ├── _template/
│   │   └── README.md                 ← Template for creating new workspace domains
│   │
│   ├── core/                         ← Shared workspace infrastructure
│   │   ├── WorkspaceShell.tsx        ← Shared workspace chrome (back button, header, slot definitions)
│   │   ├── __tests__/
│   │   └── README.md                 ← Explains workspace contracts, dedicated URLs, embedding
│   │
│   ├── eln/                          ← Entry items: everything about the ELN workspace
│   │   ├── ElnDetailCard.tsx         ← Summary card for Detail panel (was: LibraryDetailCard.tsx)
│   │   ├── ElnWorkspace.tsx          ← TipTap editor surface (was: ElnEditor.tsx + LibraryMoreDetailPanel.tsx)
│   │   ├── __tests__/
│   │   │   ├── ElnDetailCard.test.tsx
│   │   │   └── ElnWorkspace.test.tsx
│   │   └── README.md                 ← ELN workspace: slots filled, dedicated URL, editor state machine
│   │
│   └── lims/                         ← Entity items: everything about the LIMS workspace
│       ├── LimsDetailCard.tsx        ← Summary card for Detail panel
│       ├── EntityWorkspace.tsx       ← Tabbed detail view (Activity, Insights, Storage)
│       ├── __tests__/
│       │   ├── LimsDetailCard.test.tsx
│       │   └── EntityWorkspace.test.tsx
│       └── README.md                 ← LIMS workspace: slots filled, dedicated URL, tab structure
│
├── pages/                            ← Thin route-entry pages, standalone pages
│   ├── ElnDetail.tsx                 ← Dedicated URL /eln/:id (standalone workspace)
│   ├── ElnNew.tsx                    ← New entry creation page
│   └── settings/
│       ├── SettingsPage.tsx
│       ├── ColumnEditor.tsx
│       ├── DangerZone.tsx
│       ├── TypeDetailPanel.tsx
│       ├── TypeMasterPanel.tsx
│       └── __tests__/
│
├── components/                       ← Non-console, non-workspace shared UI
│   ├── ReferenceBadge.tsx
│   ├── ReferenceBadgeCellRenderer.tsx
│   ├── ReferenceNode.tsx
│   ├── ReferenceProvider.tsx
│   ├── ContentPreview.tsx
│   ├── EntityDetailFields.tsx
│   ├── Layout.tsx                    ← App shell: nav bar, search, routing outlet
│   └── __tests__/
│
├── types/                            ← TypeScript interfaces
│   ├── console.ts                    ← ViewState, slot interfaces (was: browser.ts)
│   ├── eln.ts
│   ├── library.ts
│   ├── lims.ts
│   └── references.ts
│
├── api/                              ← API client functions
│   ├── client.ts                     ← Base HTTP client
│   └── library.ts                    ← Library API calls
│
├── hooks/                            ← Shared hooks (non-console)
│   └── useContentPreview.ts
│
├── extensions/                       ← TipTap extensions (prose mirror nodes)
│   ├── LimsTable.ts
│   ├── Reference.ts
│   ├── ReferenceSuggestion.ts
│   └── SlashCommands.ts
│
├── App.tsx                           ← Top-level routing + BrowserProvider → ConsoleProvider
├── main.tsx                          ← React entry point
├── styles.css
└── test-setup.ts
```

### Backend (`backend/`)

```
backend/
├── core/                             ← Shared foundation
│   ├── abstracts.py                  ← BrowsableItem abstract base (display_id, created_at, created_by)
│   ├── walker.py                     ← Tree walker (depth-first TipTap JSON traversal)
│   ├── management/
│   │   └── commands/
│   │       └── seed_data.py
│   ├── migrations/
│   ├── tests/
│   │   ├── test_abstracts.py
│   │   └── test_walker.py
│   └── README.md                     ← Shared base classes, walker, display ID generation
│
├── workspaces/
│   ├── eln/                          ← Entry workspace: models, views, sync, parser (was: backend/eln/)
│   │   ├── models.py                 ← NotebookEntry (inherits BrowsableItem)
│   │   ├── serializers.py
│   │   ├── views.py
│   │   ├── urls.py
│   │   ├── sync.py                   ← Content sync pipeline (mentions + entities)
│   │   ├── parser.py                 ← Mention parser
│   │   ├── migrations/
│   │   ├── tests/
│   │   │   ├── test_api.py
│   │   │   ├── test_parser.py
│   │   │   └── test_sync.py
│   │   └── README.md                 ← ELN workspace: Entry model, sync pipeline, API endpoints
│   │
│   └── lims/                         ← Entity workspace: models, views, services (was: backend/lims/)
│       ├── models.py                 ← Entity, EntityType (inherits BrowsableItem)
│       ├── serializers.py
│       ├── views.py
│       ├── urls.py
│       ├── services.py               ← Entity sync, column schema handling
│       ├── migrations/
│       ├── tests/
│       │   ├── test_api.py
│       │   ├── test_models.py
│       │   └── test_services.py
│       └── README.md                 ← LIMS workspace: Entity model, column schema, API endpoints
│
├── console/
│   └── library/                      ← Library console: folder browsing views (was: backend/library/)
│       ├── views.py                  ← FolderViewSet, path-based browsing
│       ├── urls.py
│       ├── tests/
│       │   └── test_api.py
│       └── README.md                 ← Library console: folder browsing, path resolution
│
├── references/                       ← Cross-cutting: mention resolution, PREFIX_MAP
│   ├── services.py                   ← Reference resolution, PREFIX_MAP
│   ├── views.py
│   ├── urls.py
│   ├── tests/
│   │   ├── test_api.py
│   │   └── test_services.py
│   └── README.md                     ← Reference system: mention resolution, prefix routing
│
├── config/                           ← Django project configuration
│   ├── settings.py
│   ├── urls.py                       ← Root URL configuration
│   ├── wsgi.py
│   └── __init__.py
│
├── manage.py
├── requirements.txt
└── Dockerfile.backend
```

### Frontend ↔ Backend Alignment

| Frontend | Backend | Relationship |
|----------|---------|-------------|
| `console/core/` | `core/` | Panel shells are frontend-only; BrowsableItem + walker are the shared foundation |
| `console/instances/library/` | `console/library/` | Library console composition → folder browsing views |
| `workspaces/eln/` | `workspaces/eln/` | ELN workspace domain → Entry models, sync, API |
| `workspaces/lims/` | `workspaces/lims/` | LIMS workspace domain → Entity models, API |
| `components/ReferenceBadge` | `references/` | Cross-cutting: mention display → resolution, PREFIX_MAP |

---

## 6. README Templates

Every domain folder gets a README. They follow consistent templates so a new developer (or modder) knows what to expect in every folder.

### Template: Console Core (`console/core/README.md`)

```markdown
# Console Core

The **Console** is the platform's canonical three-panel browsing-and-work pattern.
It provides a progressive-disclosure shell with named slots: List → Detail → Expanded.

## Architecture

The Console is a **shell with named slots**. It owns panel layout, view states,
and animations. Everything else is injected through slots:

| Concern | Who owns it | Where it lives |
|---------|------------|----------------|
| Panel shells, view state machine | Console core (here) | `console/core/` |
| Reusable chrome widgets | Console components | `console/components/` |
| Concrete console composition | Console instances | `console/instances/` |
| Detail + Workspace content | Workspace domains | `workspaces/` |

## The Three View States

| State | Master | Detail | Workspace | Transition |
|-------|--------|--------|-----------|------------|
| **List** | Full-width | Hidden | Hidden | Initial state |
| **Detail** | Shared-width | Slides in | Hidden | Click a row |
| **Expanded** | Collapsed strip | Visible | Slides in | Click expand |

## Named Slots

| Slot | Position | Multi? | Purpose |
|------|----------|--------|---------|
| `header` | Above three-panel layout | Yes | Breadcrumbs, buttons, filters |
| `master.table` | Master panel body | No | The item table |
| `master.toolbar` | Above/below table | Yes | Filter chips, bulk actions |
| `master.footer` | Below table | Yes | Pagination, load-more, status |
| `detail.card` | Detail panel body | No | Item summary card (workspace-owned) |
| `workspace.content` | Workspace panel body | No | Full work surface (workspace-owned) |
| `workspace.header-left` | Top-left of workspace | Yes | Back button, item title |
| `workspace.header-right` | Top-right of workspace | Yes | Save status, actions |

## How to Create a New Console Instance

1. Create `console/instances/<name>/` with a `README.md`
2. Wire `<ConsolePage>` with your slot composition
3. Register workspace domains for your item types

## How to Create a New Workspace

1. Copy `workspaces/_template/` → `workspaces/<name>/`
2. Implement `DetailCard` and `Workspace` components
3. Wire them into your Console instance's slot composition

## Files

| File | Purpose |
|------|---------|
| `ConsolePage.tsx` | Three-panel layout shell with named slots |
| `ConsoleProvider.tsx` | View state context shared across the console |
| `ConsoleMasterPanel.tsx` | Master panel table wrapper |
| `ConsoleDetailPanel.tsx` | Detail panel shell with action buttons |
| `ConsoleWorkspacePanel.tsx` | Workspace panel shell with dedicated-link header |
| `ConsoleCollapsedStrip.tsx` | Thin strip shown when master is collapsed |
| `useConsoleView.ts` | View state machine (List → Detail → Expanded) |

## Dependencies

- **Depends on:** React, React Router
- **Consumed by:** Every Console instance, every Workspace domain
```

### Template: Workspace Domain (`workspaces/<name>/README.md`)

```markdown
# <Workspace Name>

<!-- One sentence: what item type and what the user does here. -->
<!-- Example: "The rich-text editing workspace for ELN Entry items." -->

## Console Integration

Which Console slots does this workspace fill?

| Slot | Component | Description |
|------|-----------|-------------|
| `detail.card` | `<Name>DetailCard` | Summary metadata shown in the Detail panel |
| `workspace.content` | `<Name>Workspace` | Full work surface shown in the Workspace panel |
| `workspace.header-left` | — | (if used) |
| `workspace.header-right` | — | (if used) |

## Dedicated URL

`/<route>/:id` — standalone work surface (shareable, bookmarkable). The Console
embeds the same Workspace content in the Workspace Panel when in Expanded state.

## Slot Props Contract

### `<Name>DetailCard`
| Prop | Type | Description |
|------|------|-------------|
| `item` | `<ItemType>` | The selected item |
| `viewState` | `ViewState` | Current console view state |
| `onClose` | `() => void` | Close the detail panel |
| `onCollapse` | `() => void` | Collapse from expanded to detail |
| `isExiting` | `boolean` | Exit animation flag |

### `<Name>Workspace`
| Prop | Type | Description |
|------|------|-------------|
| `item` | `<ItemType>` | The selected item |
| `isExiting` | `boolean` | Exit animation flag |

## Files

| File | Purpose |
|------|---------|
| `<Name>DetailCard.tsx` | Summary card rendered in the Console Detail panel |
| `<Name>Workspace.tsx` | Full work surface rendered in the Console Workspace panel |

## Dependencies

- **Depends on:** `console/core` (panel shell contracts), `types/<name>`
- **Consumed by:** `console/instances/<console-name>`, `pages/<Name>Detail`

## Extending

<!-- How would a plugin/mod extend this workspace? -->
<!-- Example: "Plugins can inject action buttons into workspace.header-right via the console slot registry." -->
```

### Template: Console Instance (`console/instances/<name>/README.md`)

```markdown
# <Name> Console

<!-- One sentence: what this Console browses. -->
<!-- Example: "The Library Console — filesystem-like browsing of Folders and ELN Entries." -->

## Route

`/<route>` — with query params for state (`?path=`, `?search=`, `?select=`)

## Slot Composition

| Slot | Components | Description |
|------|-----------|-------------|
| `header` | `<Breadcrumbs>`, `<NewDropdown>` | Folder path breadcrumbs + "New Entry" button |
| `master.table` | `<LibraryTable>` | Mixed folder + entry table |
| `master.footer` | `<LoadMore>` | Pagination |
| `workspace.header-left` | `<BackButton>` | Collapse back to detail |

## Items Rendered

| Item Type | Row Behavior | Detail Card | Workspace |
|-----------|-------------|------------|-----------|
| `<Type1>` | Opens detail | `<Type1>DetailCard` | `<Type1>Workspace` |
| `<Type2>` | Navigates in | — | — |

## Files

| File | Purpose |
|------|---------|
| `<Name>Console.tsx` | Wire ConsolePage with slot composition, data fetching, state |
| `<Name>Table.tsx` | Master table row renderer |
| `<Name>NewDropdown.tsx` | "New item" creation button |

## Dependencies

- **Depends on:** `console/core` (ConsolePage, useConsoleView), workspace domains (detail cards, workspaces)
- **Consumed by:** `App.tsx` (routing)

## Extending

<!-- How to add a chrome component to this Console instance. -->
<!-- Example: "Add a component to the `header` slot array in <ConsolePage slots={...}>." -->
```

### Template: New Workspace (`workspaces/_template/README.md`)

```markdown
# <New Workspace>

<!-- Describe the item type and what the user does in this workspace. -->

## Quick Start

1. Copy this folder: `cp -r workspaces/_template workspaces/<name>`
2. Implement `<Name>DetailCard.tsx` — receives `{ item, viewState, onClose, onCollapse, isExiting }`
3. Implement `<Name>Workspace.tsx` — receives `{ item, isExiting }`
4. Add tests in `__tests__/`
5. Wire into a Console instance's slot composition
6. Add the dedicated URL route in `App.tsx`
7. Register in `workspaces/README.md` (index of all workspace domains)

## Console Integration

| Slot | Component | Description |
|------|-----------|-------------|
| `detail.card` | `<Name>DetailCard` | ... |
| `workspace.content` | `<Name>Workspace` | ... |

## Dedicated URL

`/<route>/:id`

## Files

| File | Purpose |
|------|---------|
| `<Name>DetailCard.tsx` | ... |
| `<Name>Workspace.tsx` | ... |
| `__tests__/` | Tests for both components |

## Dependencies

- **Depends on:** `console/core`
- **Consumed by:** `console/instances/<name>`, `pages/<Name>Detail`
```

---

## 7. Naming Migration: Complete Map

Every rename from the current codebase to the Console architecture:

### Frontend Renames

| Current Name | New Name | Reason |
|-------------|----------|--------|
| `BrowserPage` | `ConsolePage` | "Browser" → "Console" |
| `BrowserProvider` | `ConsoleProvider` | — |
| `BrowserMasterPanel` | `ConsoleMasterPanel` | — |
| `BrowserDetailPanel` | `ConsoleDetailPanel` | — |
| `BrowserWorkspacePanel` | `ConsoleWorkspacePanel` | — |
| `BrowserCollapsedStrip` | `ConsoleCollapsedStrip` | — |
| `useBrowserView` | `useConsoleView` | — |
| `types/browser.ts` | `types/console.ts` | — |
| `ViewState` (in browser.ts) | `ViewState` (in console.ts) | Type itself is unchanged |
| `BrowserContextValue` | `ConsoleContextValue` | — |
| `browser-page` CSS class | `console-page` | — |
| `browser-master-panel` CSS | `console-master-panel` | — |
| `browser-detail-panel` CSS | `console-detail-panel` | — |
| `browser-workspace-panel` CSS | `console-workspace-panel` | — |
| `browser-master-detail` CSS | `console-master-detail` | — |
| `browser-load-more` CSS | `console-load-more` | — |
| `components/browser/` | `console/core/` | — |
| `LibraryView.tsx` | `console/instances/library/LibraryConsole.tsx` | — |
| `LimsList.tsx` | `console/instances/lims/LimsConsole.tsx` | — |
| `LibraryBreadcrumbs.tsx` | `console/components/Breadcrumbs.tsx` | Shared, not library-specific |
| `LibraryDetailCard.tsx` | `workspaces/eln/ElnDetailCard.tsx` | Owned by ELN workspace |
| `LibraryMoreDetailPanel.tsx` | `workspaces/eln/ElnWorkspace.tsx` | Workspace content, not a "more detail panel" |
| `LimsDetailCard.tsx` | `workspaces/lims/LimsDetailCard.tsx` | Owned by LIMS workspace |
| `LimsMoreDetailPanel.tsx` | `workspaces/lims/EntityWorkspace.tsx` | Workspace content |
| `LibraryTable.tsx` | `console/instances/library/LibraryTable.tsx` | Console-instance specific |
| `LimsTableNode.tsx` | `extensions/` or stays | TipTap node extension |
| `LibraryNewDropdown.tsx` | `console/instances/library/LibraryNewDropdown.tsx` | Console-instance specific |

### Backend Renames

| Current Name | New Name | Reason |
|-------------|----------|--------|
| `backend/eln/` | `backend/workspaces/eln/` | ELN is a workspace domain |
| `backend/lims/` | `backend/workspaces/lims/` | LIMS is a workspace domain |
| `backend/library/` | `backend/console/library/` | Library is a console instance |
| `backend/core/` | `backend/core/` | Remains — shared foundation |
| `backend/references/` | `backend/references/` | Remains — cross-cutting |
| `backend/config/` | `backend/config/` | Remains |

### Django Settings Impact

```python
# config/settings.py — INSTALLED_APPS changes
INSTALLED_APPS = [
    # Before
    # 'core',
    # 'eln',
    # 'library',
    # 'lims',
    # 'references',

    # After
    'core',
    'workspaces.eln',
    'workspaces.lims',
    'console.library',
    'references',
]
```

All internal imports (models, serializers, views) update from:
- `from eln.models import ...` → `from workspaces.eln.models import ...`
- `from lims.services import ...` → `from workspaces.lims.services import ...`
- `from library.views import ...` → `from console.library.views import ...`

---

## 8. Plugin / Modding API Readiness

This architecture establishes the two clear extension points for a future modding API:

### Extension Point 1: New Item Type (Workspace Domain)

A plugin that adds a new item type (e.g., DNA Sequence, Protocol, Plate):

1. Inherit from `BrowsableItem` (backend — display ID, created_at, created_by)
2. Create `workspaces/<name>/` with `DetailCard` and `Workspace` components
3. The Console shell renders the item's detail card and workspace automatically based on item type

**What the plugin does NOT need to do:**
- Rebuild panel layout
- Rewrite the view state machine
- Handle animation timings
- Create a new Console instance (reuses existing one)

### Extension Point 2: Chrome Component (Console Slot)

A plugin that adds a UI widget (e.g., Audit Trail button, "Add to Favorites" action):

1. Implement a React component matching the slot's props contract
2. Register into a Console instance's named slot (e.g., `workspace.header-right`)

**What the plugin does NOT need to do:**
- Know about view states
- Know about panel layout
- Know about other components in the same slot

### Future Work: Formal Registry

When the plugin system ships, replace inline slot arrays with a registry:

```tsx
// Current (declarative, inline)
<ConsolePage slots={{ header: [Breadcrumbs, NewDropdown] }} />

// Future (registry + extensions)
// Plugins call: consoleRegistry.extend("library", "header", AuditTrailButton)
// ConsolePage reads: consoleRegistry.getSlot("library", "header")
```

The declarative slot composition in this design is the foundation. The registry is an additive layer, not a rewrite.

---

## 9. What This Document Supersedes

| Document | Status |
|----------|--------|
| `.docs/browser-pattern-terms.md` | **Superseded.** Replace "Browser" with "Console", update slot names. |
| `docs/adr/0004-unified-browser-pattern.md` | **Partially superseded.** The shared component design remains valid; the naming and folder structure are updated by this document. |
| `UBIQUITOUS_LANGUAGE.md` | **Needs update.** Replace "Browser" with "Console" throughout. Add "Console instance", "Chrome component", "Slot" terms. |
| `CONTEXT.md` | **Needs update.** Browser → Console. |
| `.docs/architecture-review-20260627.html` | **Unchanged.** The deepening candidates (ElnEditor split, transaction atomicity, CSS duplication) remain valid and are implementation tasks, not architectural changes. |

---

## 10. Implementation Order

Recommended phases for the `improve-coding-architecture` pass:

1. **Rename Console Core** — `browser/` → `console/core/`, all `Browser*` → `Console*`, `types/browser.ts` → `types/console.ts`, CSS classes
2. **Create folder structure** — Scaffold `console/components/`, `console/instances/`, `workspaces/`, `workspaces/_template/`
3. **Move workspace domains** — `LibraryDetailCard` → `workspaces/eln/ElnDetailCard`, `LibraryMoreDetailPanel` → `workspaces/eln/ElnWorkspace`, etc.
4. **Move console instances** — `LibraryView` → `console/instances/library/LibraryConsole`, `LimsList` → `console/instances/lims/LimsConsole`
5. **Extract chrome components** — `LibraryBreadcrumbs` → `console/components/Breadcrumbs` (generic)
6. **Backend restructure** — Move `eln/` → `workspaces/eln/`, `lims/` → `workspaces/lims/`, `library/` → `console/library/`, update imports and `INSTALLED_APPS`
7. **Write READMEs** — One per domain folder following the templates in §6
8. **Update domain docs** — `UBIQUITOUS_LANGUAGE.md`, `CONTEXT.md`
9. **Verify** — All tests pass, app runs, no broken imports

Each phase should be its own commit, passing tests independently.

---

*Generated 2026-06-27 from a `/grill-with-docs` session. This document is the implementation blueprint.*
