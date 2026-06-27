# PRD-12: Frontend Deepening — CSS Cleanup, Shared Components, Settings Split

**Status:** `ready-for-agent`
**Date:** 2026-06-27

## Problem Statement

ADR-0004 extracted shared browser components (BrowserProvider, BrowserMasterPanel, BrowserDetailPanel, BrowserWorkspacePanel, BrowserCollapsedStrip) from the duplicated LIMS and Library code. This PRD captures the **next layer** of frontend deepening — four architectural improvements that the unification exposed but didn't address.

The problems, in order of severity:

1. **Dead CSS (~160 lines).** The stylesheet has two identical blocks of `.browser-*` selectors. Both use the same class names, so the second block overrides the first via the cascade. The first block is dead code — it makes the stylesheet harder to navigate and hides the real rule set.

2. **Duplicated entity field rendering.** `LimsDetailCard.tsx` and `EntityWorkspace.tsx` both render the same four entity header fields (Type, Created, By, Source Entry) with identical JSX. Both define the same `formatDate` helper inline. Adding a field to the entity model requires updating two components. This violates **locality** — entity field knowledge is spread.

3. **Duplicated page layout orchestration.** `LimsList.tsx` and `LibraryView.tsx` both compute the same three CSS class strings from `viewState` (identical expressions) and render the same master-detail-expanded layout structure. The individual panels were extracted in ADR-0004, but the page-level orchestration remained duplicated. Adding a third browser requires copying ~15 lines of class computation and JSX structure. This violates **leverage** — the layout pattern costs N copies for N browsers.

4. **Settings page monolith (664 lines).** The largest single file in the frontend implements its own master-detail layout with `.settings-master-detail` CSS classes (separate from the shared browser components). It combines entity type listing, type editing, column CRUD, emoji pickers, and danger-zone delete buttons in a single component with no tests. The module is **shallow** — the interface (one giant component) is nearly as complex as the implementation.

## Solution

Four independent slices, ordered by risk and effort. Slices 2 and 3 are the compound pair (EntityDetailFields extraction validates the "extract shared component" pattern before the larger BrowserPage extraction). Slices 1 and 4 are standalone.

### Slice 1: CSS Duplication Cleanup (15 min, zero risk)

Delete the first ~160-line block of `.browser-*` CSS rules (the dead block at approximately lines 870–1190 in `styles.css`). The second block (approximately lines 2448–2860) already wins the cascade — no visual change, no behavior change.

### Slice 2: Extract EntityDetailFields (1 hr, low risk)

Extract shared entity field rendering into an `EntityDetailFields` component. Both `LimsDetailCard` and `EntityWorkspace` use it — `LimsDetailCard` inside the `BrowserDetailPanel`, `EntityWorkspace` inside the `BrowserWorkspacePanel`. The component accepts `entity`, `showProperties` (boolean), and `children` (for extensibility).

### Slice 3: Extract BrowserPage Layout (2–3 hrs, medium risk)

Extract a `BrowserPage` component that absorbs the duplicated CSS class computation and master-detail-expanded layout JSX. `LimsList` and `LibraryView` become thin data-fetching modules that pass slots to `BrowserPage`.

### Slice 4: Split Settings Page into Sub-Modules (3–4 hrs, medium-high risk)

Break the 664-line `Settings.tsx` monolith into five panel-sized sub-modules, each independently testable. The page orchestrator wires panels together but owns no layout CSS.

## Domain Glossary References

This PRD uses canonical terminology from:
- [CONTEXT.md](../CONTEXT.md) — Browser, Master Panel, Detail Panel, Workspace Panel, View State (list/detail/expanded), Entity, Entity Type
- [docs/adr/0004-unified-browser-pattern.md](../docs/adr/0004-unified-browser-pattern.md) — shared browser component architecture
- [.docs/browser-pattern-terms.md](browser-pattern-terms.md) — quick-reference terminology

## User Stories

### Slice 1: CSS Duplication Cleanup

1. As a developer, I want the `.browser-*` CSS rules to appear exactly once in the stylesheet, so that I don't waste time editing rules in the dead block that the cascade ignores.

2. As a developer, I want the stylesheet to be ~160 lines shorter, so that navigating to the real CSS rules is faster.

3. As a lab researcher, I want both browsers and the entity workspace to render identically after the cleanup, so that the removal has no visible impact.

### Slice 2: Extract EntityDetailFields

4. As a developer, I want a single `EntityDetailFields` component that renders entity header fields (Type, Created, By, Source Entry), so that adding or changing an entity field updates one component instead of two.

5. As a developer, I want `LimsDetailCard` to use `<EntityDetailFields entity={entity} />` instead of inlining the four field rows, so that the detail card's field rendering is delegated to a shared component.

6. As a developer, I want `EntityWorkspace` to use `<EntityDetailFields entity={entity} showProperties />` instead of inlining the same four field rows, so that the entity page at `/lims/:displayId` and the detail panel at `/lims` show the same fields with the same formatting.

7. As a developer, I want `EntityDetailFields` to accept a `showProperties` prop (default `false`) that toggles the properties table section, so that the detail card hides properties (it's a summary) and the workspace shows them (it's the full view).

8. As a developer, I want `EntityDetailFields` to accept a `children` slot rendered below the field rows, so that callers can append custom content without forking the component.

9. As a lab researcher, I want entity detail cards and entity workspace pages to render identically after the extraction, so that the refactoring is invisible.

### Slice 3: Extract BrowserPage Layout

10. As a developer, I want a single `BrowserPage` component that computes the three CSS class strings from `viewState`, so that I don't copy the same three template-literal expressions into every browser page.

11. As a developer, I want `BrowserPage` to render the master-detail-expanded layout structure (collapsed strip → master panel | detail panel | workspace panel), so that each browser page only provides its domain-specific content via slots.

12. As a developer, I want `LimsList` to call `<BrowserPage header={...} table={...} detail={...} workspace={...} />` instead of manually orchestrating panels, so that the LIMS page is ~40 lines shorter.

13. As a developer, I want `LibraryView` to call `<BrowserPage header={...} table={...} detail={...} workspace={...} />` instead of manually orchestrating panels, so that the Library page is ~40 lines shorter.

14. As a developer, I want the `BrowserPage` interface to accept a `loading` prop that shows a "Loading…" message, so that the loading state is consistent across browsers.

15. As a developer, I want the `BrowserPage` interface to accept an `error` prop that displays above the layout, so that error display is consistent across browsers.

16. As a developer, I want adding a third browser to require defining columns, data fetching, and row rendering — not copying layout JSX, so that the pattern scales linearly.

17. As a lab researcher, I want both browsers to work identically after the extraction — list view, detail view, expanded view, exit animations, loading states, empty states, and error display all unchanged.

### Slice 4: Split Settings Page

18. As a developer, I want a `TypeMasterPanel` component that renders the entity type list with create, select, and deactivate actions, so that the schema list logic is independently testable.

19. As a developer, I want a `TypeDetailPanel` component that renders the selected type's editor with column list and emoji picker, so that the detail panel logic is independently testable.

20. As a developer, I want a `ColumnEditor` component that renders a single column's row editor (name input, type select, required checkbox, remove button, drag handles), so that column editing is independently testable.

21. As a developer, I want a `DangerZone` component that renders the three destructive buttons with confirmation dialogs and loading states, so that danger-zone behavior is independently testable.

22. As a developer, I want `SettingsPage.tsx` (the orchestrator) to be ≤50 lines — wiring panels together, owning no layout CSS, so that the settings module structure is obvious from its orchestrator.

23. As a developer, I want each sub-module to have ≥1 test, so that the currently-untested Settings page gains test coverage as a side effect of the split.

24. As a developer, I want the file structure after the split to be:

    ```
    frontend/src/pages/settings/
    ├── SettingsPage.tsx        ← orchestrator (thin, ~30 lines)
    ├── TypeMasterPanel.tsx     ← entity type list
    ├── TypeDetailPanel.tsx     ← type editor + column CRUD
    ├── ColumnEditor.tsx        ← per-column field editor
    ├── DangerZone.tsx          ← deactivate/delete actions
    └── __tests__/              ← per-module test files
    ```

    so that the Settings module is navigable by reading file names, not scrolling a 664-line file.

25. As a lab researcher, I want Settings to work identically after the split — creating types, editing types, adding/removing/reordering columns, changing icons, deactivating types, and danger zone buttons all function exactly as before.

### Regression Prevention

26. As a developer, I want `npm run build` to succeed after each slice, so that each slice is independently deployable.

27. As a developer, I want `npm test` to pass after each slice, so that no existing behavior is broken by the refactoring.

28. As a developer, I want visual parity verified for both browsers at all three view states after Slices 1–3, so that the CSS cleanup and layout extraction don't cause rendering regressions.

## Implementation Decisions

### Decision 1: Four Independent Slices

Each slice is a single atomic commit. No slice depends on another. This means each can be implemented, tested, and merged independently. If Slice 3's interface proves wrong, Slices 1 and 2 are unaffected.

Execution order is recommended (see Execution Order below) but not required — the slices compose, they don't depend.

### Decision 2: Slice 1 — Dead CSS Removal

The stylesheet has two blocks of `.browser-*` selectors:
- Block 1: approximately lines 870–1190
- Block 2: approximately lines 2448–2860

Both define the same class names. CSS cascade means the second block overrides the first. Block 1 is dead code. Remove it.

**Verification strategy:** Open `/library` and `/lims` before and after. Compare screenshots. `npm run build` must produce no new warnings.

**Rejected alternative: deduplicate selectively.** Merging the two blocks into a single authoritative block is more work and higher risk for zero user-facing benefit. The second block is already authoritative. Delete the dead one.

### Decision 3: Slice 2 — EntityDetailFields Interface

The component renders the four entity header fields. It does NOT render the entity header (badge + title + action buttons) — that stays in each caller because the header varies between detail card and workspace contexts.

```typescript
interface EntityDetailFieldsProps {
  entity: EntityListItem;
  /** Show the properties table? Default false. */
  showProperties?: boolean;
  /** Slot below the field rows, above the properties table. */
  children?: ReactNode;
}
```

**Rendered output (default, no children, showProperties=false):**
- Type field: `entity.entity_type_name (entity.entity_type_prefix)`
- Created field: formatted date from `entity.created_at`
- By field: `entity.created_by_username || "—"`
- Source Entry field: `ReferenceBadge` if `entity.source_entry_display_id` exists, else nothing

**With showProperties=true:**
- Properties table rendered below fields (same markup as currently in LimsDetailCard lines 71–102)

**What stays in each caller:**
- `LimsDetailCard`: renders `BrowserDetailPanel` shell, passes entity header (badge + title + action buttons), then renders `<EntityDetailFields entity={entity} />` as children
- `EntityWorkspace`: renders back nav button + entity header card, then renders `<EntityDetailFields entity={entity} showProperties />` + tabbed `BrowserWorkspacePanel`

**The `formatDate` helper** moves into `EntityDetailFields` — it's duplicated in both callers today.

**Rejected alternative: put entity header in EntityDetailFields.** Rejected because the header rendering differs: LimsDetailCard puts it inside `BrowserDetailPanel`; EntityWorkspace puts it in a standalone `card` div. The header is layout, not field content.

**Rejected alternative: make showProperties show the properties INLINE in fields.** Rejected because properties has its own section with a heading and table — it's a separate visual block, not a field row.

### Decision 4: Slice 3 — BrowserPage Interface

The `BrowserPage` component absorbs:
1. CSS class computation (three template-literal expressions)
2. The master-detail-expanded layout JSX structure
3. Loading and error states

Each browser page becomes a data-fetching module that provides content via slots.

**Interface shape (conceptual — exact types defined in implementation):**

```
BrowserPage
  ├── header?: ReactNode          — breadcrumbs, search, new button (above layout)
  ├── loading?: boolean           — shows "Loading…" when true and no table content
  ├── error?: string | null       — displays above the layout
  ├── table: ReactNode            — rendered inside BrowserMasterPanel (or the library table wrapper)
  ├── detail?: ReactNode          — rendered as the detail panel (null → not visible)
  ├── workspace?: ReactNode       — rendered as the workspace panel (null → not visible)
  ├── onLoadMore?: () => void     — Load More callback
  ├── hasMore?: boolean           — whether more pages exist
  ├── loadingMore?: boolean       — whether a Load More fetch is in progress
  └── emptyMessage?: string       — shown when table has no rows and not loading
```

**CSS class computation absorbed by BrowserPage:**

Today, both pages compute:
```
pageClass = `page browser-page${hasDetail ? " has-detail" : ""}${isExpanded ? " is-expanded" : ""}`
masterDetailClass = `browser-master-detail${hasDetail ? " has-detail" : ""}${isExpanded ? " is-expanded" : ""}`
masterPanelClass = `browser-master-panel${isExpanded ? " is-collapsed" : ""}`
```

After extraction, the computation lives inside `BrowserPage`. The ViewState is read from `useBrowserView()` inside `BrowserPage`.

**What each page still owns after extraction:**

- `LimsList`: data fetching, column definitions, row rendering, `ReferenceBadge` rendering, `LimsDetailCard` and `LimsMoreDetailPanel` instantiation
- `LibraryView`: data fetching, `LibraryBreadcrumbs`, `LibraryNewDropdown`, `LibraryTable`, `LibraryDetailCard` and `LibraryMoreDetailPanel` instantiation, folder navigation

**The Library version has a structural difference** — it doesn't use `BrowserMasterPanel` (it uses `LibraryTable` + manual Load More button). The `BrowserPage` interface must accommodate this: the `table` slot is just a ReactNode rendered where the master panel goes. `BrowserPage` handles the collapsed-strip-vs-master-panel toggle; the slot content is whatever the page provides.

**Rejected alternative: `BrowserPage` owns the collapsed strip toggle.** The collapsed strip behavior is already implemented in each page (lines 156–158 in LimsList, lines 196–198 in LibraryView). BrowserPage absorbs this — it checks `viewState === "expanded"` and renders either the collapsed strip or the `table` slot. The collapsed strip's `onExpand` callback is wired to `collapseFromExpanded` from `useBrowserView`.

**Rejected alternative: force Library to use BrowserMasterPanel.** The Library table is more complex — mixed folder/entry rows, navigation on folder click, different column set. Forcing it into BrowserMasterPanel would require generalizing that component, which is a separate refactoring with its own risk. BrowserPage provides a generic slot; each page fills it with whatever table component it needs.

### Decision 5: Slice 4 — Settings Split Strategy

The 664-line Settings.tsx splits into five modules:

| Module | Lines (est.) | Responsibility |
|--------|-------------|----------------|
| `SettingsPage.tsx` | ~30 | State orchestration: selectedId, dirtyEdits, fetching; wires panels together |
| `TypeMasterPanel.tsx` | ~100 | Entity type list: create form, archive toggle, select/deselect |
| `TypeDetailPanel.tsx` | ~120 | Selected type editor: header (badge, name, icon picker, deactivate button), field list (Status, Prefix, Icon, Columns count), ColumnEditor |
| `ColumnEditor.tsx` | ~100 | Per-column row: name input, type select, required checkbox, remove button, drag handles (up/down). Also owns the "Add Column" and "Discard Changes" buttons. |
| `DangerZone.tsx` | ~80 | Three destructive buttons with confirmation dialogs and loading states |

**Data flow:** SettingsPage owns the top-level state (`entityTypes`, `selectedId`, `dirtyEdits`, `emojiPopover`, etc.). Sub-modules receive state as props and call callbacks. No sub-module imports state management hooks — they're pure presentational + event-callback components.

**State that crosses modules:**
- `dirtyEdits: Map<number, EntityType>` — passed to `TypeDetailPanel` (to read current edits) and `ColumnEditor` (to mutate columns within the dirty copy)
- `emojiPopover: { id, source } | null` — passed to `TypeDetailPanel` (both header and body emoji pickers)
- `selectedId: number | null` — passed to `TypeMasterPanel` (to highlight selected) and `TypeDetailPanel` (to know which type to edit)

**Save orchestration:** `saveAllChanges` stays in `SettingsPage.tsx` — it iterates `dirtyEdits`, PUTs each dirty type, then refetches. Sub-modules don't know about persistence.

**Rejected alternative: lift state into a SettingsContext.** Rejected because the state isn't used outside the Settings page. Props are sufficient for one level of nesting. A context would be two adapters for a single call site.

**Rejected alternative: adopt BrowserMasterPanel/BrowserDetailPanel shells.** Rejected — Settings is not a Browser per CONTEXT.md. It's a configuration page. The `.settings-master-detail` CSS is fine for a single-use layout. The deepening is in splitting the monolith, not in converging on browser components.

### Decision 6: File Structure After All Slices

```
frontend/src/
├── components/
│   ├── browser/
│   │   ├── BrowserPage.tsx              ← NEW (Slice 3)
│   │   ├── BrowserProvider.tsx
│   │   ├── BrowserMasterPanel.tsx
│   │   ├── BrowserDetailPanel.tsx
│   │   ├── BrowserWorkspacePanel.tsx
│   │   ├── BrowserCollapsedStrip.tsx
│   │   ├── useBrowserView.ts
│   │   └── __tests__/
│   │       └── BrowserPage.test.tsx     ← NEW (Slice 3)
│   ├── EntityDetailFields.tsx           ← NEW (Slice 2)
│   ├── LimsDetailCard.tsx               ← REFACTORED (uses EntityDetailFields)
│   ├── LimsMoreDetailPanel.tsx          ← unchanged
│   ├── LibraryDetailCard.tsx            ← unchanged
│   ├── LibraryMoreDetailPanel.tsx       ← unchanged
│   └── __tests__/
│       ├── EntityDetailFields.test.tsx  ← NEW (Slice 2)
│       └── ... (existing tests)
├── pages/
│   ├── settings/                        ← NEW directory (Slice 4)
│   │   ├── SettingsPage.tsx
│   │   ├── TypeMasterPanel.tsx
│   │   ├── TypeDetailPanel.tsx
│   │   ├── ColumnEditor.tsx
│   │   ├── DangerZone.tsx
│   │   └── __tests__/
│   ├── LimsList.tsx                     ← REFACTORED (uses BrowserPage)
│   ├── LibraryView.tsx                  ← REFACTORED (uses BrowserPage)
│   ├── EntityWorkspace.tsx              ← REFACTORED (uses EntityDetailFields)
│   ├── __tests__/
│   │   ├── LimsList.test.tsx            ← NEW (was missing)
│   │   └── ... (existing tests)
│   └── Settings.tsx                     ← DELETED (replaced by settings/)
└── styles.css                           ← REFACTORED (dead CSS removed)
```

### Decision 7: No Functional Changes

This PRD is a **pure refactoring** — user-visible behavior is identical after every slice:
- Library browsing, LIMS browsing, entity workspace, settings — all unchanged
- URL schemes unchanged
- API calls unchanged
- Animations, transitions, loading states, error states — all unchanged

## Testing Decisions

### What Makes a Good Test

- Test **rendered output**, not implementation details. Assert that fields appear in the DOM; don't assert on internal React state.
- Test **slot composition** for BrowserPage — verify that header, table, detail, and workspace content render in the correct DOM positions.
- Test **edge cases** — missing source entry, missing username, empty properties, no columns.
- Test **user interactions** for Settings sub-modules — clicking a column remove button fires the callback with the right index.

### Seams

**Slice 2 — EntityDetailFields:**
- Renders Type field: `entity_type_name (entity_type_prefix)` format
- Renders Created field: formatted date string
- Renders By field: username or "—" fallback
- Renders Source Entry: ReferenceBadge when present, nothing when absent
- showProperties=false: no properties section rendered
- showProperties=true: properties table rendered with field/value rows
- Boolean values render as ✓/✗
- children slot renders between fields and properties

**Slice 3 — BrowserPage:**
- List state: full-width master panel, no detail, no workspace
- Detail state: master + detail visible, detail panel receives content
- Expanded state: collapsed strip + detail + workspace
- Exit animation class applied when `isExiting` is true from `useBrowserView`
- Header slot renders above the master-detail layout
- Loading state shows "Loading…" when `loading` is true and table has no content
- Error message displays above the layout
- Load More renders when `hasMore` is true

**Slice 4 — Settings sub-modules:**
- TypeMasterPanel: renders type list, fires onSelect/onCreate callbacks, archive toggle
- TypeDetailPanel: renders selected type fields, fires onDeactivate/onFieldChange callbacks
- ColumnEditor: renders column rows, fires onAdd/onRemove/onUpdate/onMove callbacks
- DangerZone: renders three buttons, fires confirmation dialogs, shows loading/success/error states

**Integration seams for all slices:**
- `npm run build` succeeds
- `npm test` passes (all existing test suites)
- Visual check: Library at `/library`, LIMS at `/lims`, entity workspace at `/lims/:displayId`, Settings at `/settings`

### Prior Art

- Component test patterns: `frontend/src/components/__tests__/LibraryDetailCard.test.tsx` — renders with mock props, asserts field content
- Component test patterns: `frontend/src/components/__tests__/LibraryTable.test.tsx` — renders table rows, asserts row click
- Page test patterns: `frontend/src/pages/__tests__/LibraryView.test.tsx` — renders page, asserts panel states
- The existing tests use React Testing Library with `render`, `screen.getByText`, `screen.queryByText`, and `fireEvent.click`

## Execution Order

| Order | Slice | Effort | Risk | Rationale |
|-------|-------|--------|------|-----------|
| **1** | CSS Duplication Cleanup | 15 min | Zero | Quick win, removes noise before refactoring |
| **2** | Extract EntityDetailFields | 1 hr | Low | Small extraction that validates the "extract shared component" pattern |
| **3** | Extract BrowserPage Layout | 2–3 hrs | Medium | Larger extraction; benefits from pattern confidence after Slice 2 |
| **4** | Split Settings Page | 3–4 hrs | Medium-high | Largest slice, most speculative, zero regression risk for browsers |

Slices 1–3 are independent of Slice 4 (Settings has its own CSS and layout). Slice 2 is recommended before Slice 3 because it's a smaller, lower-risk version of the same "extract shared component" pattern — succeeding at Slice 2 builds confidence for Slice 3.

## Out of Scope

- **Merging LibraryTable into BrowserMasterPanel.** The Library table has mixed folder/entry rows with different click behaviors. Making BrowserMasterPanel generic enough for both is a separate refactoring.

- **Animation system overhaul.** BrowserPage preserves the existing 250ms exit-delay pattern. A separate feature will extract this into a reusable hook.

- **Settings adopting browser components.** Settings keeps its `.settings-master-detail` CSS. It's a configuration page, not a Browser.

- **Adding a third browser.** No new browser (Protocols, Plates) is created. BrowserPage is designed to support one, but building it is a separate feature.

- **CSS module extraction.** CSS remains in the single `styles.css` file. Extracting browser or settings CSS into separate modules is deferred.

- **Responsive/mobile changes.** The existing `@media (max-width: 800px)` breakpoint and vertical stacking behavior are preserved unchanged.

- **LimsList.test.tsx content.** The PRD notes that LimsList currently has no test file. A basic smoke test is part of Slice 3's acceptance criteria, but comprehensive testing (mocking API calls, testing pagination, testing search) is out of scope.

- **Settings test comprehensiveness.** Slice 4 adds ≥1 test per sub-module. Full coverage of all edge cases (network errors, concurrent edits, race conditions on save) is out of scope.

## Further Notes

- This PRD covers Slices 1, 4, 5, and 6 from the [Architecture Deepening PRD](../docs/prd-architecture-deepening.md). Slice 2 (unified tree-walker) and Slice 3 (deepened sync pipeline) are covered by [PRD-11](prd-11-content-sync-deepening.md). Together, PRD-11 and PRD-12 cover all six slices from the architecture review.

- The CSS duplication (Slice 1) was confirmed during codebase exploration: the first `.browser-page` block starts at line 870, the second at line 2448. Both define the same selectors. The second block wins the cascade.

- Entity field duplication was confirmed: `LimsDetailCard.tsx` (lines 46–67) and `EntityWorkspace.tsx` (lines 118–140) render the same four fields with the same `formatDate` helper. Both define `formatDate` inline — `LimsDetailCard` at line 19, `EntityWorkspace` at line 65.

- Browser page class computation was confirmed identical in `LimsList.tsx` (lines 129–136) and `LibraryView.tsx` (lines 154–161). Three template-literal expressions, identical in both files.

- Settings.tsx is 664 lines. It implements its own master-detail CSS classes (`.settings-master-detail`, `.settings-master-panel`, `.settings-detail-panel`) separate from the `.browser-*` classes. It has zero test coverage.

- The `EntityDetailFields` component extracts exactly four fields. If a future entity subtype needs different fields, the component can grow a `fields` override prop — but that's a future concern. Four fields is the right granularity for now.

- `BrowserPage` reads from `useBrowserView()` internally, but the pages still call `useBrowserView()` for their own transitions (selectEntity, goToList, etc.). The hook is used both inside BrowserPage (for CSS classes and panel visibility) and outside (for row click handlers). This is fine — the hook is the shared state machine; BrowserPage is just one consumer of it.

- The Settings split follows the same slot-composition pattern as the browser components: an orchestrator wires panels together via props; sub-modules are pure presentational components. This pattern is established by ADR-0004 and validated by the existing browser components.

---
