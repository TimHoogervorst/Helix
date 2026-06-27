# PRD: Architecture Deepening

> Source: [Architecture Review 2026-06-27](./architecture-review-20260627.html)
> Branch: `Refactor-Three-Split-way`
> Status: Draft

## Overview

ADR-0004 extracted shared browser components (BrowserProvider, BrowserMasterPanel, BrowserDetailPanel, BrowserWorkspacePanel, BrowserCollapsedStrip) from the duplicated LIMS and Library code. This PRD captures the **next layer** of deepening — five architectural improvements that surfaced during review, plus one quick win.

Each slice is sized to be a single atomic commit. Slices are ordered by dependency and risk: backend foundations first, then frontend, with quick wins front-loaded to build momentum.

---

## Dependency Graph

```
Slice 1 (CSS cleanup)     ── no deps
Slice 2 (tree-walker)     ── no deps
Slice 3 (sync pipeline)   ── builds on Slice 2
Slice 4 (EntityDetail)    ── no deps
Slice 5 (BrowserPage)     ── no deps (but benefits from 4)
Slice 6 (Settings split)  ── no deps (speculative)
```

Backend slices (2, 3) and frontend slices (4, 5, 6) are independent of each other. Slice 3 logically follows Slice 2 — the deepened tree-walker enables the cleaner pipeline interface.

---

## Slice 1: CSS Duplication Cleanup

> 📋 **Detailed PRD:** [.docs/prd-12-frontend-deepening.md](../.docs/prd-12-frontend-deepening.md) — covers Slices 1, 4, 5, 6.

**Goal:** Remove ~160 lines of duplicated `.browser-*` CSS rules.

**Strength:** Quick win (not architectural, but high-noise)

**Files:**
- `frontend/src/styles.css` — delete the first `.browser-*` block (lines 870–1187), keep the second (lines 2637–2859)

**Problem:** The CSS file has two identical blocks of `.browser-*` selectors. Both use the same class names, so the second block overrides the first via the cascade — the first block is dead code. This makes the stylesheet harder to navigate and hides the real rule set.

**Acceptance Criteria:**
- [ ] The first `.browser-*` block (lines ~870–1187) is removed
- [ ] The second `.browser-*` block (lines ~2637–2859) is unchanged
- [ ] Library page renders identically (visual check: `/library`)
- [ ] LIMS page renders identically (visual check: `/lims`)
- [ ] Entity workspace renders identically (visual check: `/lims/any-id`)
- [ ] `npm run build` succeeds with no CSS warnings

**Risk:** Zero. This is dead code removal — the second block already wins the cascade.

**Effort:** ~15 minutes.

---

## Slice 2: Unify the TipTap Tree-Walker

> 📋 **Detailed PRD:** [.docs/prd-11-content-sync-deepening.md](../.docs/prd-11-content-sync-deepening.md) — full interface design, grilling decisions, test strategy.

**Goal:** Replace two independent recursive JSON tree walkers with one shared walker behind a single interface.

**Strength:** Strong recommendation

**Files:**
- `backend/core/walker.py` — **new**: shared `walk_tiptap_tree(root, handler)` function
- `backend/core/tests/test_walker.py` — **new**: tests for the shared walker
- `backend/lims/services.py` — refactor `_walk_lims_tables` to use `walk_tiptap_tree`
- `backend/references/services.py` — refactor `walk_reference_nodes` to use `walk_tiptap_tree`

**Problem:** `_walk_lims_tables` (lims/services.py) and `walk_reference_nodes` (references/services.py) are two independent recursive JSON tree walkers. Both implement the same traversal logic — recursing into `content[]` arrays, nested dicts, and nested lists — but look for different node types. Adding a third node type (e.g., a Protocol node) requires writing a third walker.

**Solution:** Extract a single `walk_tiptap_tree(root, handler)` function. The walker traverses the TipTap JSON tree; each caller supplies a handler invoked when a matching node is found. The handler returns a modified node (or `None` for no change).

**Interface:**
```python
def walk_tiptap_tree(root: dict, handler: Callable[[dict], dict | None]) -> dict:
    """
    Walk a TipTap/ProseMirror JSON tree.

    handler is called for every node in the tree. If handler returns a dict,
    that node is replaced with the returned dict. If handler returns None,
    the node is unchanged. If handler returns a falsy non-None value, the
    node is removed from its parent's content array.

    Returns a (possibly modified) copy of the tree.
    """
```

**Acceptance Criteria:**
- [ ] `backend/core/walker.py` exists with `walk_tiptap_tree` as its sole public export
- [ ] `_walk_lims_tables` delegates to `walk_tiptap_tree` (the limsTable-specific logic stays in lims/services.py)
- [ ] `walk_reference_nodes` delegates to `walk_tiptap_tree` (the reference-specific logic stays in references/services.py)
- [ ] `backend/core/tests/test_walker.py` covers:
  - [ ] Walking a flat document (no recursion)
  - [ ] Walking a nested document (paragraphs inside a doc)
  - [ ] Handler replacing a node
  - [ ] Handler returning `None` (no change)
  - [ ] Walking into `content[]` arrays
  - [ ] Walking into nested dicts (e.g., `attrs`)
  - [ ] Walking into arbitrary lists (not named `content`)
  - [ ] Deeply nested structures (headings inside lists inside doc)
- [ ] Existing tests pass: `python manage.py test core eln lims references`
- [ ] No change in behavior: `sync_entities` and `sync_mentions` produce identical results

**Risk:** Low. The refactor is mechanical — the walking logic is already correct in both places. The shared walker is the union of both traversal patterns.

**Effort:** ~1–2 hours.

---

## Slice 3: Deepen the Content Sync Pipeline

> 📋 **Detailed PRD:** [.docs/prd-11-content-sync-deepening.md](../.docs/prd-11-content-sync-deepening.md) — full interface design, grilling decisions, test strategy.

**Goal:** Hide the entity→mention sync ordering behind a single interface.

**Strength:** Strong recommendation

**Files:**
- `backend/eln/sync.py` — **new**: `sync_entry_content(entry)` function
- `backend/eln/tests/test_sync.py` — **new**: tests for the sync pipeline
- `backend/eln/views.py` — refactor `perform_create` and `perform_update`

**Problem:** The ordering dependency — entities must sync before mentions because mentions may reference entity display IDs in table cells — is enforced only by a comment in `perform_create` and `perform_update`. Both methods duplicate the same 6-line sequence:
```python
content = sync_entities(instance, instance.content)
sync_mentions(instance, content)
if content != instance.content:
    instance.content = content
    instance.save(update_fields=["content"])
```
A third sync step must be inserted at the right position in two places by a developer who knows the ordering constraint.

**Solution:** Extract a single `sync_entry_content(entry)` function that handles ordering internally. The caller's interface shrinks from two calls + conditional save to one call. The ordering knowledge moves from the caller into the implementation — it becomes a private invariant of the sync module.

**Interface:**
```python
def sync_entry_content(entry: NotebookEntry) -> NotebookEntry:
    """
    Sync all derived content for an entry.

    Ordering: entities first (patches entityIds into content),
    then mentions (may reference newly-created entity display IDs).

    Saves the entry if content changed. Returns the (possibly updated) entry.
    """
```

**Acceptance Criteria:**
- [ ] `backend/eln/sync.py` exists with `sync_entry_content` as its sole public export
- [ ] `perform_create` in views.py calls `sync_entry_content(instance)` instead of the 6-line sequence
- [ ] `perform_update` in views.py calls `sync_entry_content(instance)` instead of the 6-line sequence
- [ ] `backend/eln/tests/test_sync.py` covers:
  - [ ] Entry with no limsTable nodes → no changes
  - [ ] Entry with limsTable nodes → entities created, entityIds patched
  - [ ] Entry with reference nodes → mentions created
  - [ ] Entry with both → entities synced first, then mentions (ordering verified)
  - [ ] Entry with removed limsTable → entities deleted, mentions updated
  - [ ] Entry with unresolvable references → gracefully handled
- [ ] Existing tests pass: `python manage.py test eln references lims`

**Risk:** Low. The logic is already correct — this just moves it from the caller into a named function. The new test suite validates ordering explicitly.

**Effort:** ~1–2 hours.

---

## Slice 4: Extract EntityDetailFields

> 📋 **Detailed PRD:** [.docs/prd-12-frontend-deepening.md](../.docs/prd-12-frontend-deepening.md) — covers Slices 1, 4, 5, 6.

**Goal:** Stop duplicating entity field rendering between LimsDetailCard and EntityWorkspace.

**Strength:** Worth exploring

**Files:**
- `frontend/src/components/EntityDetailFields.tsx` — **new**: shared entity field rendering
- `frontend/src/components/__tests__/EntityDetailFields.test.tsx` — **new**
- `frontend/src/components/LimsDetailCard.tsx` — use EntityDetailFields
- `frontend/src/pages/EntityWorkspace.tsx` — use EntityDetailFields

**Problem:** EntityWorkspace.tsx (the dedicated page at `/lims/:displayId`) renders entity header fields inline — the same Type, Created, By, and Source Entry fields that LimsDetailCard renders in the browser's Detail Panel. Adding a field to the entity model requires updating two components.

**Solution:** Extract shared entity field rendering into an `EntityDetailFields` component. Both LimsDetailCard and EntityWorkspace use it — LimsDetailCard inside the BrowserDetailPanel, EntityWorkspace inside the BrowserWorkspacePanel.

**Interface:**
```tsx
interface EntityDetailFieldsProps {
  entity: EntityListItem;
  /** Show the properties table? Default false (detail card hides it, workspace shows it). */
  showProperties?: boolean;
}
```

**Acceptance Criteria:**
- [ ] `EntityDetailFields.tsx` renders: Type (entity_type_name + prefix), Created (formatted date), By (created_by_username), Source Entry (ReferenceBadge if present)
- [ ] `LimsDetailCard.tsx` uses `<EntityDetailFields entity={entity} />` — no duplicated field JSX
- [ ] `EntityWorkspace.tsx` uses `<EntityDetailFields entity={entity} showProperties />` — no duplicated field JSX
- [ ] Tests cover:
  - [ ] All four fields render correctly
  - [ ] Missing Source Entry renders "—"
  - [ ] Missing created_by_username renders "—"
  - [ ] showProperties prop toggles the properties section
- [ ] Existing tests pass: `npm test -- LimsDetailCard`
- [ ] Visual check: LIMS detail card and entity workspace render identically to before

**Risk:** Low. Pure extraction — no behavior change.

**Effort:** ~1 hour.

---

## Slice 5: Extract BrowserPage Layout

> 📋 **Detailed PRD:** [.docs/prd-12-frontend-deepening.md](../.docs/prd-12-frontend-deepening.md) — covers Slices 1, 4, 5, 6.

**Goal:** Absorb duplicated CSS class computation and layout JSX structure into a shared component.

**Strength:** Worth exploring

**Files:**
- `frontend/src/components/browser/BrowserPage.tsx` — **new**: shared page layout
- `frontend/src/components/browser/__tests__/BrowserPage.test.tsx` — **new**
- `frontend/src/pages/LimsList.tsx` — use BrowserPage
- `frontend/src/pages/LibraryView.tsx` — use BrowserPage
- `frontend/src/pages/__tests__/LimsList.test.tsx` — **new**: LIMS page tests

**Problem:** Both LimsList and LibraryView compute the same three CSS class strings from `viewState` (identical expressions) and render the same master-detail-expanded layout structure. The duplication survived ADR-0004 — the individual panels were extracted, but the page-level orchestration remained duplicated. A third browser would copy the same ~15 lines of class computation.

**Solution:** Extract a `BrowserPage` component that accepts slots for header, table, detail, and workspace content. The component absorbs CSS class computation and the master-detail-expanded layout structure. Each page becomes a thin data-fetching + row-rendering module.

**Interface:**
```tsx
interface BrowserPageProps {
  /** Content above the master-detail layout (breadcrumbs, search, new button). */
  header?: ReactNode;
  /** The table body (<tbody>) rendered inside BrowserMasterPanel. */
  table: ReactNode;
  /** BrowserMasterPanel props (columns, colSpan, etc.). */
  masterPanelProps: Omit<BrowserMasterPanelProps, 'children'>;
  /** The detail panel content (null = not visible). */
  detail?: ReactNode;
  /** The workspace panel content (null = not visible). */
  workspace?: ReactNode;
  /** Detail panel props passed to BrowserDetailPanel. */
  detailPanelProps?: Partial<BrowserDetailPanelProps>;
  /** Workspace panel props passed to BrowserWorkspacePanel. */
  workspacePanelProps?: Partial<BrowserWorkspacePanelProps>;
  /** Loading state (shows "Loading…" when true and no table content). */
  loading?: boolean;
  /** Error message. */
  error?: string | null;
}
```

**Acceptance Criteria:**
- [ ] `BrowserPage.tsx` renders the three-panel layout with correct CSS classes based on `viewState`
- [ ] `LimsList.tsx` uses BrowserPage — CSS class computation removed from LimsList
- [ ] `LibraryView.tsx` uses BrowserPage — CSS class computation removed from LibraryView
- [ ] Both pages still handle: loading state, empty state, error display, exit animations
- [ ] `BrowserPage.test.tsx` covers:
  - [ ] List state: full-width master, no detail, no workspace
  - [ ] Detail state: master + detail visible, detail panel receives correct props
  - [ ] Expanded state: collapsed strip + detail + workspace
  - [ ] Exit animation class applied when `isExiting` is true
  - [ ] Header slot renders in correct position
  - [ ] Loading state shows "Loading…"
  - [ ] Error displays above the layout
- [ ] `LimsList.test.tsx` exists (currently missing) — basic smoke test for entity listing
- [ ] Existing tests pass: `npm test -- LibraryView LimsList`

**Risk:** Medium. This touches both browser pages and introduces a new shared component. The interface must be flexible enough for both Library (which has breadcrumbs in the header) and LIMS (which has search/type filter in the header via Layout).

**Effort:** ~2–3 hours.

---

## Slice 6: Split Settings Page into Sub-Modules

> 📋 **Detailed PRD:** [.docs/prd-12-frontend-deepening.md](../.docs/prd-12-frontend-deepening.md) — covers Slices 1, 4, 5, 6.

**Goal:** Break the 664-line Settings monolith into independently testable sub-modules.

**Strength:** Speculative

**Files:**
- `frontend/src/pages/settings/SettingsPage.tsx` — orchestrator (thin, ~30 lines)
- `frontend/src/pages/settings/TypeMasterPanel.tsx` — entity type list
- `frontend/src/pages/settings/TypeDetailPanel.tsx` — type editor + column CRUD
- `frontend/src/pages/settings/ColumnEditor.tsx` — per-column field editor
- `frontend/src/pages/settings/DangerZone.tsx` — deactivate/delete actions
- `frontend/src/pages/settings/__tests__/` — per-module test files
- `frontend/src/pages/Settings.tsx` — **deleted** (replaced by `settings/SettingsPage.tsx`)

**Problem:** Settings.tsx is 664 lines — the largest single file in the frontend. It implements its own master-detail layout with `.settings-master-detail` CSS classes, separate from the shared browser components. It has no tests. The module is shallow: the interface (one giant component) is nearly as complex as the implementation.

**Solution:** Split into panel-sized sub-modules. Each becomes independently testable. The page orchestrator wires panels together but owns no layout CSS. Whether Settings adopts BrowserMasterPanel/BrowserDetailPanel shells is secondary to splitting the monolith.

**Acceptance Criteria:**
- [ ] `settings/SettingsPage.tsx` is ≤50 lines (orchestrator only)
- [ ] `settings/TypeMasterPanel.tsx` — entity type list with CRUD actions
- [ ] `settings/TypeDetailPanel.tsx` — type editor with column list
- [ ] `settings/ColumnEditor.tsx` — add/edit/remove columns for a type
- [ ] `settings/DangerZone.tsx` — deactivate/delete with confirmation
- [ ] Each sub-module has ≥1 test
- [ ] Existing settings functionality works identically: create type, edit type, add column, remove column, deactivate type
- [ ] `npm run build` succeeds

**Risk:** Medium-high. This is the largest slice and the most speculative — the current monolith works. The split must preserve all CRUD behavior without regressions. Testing is essential because Settings currently has zero test coverage.

**Note:** Settings is not a Browser per CONTEXT.md — it's a configuration page. Adopting BrowserMasterPanel/BrowserDetailPanel shells is optional; the real deepening is splitting the monolith into sub-modules.

**Effort:** ~3–4 hours.

---

## Execution Order

| Order | Slice | Depends on | Effort | Risk |
|-------|-------|-----------|--------|------|
| **1** | CSS Duplication Cleanup | — | 15 min | Zero |
| **2** | Unify TipTap Tree-Walker | — | 1–2 hrs | Low |
| **3** | Deepen Content Sync Pipeline | Slice 2 | 1–2 hrs | Low |
| **4** | Extract EntityDetailFields | — | 1 hr | Low |
| **5** | Extract BrowserPage Layout | — (benefits from 4) | 2–3 hrs | Medium |
| **6** | Split Settings Page | — | 3–4 hrs | Medium-high |

**Rationale:**

1. **Slice 1 first** — zero-risk cleanup that removes noise before refactoring. Builds momentum.
2. **Slice 2 before 3** — the unified walker enables the clean pipeline interface. They're a natural pair.
3. **Slices 2+3 before frontend work** — backend deepening creates the stable foundation. Frontend slices can proceed in parallel after.
4. **Slice 4 before 5** — EntityDetailFields is a smaller, lower-risk extraction that validates the "extract shared component" pattern before the larger BrowserPage extraction.
5. **Slice 6 last** — speculative, largest scope, highest risk. Delaying it lets the earlier slices prove the deepening approach works.

---

## Success Metrics

- **Interface shrinkage:** After Slices 2+3, `eln/views.py`'s `perform_create` and `perform_update` each drop from ~6 lines of sync orchestration to 1 line.
- **Test coverage:** Slices 4, 5, and 6 add tests for currently-untested modules (LimsDetailCard, EntityWorkspace, LimsList, Settings).
- **Deletion test:** Each extracted module passes — deleting it would concentrate complexity across callers, not make it vanish.
- **No regressions:** All existing test suites pass after every slice.
