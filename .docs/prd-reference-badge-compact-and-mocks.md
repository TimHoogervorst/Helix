# PRD: ReferenceBadge — Mock Unification + Compact Mode

> Issue: [#28](https://github.com/TimHoogervorst/OpenScience/issues/28)
> Created: 2026-06-29
> Status: Ready for Implementation
> Parent: Grill Session 2026-06-29

---

## Problem Statement

The `ReferenceBadge` component is a shared visual element — it renders any display ID as a pill with multiple visual states (clickable blue, non-clickable gray, broken red, loading). It is used across 10 sites spanning the Library console, LIMS console, ELN editor, Entity workspace, and Settings pages. Two problems exist:

**1. Mock duplication.** Across 7 test files that render components containing a ReferenceBadge, the component is mocked 7 times with 4 distinct shapes. Three test files (LibraryConsole, LibraryTable, ElnDetailCard) copy-paste the exact same 13-line inline mock. Two more (TypeMasterPanel, TypeDetailPanel) copy-paste another identical mock. If the mock interface changes, all 7 files must be touched individually — and they will diverge over time.

**2. Duplicated title rendering.** In 7 of the 10 usage sites, the ReferenceBadge renders a title span (e.g., "PCR Result") while the same title is displayed immediately adjacent — in the next table column, in the same heading, or in the same metadata row. The badge's title span is redundant with its surrounding context. Examples:

- Master list ID column: badge with title, then the Name column repeats the same title
- Detail panel header: `<h2><Badge title="PCR" /> PCR</h2>` — title appears twice
- Entity workspace header: same pattern, badge title + entity name in the same line

## Solution

**Phase 1: Unify ReferenceBadge mocks into a single factory.** Create a `makeMockReferenceBadge()` factory in the shared test helpers. The factory produces a canonical mock that renders structurally realistic DOM (CSS classes, data attributes, child spans) based on a configuration object. It supports `clickable`, `resolved`, `compact`, and `testId` options. All 7 test files import the factory instead of defining their own inline mocks — 13-line mocks become 3-line calls.

**Phase 2: Add a `compact` prop to ReferenceBadge.** A `compact?: boolean` prop (default `false`) that omits the `ref-badge-title` span from rendered output. When `true`, the badge renders only the icon + display ID — the title is left for the surrounding context to display. `compact` is orthogonal to `clickable` and is silently ignored when there's no resolved title to hide (loading, broken, bare-displayId states).

**Phase 3: Update the 7 compact call sites.** Switch call sites where the badge title is redundant with adjacent text to use `compact={true}`. The 3 standalone sites (Source col, Source Entry, inline Reference) stay unchanged.

## User Stories

1. As a developer writing a test for a component that renders a ReferenceBadge, I want to call `makeMockReferenceBadge()` and get a canonical mock that renders the expected DOM, so that I write 3 lines instead of 13.

2. As a developer changing the ReferenceBadge's DOM structure (e.g., adding `aria-label`), I want to update the mock factory once and have all consuming tests pick up the change, so that mock divergence doesn't mask real rendering changes.

3. As a developer adding a third console instance (e.g., Protocols), I want to use the same `makeMockReferenceBadge({ compact: true })` that existing consoles use, so that the new console's tests are consistent.

4. As a developer, I want the mock factory to render structurally similar DOM to the real component (span vs anchor, CSS classes, data attributes), so that tests using the mock catch layout-level regressions, not just text content.

5. As a developer, I want `ReferenceBadge.test.tsx` to continue testing the **real** component directly, so that the real component's behavior is verified independently of its consumers.

6. As a user viewing a master list (Library or LIMS), I want the ID column badge to show only the icon and display ID, so that the name column provides the single source of truth for the item's name.

7. As a user viewing a detail panel header, I want the badge to show only the icon and display ID, so that the heading text next to it is the sole display of the item's name without duplication.

8. As a user viewing an entity or entry workspace header, I want the badge to be compact, so that the workspace title is not cluttered by a duplicated name inside the badge.

9. As a user viewing an inline reference (TipTap mention or AG Grid Reference column), I want the badge to remain full-size with the title visible, because there is no adjacent text showing the target's name.

10. As a user viewing a source entry link (in a LIMS master row or entity detail), I want the badge to remain full-size with the title visible, because the badge is the only place the source entry's identity is shown.

## Implementation Decisions

### Why a mock factory, not a test wrapper component

Vi's mocking (`vi.mock`) is a compile-time hoisted call — it must be at the top of the test file, before any imports. A test wrapper component would need to be imported, creating a circular dependency. A factory function that returns a mock implementation avoids this — `vi.mock` hoists, the factory is called inline.

### Why render structurally similar DOM (not just bare text)

The current mocks render `<span>{displayId}</span>` — they lose CSS classes, data attributes, icon spans, and link wrapping. This means tests pass even when mock-rendered components break the real layout. The factory renders `<span class="reference-badge is-nonclickable">...` with correct child spans, so tests that query by `data-testid` or CSS class continue to work, and tests that assert on child structure get realistic output.

### Why `compact` is a prop, not a separate component

A `CompactReferenceBadge` component would share ~90% of its rendering logic with ReferenceBadge — the only difference is a single `<span>` element. Two components would mean two sets of tests, two mock factories, and twice the maintenance surface. A boolean prop keeps the interface simple and the implementation DRY.

### Why `compact` is silently ignored when no title exists

In loading, broken, and bare-displayId states, there is no title span to hide. Having `compact` throw or warn in these states would force every call site to guard: `compact={hasTitle && isCompact}`. Silently ignoring it means callers like `DisplayIdCellRenderer` can hardcode `compact={true}` without worrying about the badge's resolution state.

### Why the icon always shows

The icon communicates the *type* of the referenced item (📄 for entries, 🧪 for entities). This is valuable context even when the title is shown elsewhere. Compact mode removes only the redundant text, not the type indicator.

### URL construction stays internal

The `badgeHref()` function inside ReferenceBadge continues to construct navigation URLs from the resolved data's type and display ID. No external `href` prop is added at this stage — URL construction will be revisited when an API endpoint for workspace URL resolution exists.

### Compact call sites (7)

Master list ID column (Library and LIMS), detail panel header (ELN and LIMS), workspace header (Entity and Entry), and the AG Grid displayId index column (`DisplayIdCellRenderer`).

### Non-compact call sites (3, unchanged)

Master list Source column (LIMS), entity detail Source Entry field (`EntityDetailFields`), inline TipTap references (`ReferenceNode`), and AG Grid Reference columns (`ReferenceCellRenderer`).

### Mock factory configuration

| Config | Rendered output |
|--------|----------------|
| `{}` (default) | `<span data-testid="ref-badge" data-display-id={displayId} class="reference-badge is-nonclickable"><span class="ref-badge-id">{displayId}</span></span>` |
| `{ resolved: { title: "PCR" } }` | Non-clickable badge with icon + id + title spans |
| `{ clickable: true }` | Clickable badge with `data-clickable="true"` |
| `{ clickable: true, resolved: {...} }` | `<a>` with correct href, icon + id + title |
| `{ clickable: true, resolved: null }` | Broken red pill |
| `{ compact: true, resolved: {...} }` | Icon + id only, no title span |
| `{ compact: true, clickable: true, resolved: {...} }` | `<a>` with icon + id only |

## Testing Decisions

### Seams

Only two seams are introduced or modified:

1. **`ReferenceBadgeProps` interface** (existing, modified) — the `compact` prop is added. The existing `ReferenceBadge.test.tsx` tests the real component through its props using React Testing Library. Two new test cases cover compact behavior.

2. **`makeMockReferenceBadge()` factory** (new) — a pure function returning a `vi.fn()` mock. Tested once in a dedicated factory test file with ~10 cases covering all config combinations. Consumer tests import the factory instead of writing inline mocks.

No new contexts, providers, or hooks are needed.

### What makes a good test

- **For the real component**: Render with props, assert DOM structure. Tests should verify that `compact` removes the title span and that `compact` + `clickable` still produces a working anchor. Never test implementation details like internal state or effect timings.
- **For the mock factory**: Call the factory with each config variant, render the resulting mock component, assert the rendered DOM matches the canonical structure. These are pure unit tests — no React context, no API calls.
- **For consumer tests**: Assert that the expected `data-display-id` or `data-testid` is present. Never assert on internal ReferenceBadge structure — that's the factory's responsibility.

### Factory tests (~10 cases)

Default mock renders bare displayId, resolved mock renders icon + id + title, clickable mock renders with data-clickable, clickable + resolved renders anchor with href, clickable + broken renders red pill, broken state has no icon span, display ID renders with ref-badge-id class, mock supports testId override, compact + resolved renders no title span, compact + clickable + resolved renders anchor without title span.

### Prior art

The mock factory pattern follows the existing `frontend/src/test/test-setup.ts` pattern of centralized test infrastructure. The real component tests in `ReferenceBadge.test.tsx` establish the pattern of prop-driven DOM assertions that the new compact tests follow.

## Out of Scope

- Changes to the real ReferenceBadge component beyond adding the `compact` prop
- ReferenceProvider mock — the factory takes `resolved` as a direct prop; tests needing auto-resolve can wrap in a mocked ReferenceProvider per-test
- ReferenceBadgeCellRenderer mock — the AG Grid cell renderers are thin wrappers; no separate mock needed
- TipTap ReferenceNode mock — TipTap extension tests that render a full editor don't mock ReferenceBadge; they test the real pipeline
- External `href` prop — URL construction stays internal; will be revisited when a workspace URL resolution API endpoint exists
- Changing the Settings page ReferenceBadge usage — these use bare displayId with no resolved title; compact is a no-op

## Further Notes

### Dependency order

```
Phase 1: Add makeMockReferenceBadge to factories.ts           (independent — pure function)
Phase 2: Add factory tests                                    (depends on 1)
Phase 3: Update 7 consumer tests to use factory               (depends on 1 — parallel)
Phase 4: Add compact prop to real ReferenceBadge              (depends on 1 — independent of 3)
Phase 5: Add compact tests to ReferenceBadge.test.tsx         (depends on 4)
Phase 6: Update 7 call sites to use compact                   (depends on 4)
```

Phases 3, 4, and 5 can overlap.

### Risk of not doing this

- The 7 mock definitions diverge over time. A developer updates one mock for a new test but doesn't propagate to the other 6. Tests now have inconsistent ReferenceBadge behavior, masking layout bugs.
- The duplicated title in 7 call sites creates visual noise and wastes horizontal space in master tables. Users see the same text twice in close proximity — a design smell that erodes trust in the UI's polish.
- Adding a new ReferenceBadge visual state (e.g., "archived") requires updating 7 mocks. One will be missed.
- New test files copy-paste from old ones — the 7 becomes 10, then 15.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
