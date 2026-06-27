# PRD-10: Unified Browser Pattern — Shared Components and Backend Base

**Status:** `ready-for-agent`
**Date:** 2026-06-27

## Problem Statement

The platform has two browsing surfaces — the **Library** (filesystem-like browsing of Folders and ELN Entries at `/library`) and **LIMS** (database-like browsing of Entities at `/lims`). Both implement the same progressive-disclosure UI pattern (List → Detail → Expanded) with three panels (Master, Detail, Workspace). Despite sharing this pattern, they are implemented as **near-duplicate code with no shared abstraction**.

The concrete duplication:

| Duplicated artifact | LIMS copy | Library copy | Difference |
|---------------------|-----------|--------------|------------|
| View state context | `LimsViewContext.tsx` | `LibraryViewContext.tsx` | Name only (28 lines each, identical logic) |
| Collapsed strip | `LimsCollapsedStrip.tsx` | `LibraryCollapsedStrip.tsx` | CSS class + title string (19 lines each) |
| Detail card | `LimsDetailCard.tsx` | `LibraryDetailCard.tsx` | Same structure, different field lists |
| More detail / expanded panel | `LimsMoreDetailPanel.tsx` | `LibraryMoreDetailPanel.tsx` | Tabbed placeholder vs embedded editor |
| View state machine | Inline in `LimsList.tsx` | Inline in `LibraryView.tsx` | Identical transitions + animation timings |
| CSS animations | `lims-slide-in` etc. | `library-slide-in` etc. | Same keyframes, different class names |

The `ViewState` type (`"list" | "detail" | "expanded"`) lives in the LIMS types file and is **imported by Library code** — making the Library formally dependent on the LIMS module for its core UI state type.

**Risk:** Working on one browser (e.g., adding a feature to Library) can silently break the other because there is no shared test suite. Adding a third browser (Protocols, Plates) under the current structure would create a third copy of every component.

## Solution

Extract the three-panel browser pattern into **shared frontend components**, a **shared frontend hook**, and a **shared backend abstract base class** — while keeping the `lims/`, `library/`, and `eln/` Django apps as separate modules.

### Frontend: Shared `browser/` component library

Extract five shared artifacts from the duplicated pairs:

```
frontend/src/components/browser/
├── BrowserProvider.tsx          ← replaces LimsViewContext + LibraryViewContext
├── BrowserMasterPanel.tsx       ← shared table wrapper with selection + pagination
├── BrowserDetailPanel.tsx       ← shared detail card shell (header, field list, actions)
├── BrowserWorkspacePanel.tsx    ← shared workspace shell (header bar, slot, dedicated URL)
├── BrowserCollapsedStrip.tsx    ← replaces LimsCollapsedStrip + LibraryCollapsedStrip
└── useBrowserView.ts            ← shared View State machine hook
```

The `ViewState` type moves from `types/lims.ts` to a new `types/browser.ts`.

Domain-specific content is injected via **slots** (React children / render props):
- `BrowserDetailPanel` accepts a `fields` array and optional `properties`/`children` — LIMS passes entity metadata, Library passes entry metadata
- `BrowserWorkspacePanel` accepts `children` — LIMS renders tabbed detail, Library renders ElnEditor, plugins render custom surfaces
- `BrowserMasterPanel` accepts column definitions and row renderers — each browser defines its own columns

### Backend: Shared `BrowsableItem` abstract base

Extract a shared abstract base class for models that can appear as rows in a Master table:

```python
# backend/core/abstracts.py
class BrowsableItem(models.Model):
    display_id = CharField(max_length=50, unique=True, editable=False)
    created_at = DateTimeField(auto_now_add=True)
    created_by = ForeignKey(User, null=True, on_delete=CASCADE)

    class Meta:
        abstract = True

    def generate_display_id(self, prefix: str) -> str: ...
```

`NotebookEntry` and `Entity` both inherit from `BrowsableItem`, gaining shared display ID generation, common fields, and a uniform interface for the reference resolution system.

### Terminology

All ad-hoc names ("three-step fold," "collapsed strip," "more detail panel," "LIMS three-step fold") are replaced with the canonical terms established in [CONTEXT.md](../CONTEXT.md) and [.docs/browser-pattern-terms.md](browser-pattern-terms.md):

- **Master Panel** (was: left panel, table panel, collapsed strip)
- **Detail Panel** (was: middle panel, summary card, detail card)
- **Workspace Panel** (was: right panel, more detail panel, expanded panel, editor panel)
- **List / Detail / Expanded** (formalized View States)
- **Item** (was: row, entity-or-entry, record)
- **Browser** (was: "the LIMS three-step fold" / "the Library page")

## Domain Glossary References

This PRD uses the canonical terminology from:
- [CONTEXT.md](../CONTEXT.md) — full domain glossary (Browser Pattern, Library, LIMS, Item types)
- [.docs/browser-pattern-terms.md](browser-pattern-terms.md) — quick-reference terminology doc for implementers
- [docs/adr/0004-unified-browser-pattern.md](../docs/adr/0004-unified-browser-pattern.md) — full rationale for the unification decision, rejected alternatives, and testing strategy

## User Stories

### Shared Infrastructure (Developer-Facing)

1. As a developer, I want a single `useBrowserView` hook that manages the View State machine (List → Detail → Expanded → Detail → List), so that both LIMS and Library use identical state transitions and I only fix bugs once.

2. As a developer, I want a single `BrowserProvider` context component that wraps each browser page, so that the View State is lifted into context and the Layout nav bar can react to it (e.g., hiding search in Expanded state) without per-browser wiring.

3. As a developer, I want a single `BrowserCollapsedStrip` component that renders the thin vertical strip with an expand button, so that I don't maintain two 19-line copies that differ only in CSS class names.

4. As a developer, I want a `BrowserDetailPanel` shell component that renders a header (with badge, title, expand/collapse/close buttons) and a configurable field list, so that both LIMS and Library detail cards share the same layout, animation, and button behavior.

5. As a developer, I want a `BrowserWorkspacePanel` shell component that provides a header bar and a content slot, so that the Workspace container (header, close/collapse, dedicated URL link) is consistent across all Item types.

6. As a developer, I want a `BrowserMasterPanel` component that handles the table wrapper, row selection state, and pagination ("Load More"), so that each browser only defines its columns and row renderers.

7. As a developer, I want the `ViewState` type to live in a shared `types/browser.ts` file, so that Library no longer imports its core UI type from the LIMS module.

8. As a developer, I want a `BrowsableItem` abstract Django model that provides `display_id`, `created_at`, `created_by`, and `generate_display_id()`, so that `NotebookEntry` and `Entity` share display ID generation logic and I don't fix the string-sorting bug twice.

9. As a developer, I want the shared browser CSS (panel layout, slide animations, collapsed strip, tab bar) to live in a single stylesheet or CSS module, so that both browsers get the same visual treatment and animation timing.

### LIMS Browser (Entity Browsing)

10. As a lab researcher, I want the LIMS browser at `/lims` to work exactly as it did before — entity table, search, type filter, Detail card, Expanded Workspace with tabbed detail — so that the refactoring is invisible to me.

11. As a lab researcher, I want clicking an entity row to open the Detail panel showing entity metadata (display ID badge, name, type, created date, creator, source entry), so that I can inspect entities at a glance.

12. As a lab researcher, I want the LIMS Workspace panel to show a tabbed detail view (Properties, Activity placeholder, Insights placeholder, Storage placeholder), so that I can drill into entity details.

### Library Browser (Folder + Entry Browsing)

13. As a lab researcher, I want the Library browser at `/library` to work exactly as it did before — mixed folder/entry table, breadcrumbs, Detail card with content preview, Expanded Workspace with embedded editor — so that the refactoring is invisible to me.

14. As a lab researcher, I want clicking a folder row to navigate into that folder (updating the path and reloading the table), so that folder navigation is unchanged.

15. As a lab researcher, I want clicking an entry row to open the Detail panel showing entry metadata (display ID badge, title, type, created date, author, folder, content preview), so that I can preview entries without opening the editor.

16. As a lab researcher, I want the Library Workspace panel to contain the full ElnEditor in embedded mode, so that I can edit entries inline.

17. As a lab researcher, I want the `+` dropdown button to create new Folders and new ELN Entries in the current path, so that content creation is unchanged.

### Regression Prevention

18. As a developer, I want the shared View State machine to have its own unit test suite (transitions, invalid state prevention, animation timers), so that changing the state machine doesn't silently break either browser.

19. As a developer, I want each shared component to have its own render tests, so that I can refactor the shared components with confidence.

20. As a developer, I want each browser to retain its existing integration tests (or gain new ones), so that adding a feature to LIMS doesn't break Library and vice versa.

21. As a developer, I want the `BrowsableItem` abstract base to have its own test suite (display ID generation, per-prefix counters, gap-tolerant sequencing), so that display ID logic is verified once, not once per model.

22. As a developer, I want the existing backend API tests for LIMS and ELN to continue passing after models inherit from `BrowsableItem`, so that the backend refactoring has zero API-visible impact.

## Implementation Decisions

### Decision 1: Terminology Lock-In

All code, comments, file names, CSS classes, and test descriptions use the canonical terms from [.docs/browser-pattern-terms.md](browser-pattern-terms.md). The old names are deprecated:

| Old Name | Canonical Replacement |
|----------|----------------------|
| `LimsCollapsedStrip` | `BrowserCollapsedStrip` |
| `LibraryCollapsedStrip` | `BrowserCollapsedStrip` |
| `LimsViewContext` / `LibraryViewContext` | `BrowserProvider` |
| `LimsDetailCard` / `LibraryDetailCard` | Uses `BrowserDetailPanel` shell |
| `LimsMoreDetailPanel` / `LibraryMoreDetailPanel` | Uses `BrowserWorkspacePanel` shell |
| `lims-slide-in` / `library-slide-in` | `browser-slide-in` |
| "three-step fold" | "three-panel browser" or "Master/Detail/Workspace" |
| `ViewState` (in `lims.ts`) | `ViewState` (in `browser.ts`) |

### Decision 2: Shared Hook — `useBrowserView`

A single hook owns the View State machine:

```typescript
// types/browser.ts
type ViewState = "list" | "detail" | "expanded";

// components/browser/useBrowserView.ts
function useBrowserView() {
  const [viewState, setViewState] = useState<ViewState>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const goToDetail = (id: string) => { setSelectedId(id); setViewState("detail"); };
  const goToExpanded = (id: string) => { setSelectedId(id); setViewState("expanded"); };
  const collapseFromExpanded = () => { setIsExiting(true); setTimeout(() => { setViewState("detail"); setIsExiting(false); }, 250); };
  const closeAll = () => { setIsExiting(true); setTimeout(() => { setViewState("list"); setSelectedId(null); setIsExiting(false); }, 250); };
  const expandMaster = () => { setViewState("detail"); };

  return { viewState, selectedId, isExiting, goToDetail, goToExpanded, collapseFromExpanded, closeAll, expandMaster };
}
```

State transitions enforced:
- `list` → `detail` (goToDetail) or `list` → `expanded` (goToExpanded — via row `>` button)
- `detail` → `expanded` (goToExpanded)
- `expanded` → `detail` (collapseFromExpanded, with exit animation delay)
- `detail` → `list` (closeAll, with exit animation delay)
- `expanded` → `list` (closeAll, with exit animation delay)

No skipping: you cannot go `list` → `expanded` without also setting `selectedId`. The `selectedId` guards the Detail and Workspace panels from rendering without a selection.

### Decision 3: Shared Context — `BrowserProvider`

Wraps each browser page and provides `viewState` to the Layout nav bar (for hiding search in Expanded state). Replaces the two identical context files.

```typescript
// components/browser/BrowserProvider.tsx
const BrowserContext = createContext<BrowserContextValue | null>(null);

function BrowserProvider({ children }: { children: ReactNode }) {
  const browser = useBrowserView();
  return <BrowserContext.Provider value={browser}>{children}</BrowserContext.Provider>;
}

function useBrowser(): BrowserContextValue {
  const ctx = useContext(BrowserContext);
  if (!ctx) return { viewState: "list", setViewState: () => {} }; // safe fallback
  return ctx;
}
```

Each browser page (`LimsList`, `LibraryView`) wraps its content in `<BrowserProvider>`. The Layout component reads from `useBrowser()` instead of `useLimsView()` or `useLibraryView()`.

### Decision 4: Shared Component — `BrowserCollapsedStrip`

Replaces the two 19-line copies with a single component:

```typescript
interface BrowserCollapsedStripProps {
  onExpand: () => void;
  title?: string; // e.g., "Expand entity list" vs "Back to detail"
}

function BrowserCollapsedStrip({ onExpand, title = "Expand list" }: BrowserCollapsedStripProps) {
  return (
    <div className="browser-collapsed-strip">
      <button className="browser-collapsed-strip-btn" onClick={onExpand} title={title}>&gt;</button>
    </div>
  );
}
```

CSS class: `browser-collapsed-strip` / `browser-collapsed-strip-btn` (was `lims-collapsed-strip` and `library-collapsed-strip`).

### Decision 5: Shared Component — `BrowserDetailPanel`

A shell component that renders the detail card structure. Each browser passes its own field definitions and optional children:

```typescript
interface DetailField {
  label: string;
  value: ReactNode; // string, ReferenceBadge, or any React node
}

interface BrowserDetailPanelProps {
  badge: ReactNode;              // ReferenceBadge for the item
  title: string;                 // item name/title
  fields: DetailField[];         // metadata field rows
  viewState: ViewState;
  onClose: () => void;
  onExpand?: () => void;         // Detail → Expanded
  onCollapse?: () => void;       // Expanded → Detail
  isExiting?: boolean;           // for exit animation
  children?: ReactNode;          // slot below fields (e.g., ContentPreview, properties table)
}
```

The component renders:
1. Header: badge + title + action buttons (`>`, `<`, `×` — visibility depends on `viewState`)
2. Field list: each `DetailField` rendered as a label/value row
3. Children slot: any additional content (ContentPreview for entries, properties table for entities)

LIMS detail card: passes entity fields (Type, Created, By, Source Entry) + properties table as children.
Library detail card: passes entry fields (Type, Created, Author, Folder, Updated) + ContentPreview as children.

**Important:** The Detail panel's content (fields + children) is browser-specific. The shell only provides the header, layout, animation, and button behavior. The existing `LimsDetailCard.tsx` and `LibraryDetailCard.tsx` are refactored to use this shell, not deleted — they compose with `BrowserDetailPanel` and pass their domain-specific content.

### Decision 6: Shared Component — `BrowserWorkspacePanel`

A shell component that provides the Workspace container:

```typescript
interface BrowserWorkspacePanelProps {
  title: string;                 // item name for the header
  dedicatedUrl?: string;         // e.g., "/eln/E12" or "/lims/BLOOD1"
  onClose: () => void;
  onCollapse: () => void;
  isExiting?: boolean;
  children: ReactNode;           // the work surface content (editor, tabbed detail, plugin)
}
```

The component renders:
1. Header bar: item title, dedicated URL link (opens in new tab / navigates), close button, collapse button
2. Content slot: `{children}`

For the Library: children = `<ElnEditor entryId={id} embedded />`.
For LIMS: children = tabbed detail view (Properties/Activity/Insights/Storage tabs).

**Future plugin extension:** A plugin registers a Workspace component for its Item type. `BrowserWorkspacePanel` renders it in the children slot — the plugin doesn't need to know about panel layout, animations, or header bars.

### Decision 7: Shared Component — `BrowserMasterPanel`

A table wrapper that handles selection, "Load More" pagination, and column rendering:

```typescript
interface MasterColumn<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  width?: string;
}

interface BrowserMasterPanelProps<T> {
  items: T[];
  columns: MasterColumn<T>[];
  selectedId?: string | null;
  onRowClick: (item: T) => void;
  onRowExpand?: (item: T) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  emptyMessage?: string;
  getItemId: (item: T) => string;
  isFolderRow?: (item: T) => boolean;  // folders navigate instead of opening Detail
  onFolderClick?: (item: T) => void;
}
```

The component renders:
1. A `<table>` with configurable columns
2. Row click → `onRowClick` (Detail) or `onFolderClick` (navigate)
3. Expand button (`>`) on each row → `onRowExpand` (jump to Expanded)
4. "Load More" button when `hasMore` is true
5. Loading state and empty state messages
6. Selected row highlighting via `selectedId`

Each browser defines its own columns array:
- LIMS: ID (ReferenceBadge), Name, Type, Created, Source, expand button
- Library: ID (ReferenceBadge), Name, Type, Created, Folder, expand button

### Decision 8: CSS Consolidation

All browser panel CSS is consolidated under a single `browser-` prefix. Existing `lims-` and `library-` CSS classes are replaced:

| Old Class | New Class |
|-----------|-----------|
| `.lims-master-detail` / `.library-master-detail` | `.browser-master-detail` |
| `.lims-master-panel` / `.library-master-panel` | `.browser-master-panel` |
| `.lims-detail-panel` / `.library-detail-panel` | `.browser-detail-panel` |
| `.lims-detail-card` / `.library-detail-card` | `.browser-detail-card` |
| `.lims-more-detail-panel` / `.library-more-detail-panel` | `.browser-workspace-panel` |
| `.lims-collapsed-strip` / `.library-collapsed-strip` | `.browser-collapsed-strip` |
| `@keyframes lims-slide-in` / `library-slide-in` | `@keyframes browser-slide-in` |
| `@keyframes lims-slide-out-right` | `@keyframes browser-slide-out-right` |

**Animation note:** The CSS animations (`browser-slide-in`, `browser-slide-out-right`) are preserved but considered provisional. A separate feature will revisit animations holistically — exact timing, easing curves, and enter/exit coordination. For this PRD, animations use the existing 250ms timing and manual `setTimeout` exit-delay pattern. Do not spend effort perfecting animations; functional parity with the current behavior is sufficient.

### Decision 9: Backend — `BrowsableItem` Abstract Base

A new abstract Django model in `backend/core/abstracts.py`:

```python
class BrowsableItem(models.Model):
    display_id = models.CharField(max_length=50, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey("core.User", null=True, on_delete=models.CASCADE)

    class Meta:
        abstract = True

    def generate_display_id(self, prefix: str) -> str:
        """Auto-generate a gap-tolerant, per-prefix sequential display ID."""
        last = type(self).objects \
            .filter(display_id__startswith=prefix) \
            .annotate(id_len=Length("display_id")) \
            .order_by("-id_len", "-display_id") \
            .values_list("display_id", flat=True) \
            .first()
        next_num = int(last[len(prefix):]) + 1 if last else 1
        return f"{prefix}{next_num}"
```

`NotebookEntry` and `Entity` are refactored to inherit from `BrowsableItem`:
- Remove duplicate `display_id`, `created_at`, `created_by` field definitions from both models
- Remove duplicate `generate_display_id` logic from both `save()` methods
- Both models keep their own `Meta` class, other fields, and relationships

**No database migration is required** — the abstract base is code-level sharing only (Django `abstract=True`). The existing database tables keep all their columns. This is purely a Python-level deduplication.

### Decision 10: Existing Components — Refactor, Don't Rewrite

The existing domain-specific components are refactored to compose with the shared shells, not deleted:

| Existing File | Action |
|--------------|--------|
| `LimsDetailCard.tsx` | Refactored to use `<BrowserDetailPanel>` internally; still exports `LimsDetailCard` |
| `LibraryDetailCard.tsx` | Refactored to use `<BrowserDetailPanel>` internally; still exports `LibraryDetailCard` |
| `LimsMoreDetailPanel.tsx` | Refactored to use `<BrowserWorkspacePanel>` internally; still exports `LimsMoreDetailPanel` |
| `LibraryMoreDetailPanel.tsx` | Refactored to use `<BrowserWorkspacePanel>` internally; still exports `LibraryMoreDetailPanel` |
| `LimsList.tsx` | Wraps content in `<BrowserProvider>`, uses `useBrowserView`, delegates table to `<BrowserMasterPanel>` |
| `LibraryView.tsx` | Wraps content in `<BrowserProvider>`, uses `useBrowserView`, delegates table to `<BrowserMasterPanel>` |
| `LimsViewContext.tsx` | **Deleted** — replaced by `BrowserProvider` |
| `LibraryViewContext.tsx` | **Deleted** — replaced by `BrowserProvider` |
| `LimsCollapsedStrip.tsx` | **Deleted** — replaced by `BrowserCollapsedStrip` |
| `LibraryCollapsedStrip.tsx` | **Deleted** — replaced by `BrowserCollapsedStrip` |

### Decision 11: No Functional Changes to Either Browser

This PRD is a **pure refactoring** — the user-visible behavior of both browsers must be identical before and after. Specifically:

- LIMS entity search, type filtering, pagination, Detail card fields, Workspace tabs — all unchanged
- Library folder navigation, breadcrumbs, mixed table sort order, `+` dropdown, Detail card content preview, Workspace embedded editor — all unchanged
- URL schemes (`/lims?entity=...&search=...&type=...`, `/library?path=...&search=...`) — unchanged
- Backend API endpoints — unchanged (no new endpoints, no removed endpoints, no response shape changes)

### Decision 12: File Structure After Implementation

```
frontend/src/
├── types/
│   ├── browser.ts              ← NEW: ViewState type, shared browser types
│   ├── lims.ts                 ← retains Entity types (no longer owns ViewState)
│   ├── library.ts              ← unchanged
│   └── eln.ts                  ← unchanged
├── components/
│   ├── browser/
│   │   ├── BrowserProvider.tsx      ← NEW
│   │   ├── BrowserMasterPanel.tsx   ← NEW
│   │   ├── BrowserDetailPanel.tsx   ← NEW
│   │   ├── BrowserWorkspacePanel.tsx ← NEW
│   │   ├── BrowserCollapsedStrip.tsx ← NEW
│   │   └── useBrowserView.ts        ← NEW
│   ├── LimsDetailCard.tsx       ← REFACTORED (uses BrowserDetailPanel)
│   ├── LimsMoreDetailPanel.tsx  ← REFACTORED (uses BrowserWorkspacePanel)
│   ├── LimsCollapsedStrip.tsx   ← DELETED
│   ├── LibraryDetailCard.tsx    ← REFACTORED (uses BrowserDetailPanel)
│   ├── LibraryMoreDetailPanel.tsx ← REFACTORED (uses BrowserWorkspacePanel)
│   ├── LibraryCollapsedStrip.tsx ← DELETED
│   ├── LibraryTable.tsx         ← REFACTORED (uses BrowserMasterPanel)
│   └── ... (other components unchanged)
├── context/
│   ├── LimsViewContext.tsx      ← DELETED
│   └── LibraryViewContext.tsx   ← DELETED
├── pages/
│   ├── LimsList.tsx             ← REFACTORED (wraps in BrowserProvider)
│   └── LibraryView.tsx          ← REFACTORED (wraps in BrowserProvider)
└── styles.css                   ← UPDATED (consolidated browser-* classes)

backend/
├── core/
│   └── abstracts.py             ← NEW: BrowsableItem abstract model
├── lims/
│   └── models.py                ← REFACTORED: Entity inherits BrowsableItem
└── eln/
    └── models.py                ← REFACTORED: NotebookEntry inherits BrowsableItem
```

## Testing Decisions

### What Makes a Good Test

- Test **external behavior**, not implementation details. Verify that clicking buttons changes the visible panels; don't assert on internal React state.
- Test the **View State machine** in isolation — transitions, invalid state prevention, animation timer coordination.
- Test **shared components** with mock props — verify they render the correct structure and fire callbacks.
- Test **each browser end-to-end** — verify that LIMS entity browsing and Library folder/entry browsing still work after the refactoring.
- Backend: test that `BrowsableItem.generate_display_id()` produces correct per-prefix sequences and that models inheriting from it still pass their existing test suites.

### Seams

**Primary seam: `useBrowserView` hook.** This is the single source of truth for View State transitions. Test it in isolation:

- Initial state is `{ viewState: "list", selectedId: null }`
- `goToDetail("ABC")` → `{ viewState: "detail", selectedId: "ABC" }`
- `goToExpanded("ABC")` → `{ viewState: "expanded", selectedId: "ABC" }`
- `collapseFromExpanded()` → after 250ms → `{ viewState: "detail" }` (selectedId preserved)
- `closeAll()` from detail → after 250ms → `{ viewState: "list", selectedId: null }`
- `closeAll()` from expanded → after 250ms → `{ viewState: "list", selectedId: null }`
- `expandMaster()` → `{ viewState: "detail" }` (selectedId preserved)

**Component seams:** Each shared component has a prop interface. Test them with mock data:

- `BrowserCollapsedStrip` — renders a button, fires `onExpand` on click
- `BrowserDetailPanel` — renders badge, title, field list, action buttons; fires `onClose`/`onExpand`/`onCollapse`; renders children slot
- `BrowserWorkspacePanel` — renders header bar with title, dedicated URL link, close/collapse buttons; renders children slot
- `BrowserMasterPanel` — renders columns, fires `onRowClick`/`onRowExpand`/`onFolderClick`; shows empty/loading states; highlights selected row

**Backend seam: `BrowsableItem` abstract base.** Test in isolation:

- `generate_display_id("E")` on an empty table returns `"E1"`
- `generate_display_id("E")` after `"E5"` exists returns `"E6"`
- Per-prefix independence: `"BLOOD"` counter is independent of `"DNA"` counter
- Gap-tolerant: `"E1", "E2", "E9"` → next is `"E10"` (not `"E3"`)

**Integration seams:** Each browser's existing tests must still pass:

- `backend/lims/tests/test_api.py` — all tests pass after Entity inherits from BrowsableItem
- `backend/eln/tests/test_api.py` — all tests pass after NotebookEntry inherits from BrowsableItem
- `backend/library/tests/test_api.py` — all tests pass
- Frontend browser page tests (if any) — all pass after the refactoring

### Prior Art

- Backend test patterns: `backend/lims/tests/test_models.py` (EntityDisplayIdTests) — the display ID generation tests are the direct prior art for `BrowsableItem` tests
- Backend test patterns: `backend/eln/tests/test_api.py` — API endpoint tests that must continue passing
- Frontend component test patterns: `frontend/src/components/__tests__/LibraryTable.test.tsx` — table rendering tests; `LibraryDetailCard.test.tsx` — detail card tests; `LibraryCollapsedStrip.test.tsx` — collapsed strip tests. All should be mirrored or adapted for the shared components.

## Out of Scope

- **Animation polish.** Animations are kept at functional parity with the current behavior (250ms CSS transitions, manual `setTimeout` exit delay). A separate feature will revisit animations holistically with proper easing, coordinated enter/exit, and potentially a shared animation hook. Do not spend effort on animation quality in this PRD.

- **Plugin/modding API.** The Workspace slot is designed to accommodate plugins, but the plugin registry, Item type registration system, and modding hooks are not implemented here.

- **Third browser.** No new browser (Protocols, Plates, etc.) is created. The shared components are designed to support a third browser, but building one is a separate feature.

- **Cross-browser inline preview.** Clicking a ReferenceBadge still navigates to the canonical browser. Inline cross-reference preview (tabbed Workspaces) is a future feature.

- **Dedicated Workspace URLs for Entities.** The `/lims/BLOOD1` route concept is documented but not implemented. The existing `/eln/:id` route remains; adding dedicated entity routes is a separate feature.

- **Merging Django apps.** The `lims/`, `library/`, and `eln/` apps remain separate. Only the abstract base class is shared. See ADR-0004 for rationale.

- **Folder metadata or Detail panel.** Folders remain containers-only — navigate directly, no Detail panel, no metadata.

- **Animation system overhaul.** The manual `setTimeout` exit-delay pattern is preserved as-is. A future feature will extract this into a reusable hook or animation library.

- **CSS module extraction.** CSS remains in the single `styles.css` file. Extracting browser CSS into a separate module is deferred.

- **Responsive/mobile behavior changes.** The existing `@media (max-width: 800px)` breakpoint and vertical stacking behavior are preserved unchanged.

## Further Notes

- This PRD is the output of a domain-modeling + grilling session. All terminology decisions trace back to [CONTEXT.md](../CONTEXT.md) and the Q&A recorded in the session. See [.docs/browser-pattern-terms.md](browser-pattern-terms.md) for a quick-reference guide to the canonical terms.

- [ADR-0004](../docs/adr/0004-unified-browser-pattern.md) documents the full rationale for the unification, including the three rejected alternatives (merge Django apps, frontend-only sharing, single unified browser route) and the testing strategy to prevent cross-browser regressions.

- The `BrowsableItem` abstract base is **code-level only** (Django `abstract=True`). It does not create a new database table. Existing `Entity` and `NotebookEntry` tables are untouched. No migrations are generated.

- The refactoring is **incremental by design.** Start with `useBrowserView` + `BrowserProvider` (the smallest, highest-impact change), then `BrowserCollapsedStrip` (trivial), then `BrowserDetailPanel` + `BrowserWorkspacePanel`, then `BrowserMasterPanel`, then CSS consolidation, then the backend abstract base. Each step is independently testable and reversible.

- When refactoring `LimsDetailCard` and `LibraryDetailCard` to use `BrowserDetailPanel`, keep the existing component exports. The pages (`LimsList`, `LibraryView`) should not need to change their imports — the detail cards are still `LimsDetailCard` and `LibraryDetailCard` from the page's perspective. Only the internal implementation changes.

- The embedded `ElnEditor` in the Library Workspace already supports an `embedded` prop. Verify this still works correctly when rendered inside `BrowserWorkspacePanel`.

- The Layout component (`Layout.tsx`) currently reads from `useLimsView()` or `useLibraryView()` to hide the search bar in Expanded state. After this refactoring, it reads from `useBrowser()`. Both browser pages wrap in `<BrowserProvider>`, so the hook works regardless of which browser is active.

- CSS class renaming (`lims-*` → `browser-*`, `library-*` → `browser-*`) is the riskiest part of this PRD — every CSS selector in `styles.css` and every `className` in the components must be updated consistently. Use search-and-replace, then visually verify both browsers at each View State.

---

## Design Decisions Reference (from Domain Modeling Session)

For context, these are the key decisions reached during the domain modeling + grilling session:

1. **Two browsers, one pattern.** Library and LIMS remain separate browsers with their own routes, but share the same three-panel code and terminology.
2. **Terminology: Master / Detail / Workspace.** Canonical panel names replacing all ad-hoc variants.
3. **Terminology: List / Detail / Expanded.** Canonical View State names.
4. **Terminology: Item** — generic "row in a Master table." Entity, Entry, Folder are concrete Item types.
5. **Backend: Option B** — shared abstract base class, separate Django apps. No app merging.
6. **Workspace = Slot.** The browser provides the container; the Item type provides the content. Foundation for future plugin API.
7. **Folders are containers, not content.** Navigate directly, no Detail panel, no metadata.
8. **Cross-references navigate to canonical browser.** Known UX rough edge; future tabbed Workspace will improve this.
9. **Dedicated Workspace URLs.** Every Workspace has a shareable URL (`/eln/E12`, future `/lims/BLOOD1`).
10. **Item types belong to exactly one browser.** Entities only in LIMS; Entries only in Library (for now).
11. **Animations deferred.** Functional parity only; a separate feature will revisit animations holistically.
12. **Plugin readiness.** The Workspace slot + Item type system are designed for future modding, but not implemented here.
