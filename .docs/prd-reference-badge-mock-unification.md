# PRD: Unify ReferenceBadge Mock Implementations

> Issue: [#TBD]()
> Created: 2026-06-27
> Status: Needs Grill Session
> Parent: Architecture Review — Candidate 5

> **⚠️ Alignment Note:** The ReferenceBadge is a shared component used across both the Library and LIMS console instances — it's already aligned with ADR-0004's principle of "shared code has shared tests." However, the current mock duplication pattern across 7 test files suggests that the mock strategy might need to evolve alongside how ReferenceBadge is rendered in different contexts (Master row, Detail card, TipTap inline node, AG Grid cell). The author intends to revisit this with a grill session to ensure the mock unification approach aligns with ADR-0004's slot-based rendering model: ReferenceBadge appears in Library as an Entry detail badge, in LIMS as a Master-row badge + source-entry link, and in Settings as a prefix-only badge. A grill session will walk through whether one mock factory serves all contexts or whether context-specific mock wrappers are needed.

---

## Problem Statement

The [`ReferenceBadge`](../frontend/src/components/ReferenceBadge.tsx) component is a shared visual element — it renders any display ID as a pill with multiple visual states (clickable blue, non-clickable gray, broken red, loading). It is used by both the Library and LIMS console instances, the ELN editor, and the Settings pages.

Across the **7 test files** that render components containing a ReferenceBadge, the component is mocked **7 times** with **4 distinct shapes**. Five of the seven are exact copies of another mock:

| # | File | Lines | Props mocked | Clickable? | Duplicate of |
|---|------|-------|-------------|------------|--------------|
| A | [`LimsConsole.test.tsx`](../frontend/src/console/instances/lims/__tests__/LimsConsole.test.tsx) | 45–64 | displayId, resolved (title, icon, type), clickable | Yes | Unique |
| B | [`LibraryConsole.test.tsx`](../frontend/src/console/instances/library/__tests__/LibraryConsole.test.tsx) | 23–36 | displayId, resolved (title) | No | Group 1 (shared with C, D) |
| C | [`LibraryTable.test.tsx`](../frontend/src/console/instances/library/__tests__/LibraryTable.test.tsx) | 7–19 | displayId, resolved (title) | No | Group 1 (identical to B, D) |
| D | [`ElnDetailCard.test.tsx`](../frontend/src/workspaces/eln/__tests__/ElnDetailCard.test.tsx) | 24–37 | displayId, resolved (title) | No | Group 1 (identical to B, C) |
| E | [`EntityDetailFields.test.tsx`](../frontend/src/components/__tests__/EntityDetailFields.test.tsx) | 10–23 | displayId, clickable | Yes (with "(link)" suffix) | Unique |
| F | [`TypeMasterPanel.test.tsx`](../frontend/src/pages/settings/__tests__/TypeMasterPanel.test.tsx) | 7–11 | displayId only | No | Group 2 (shared with G) |
| G | [`TypeDetailPanel.test.tsx`](../frontend/src/pages/settings/__tests__/TypeDetailPanel.test.tsx) | 7–11 | displayId only | No | Group 2 (identical to F) |

Three test files (LibraryConsole, LibraryTable, ElnDetailCard) copy-paste **the exact same mock**:

```typescript
vi.mock("../components/ReferenceBadge", () => ({
  default: ({ displayId, resolved }: { displayId: string; resolved?: { title: string } }) => (
    <span data-testid="ref-badge" data-display-id={displayId}>
      {resolved?.title ?? displayId}
    </span>
  ),
}));
```

Two more (TypeMasterPanel, TypeDetailPanel) copy-paste another identical mock:

```typescript
vi.mock("../../components/ReferenceBadge", () => ({
  default: ({ displayId }: { displayId: string }) => (
    <span data-testid="ref-badge">{displayId}</span>
  ),
}));
```

The two unique mocks (LimsConsole, EntityDetailFields) add clickable handling but share the same general pattern (span + data-testid + data-display-id).

This is structural cloning at the mock layer. If `data-testid` changes (e.g., to follow a new naming convention), 7 files must be updated. If the mock interface changes, all 7 must be touched. The real `ReferenceBadge` component has 6 visual states — but the mocks flatten it to `<span>{displayId}</span>`, losing fidelity.

## Solution

Create a single **`mockReferenceBadge` factory** that produces a canonical mock for ReferenceBadge. The factory accepts an optional config to control clickable behavior, resolved data, and broken state. Each test file imports the factory instead of defining its own inline mock.

### Interface

```typescript
// frontend/src/test/factories.ts (alongside Candidate 4 fixtures)

interface MockReferenceBadgeConfig {
  /** default false — if false and no resolved data, renders bare displayId */
  clickable?: boolean;
  /** Pre-resolved data — omit for loading state, null for broken state */
  resolved?: { displayId: string; title: string; type?: "entry" | "entity"; icon?: string } | null;
  /** Override the testid */
  testId?: string;
}

/**
 * Returns a vi.fn() mock for ReferenceBadge that renders a canonical
 * <span data-testid="ref-badge" ...> with the appropriate classes and
 * data attributes based on the config.
 */
function makeMockReferenceBadge(config?: MockReferenceBadgeConfig): Mock;
```

The mock renders:

| Config | Rendered output |
|--------|----------------|
| `{}` (default) | `<span data-testid="ref-badge" data-display-id={displayId} class="reference-badge is-nonclickable">{displayId}</span>` |
| `{ resolved: { title: "PCR" } }` | `<span data-testid="ref-badge" data-display-id={displayId} class="reference-badge is-nonclickable is-resolved"><span class="ref-badge-icon">📄</span><span class="ref-badge-id">{displayId}</span><span class="ref-badge-title">PCR</span></span>` |
| `{ clickable: true }` | `<span data-testid="ref-badge" data-display-id={displayId} data-clickable="true" class="reference-badge is-clickable">{displayId}</span>` |
| `{ clickable: true, resolved: { ... } }` | `<a data-testid="ref-badge" data-display-id={displayId} data-clickable="true" class="reference-badge is-clickable is-resolved" href="..."><span class="ref-badge-icon">📄</span><span class="ref-badge-id">{displayId}</span><span class="ref-badge-title">PCR</span></a>` |
| `{ clickable: true, resolved: null }` | `<span data-testid="ref-badge" data-display-id={displayId} data-clickable="true" class="reference-badge is-clickable is-broken" title="Reference not found">{displayId}</span>` |

### Usage after extraction

**Group 1** (LibraryConsole, LibraryTable, ElnDetailCard — 3 identical copies):

```typescript
// Before: 13 lines each, copy-pasted in 3 files
vi.mock("../components/ReferenceBadge", () => ({
  default: ({ displayId, resolved }: { displayId: string; resolved?: { title: string } }) => (
    <span data-testid="ref-badge" data-display-id={displayId}>
      {resolved?.title ?? displayId}
    </span>
  ),
}));

// After: 1 line
vi.mock("../components/ReferenceBadge", () => ({
  default: makeMockReferenceBadge({ clickable: false }),
}));
```

**Group 2** (TypeMasterPanel, TypeDetailPanel — 2 identical copies):

```typescript
// Before: 5 lines each
vi.mock("../../components/ReferenceBadge", () => ({
  default: ({ displayId }: { displayId: string }) => (
    <span data-testid="ref-badge">{displayId}</span>
  ),
}));

// After: 1 line
vi.mock("../../components/ReferenceBadge", () => ({
  default: makeMockReferenceBadge(),
}));
```

**LimsConsole** (unique — clickable + resolved):

```typescript
// Before: ~20 lines, custom mock with elaborate click handling
// After: 3 lines
vi.mock("../components/ReferenceBadge", () => ({
  default: makeMockReferenceBadge({ clickable: true }),
}));
```

**EntityDetailFields** (unique — clickable + "(link)" suffix):

The "(link)" suffix is a presentation detail that can either be added via the `resolved.title` property in the test assertion, or the test can use a custom mock. The factory covers the common case — if EntityDetailFields needs a truly unique rendering, it keeps its own mock.

### File layout after

```
frontend/src/
├── test/
│   ├── factories.ts              ← NEW: makeMockReferenceBadge (alongside data factories from Candidate 4)
│   └── test-setup.ts
├── components/
│   ├── ReferenceBadge.tsx         ← unchanged (real component, well-tested)
│   ├── ReferenceBadge.test.tsx    ← unchanged (direct tests — test the real ReferenceBadge, not the mock)
│   └── __tests__/
│       └── EntityDetailFields.test.tsx  ← thinned (uses factory or keeps custom mock)
├── console/instances/lims/__tests__/
│   └── LimsConsole.test.tsx       ← thinned
├── console/instances/library/__tests__/
│   ├── LibraryConsole.test.tsx    ← thinned
│   └── LibraryTable.test.tsx      ← thinned
├── pages/settings/__tests__/
│   ├── TypeMasterPanel.test.tsx   ← thinned
│   └── TypeDetailPanel.test.tsx   ← thinned
└── workspaces/eln/__tests__/
    └── ElnDetailCard.test.tsx     ← thinned
```

## User Stories

1. As a developer writing a test for a component that renders a ReferenceBadge, I want to call `makeMockReferenceBadge()` and get a canonical mock that renders the expected DOM, so that I write 1 line instead of 13.

2. As a developer changing the ReferenceBadge's DOM structure (e.g., adding `aria-label`), I want to update the mock factory once and have all 7 consuming tests pick up the change, so that mock divergence doesn't mask real rendering changes.

3. As a developer adding a third console instance (e.g., Protocols), I want to use the same `makeMockReferenceBadge({ clickable: true })` that LIMS uses, so that the Protocols console's tests are consistent with existing console tests.

4. As a developer, I want the mock factory to render structurally similar DOM to the real component (span vs anchor, CSS classes, data attributes), so that tests using the mock catch layout-level regressions, not just text content.

5. As a developer, I want `ReferenceBadge.test.tsx` to continue testing the **real** component directly (not the mock), so that the real component's behavior is verified independently of its consumers.

## Implementation Decisions

### Why a mock factory, not a test wrapper component

Vi's mocking (`vi.mock`) is a compile-time hoisted call — it must be at the top of the test file, before any imports. A test wrapper component would need to be imported, creating a circular dependency (the test imports a wrapper that imports the thing being mocked). A factory function that returns a mock implementation avoids this — `vi.mock` hoists, the factory is called inline.

### Why render structurally similar DOM (not just bare text)

The current mocks render `<span>{displayId}</span>` — they lose the CSS classes, data attributes, icon span, and link wrapping that the real component produces. This means tests pass even when the mock-rendered components break the real layout. The factory renders `<span class="reference-badge is-nonclickable">...` with the correct child spans, so tests that query by `data-testid` or CSS class continue to work, and tests that assert on child structure get realistic output.

### Why `ReferenceBadge.test.tsx` doesn't use the mock factory

`ReferenceBadge.test.tsx` tests the **real** ReferenceBadge component directly — it renders it with `@testing-library/react`, provides props, and asserts the rendered DOM. The mock factory is for **other components' tests** that happen to render a ReferenceBadge but don't want to test ReferenceBadge itself. This is the standard unit-vs-integration split: the real component has its own test suite; consumers test against a mock that behaves consistently.

### ADR-0004 alignment

ADR-0004 establishes that ReferenceBadge is a shared component used by both Library and LIMS console instances (line 175: "An Entity appears in the LIMS browser as a Master row and in the Library browser as a ReferenceBadge inside an Entry"). The ADR's testing principle — "shared code has shared tests" (lines 109–121) — extends naturally to shared mocks: a single mock factory for ReferenceBadge ensures all console instances test against the same mock behavior.

The grill session (flagged at the top of this PRD) will explore whether different rendering contexts (Master row, Detail card, TipTap inline node, AG Grid cell) need different mock variants, or whether one factory with configuration covers all contexts.

## Testing Decisions

The mock factory is a test helper — it is validated by the test suite that consumes it. However, a dedicated test ensures the factory's DOM output stays aligned with the real component:

| Test | What it verifies |
|------|-----------------|
| Default mock renders bare displayId | Non-clickable + no resolved → shows displayId text |
| Resolved mock renders icon + id + title | Non-clickable + resolved → gray pill with all three spans |
| Clickable mock renders with data-clickable | Clickable + loading → data-clickable="true" |
| Clickable + resolved renders anchor | Link wrapping with correct href |
| Clickable + broken renders red pill | `is-clickable is-broken` classes, "Reference not found" title |
| Broken state has no icon span | `ref-badge-icon` absent |
| Display ID renders with `ref-badge-id` class | Monospace font class applied |
| Mock supports `data-testid` override | Custom testId for tests that need to distinguish badges |

These ~8 tests live in a new `frontend/src/test/factories.test.ts` (or as a describe block in the existing ReferenceBadge test suite).

## Out of Scope

- **Changes to the real ReferenceBadge component.** The real component is well-tested and well-structured. This PRD is about the mocks only.
- **ReferenceProvider mock.** The `ReferenceProvider` context wraps ReferenceBadge for auto-resolve. The mock factory doesn't need ReferenceProvider — it takes `resolved` as a direct prop. Tests that need to exercise the auto-resolve path (clickable + no `resolved` prop) can optionally wrap the mock in a mocked ReferenceProvider, but that's per-test, not in the factory.
- **`ReferenceBadgeCellRenderer` mock.** The AG Grid cell renderer is a thin wrapper around ReferenceBadge and uses the same mock pattern. It's in scope implicitly (it calls ReferenceBadge), but no separate mock is needed.
- **TipTap ReferenceNode mock.** The `ReferenceNode.tsx` NodeView wrapper delegates to ReferenceBadge. TipTap extension tests that render a full editor (via `createTestEditor` from Candidate 4) don't need to mock ReferenceBadge — they test the real rendering pipeline.

## Further Notes

### Why now

Three identical mocks across LibraryConsole, LibraryTable, and ElnDetailCard is the tipping point. At two, it's a coincidence. At three, it's a pattern. At seven (across all mock sites), it's technical debt that compounds with every new component that uses ReferenceBadge.

### Dependency order

```
Step 1: Add makeMockReferenceBadge to factories.ts           (independent — pure function)
Step 2: Add factory tests                                    (depends on 1)
Step 3: Update Group 1 (LibraryConsole, LibraryTable,        (depends on 1 — parallel)
        ElnDetailCard) — 3 files
Step 4: Update Group 2 (TypeMasterPanel, TypeDetailPanel)    (depends on 1 — parallel)
        — 2 files
Step 5: Update LimsConsole.test.tsx                          (depends on 1 — parallel)
Step 6: Evaluate EntityDetailFields.test.tsx                 (depends on 1 — may keep custom mock)
```

Steps 3–6 can run in parallel after Step 1. Each is a mechanical replacement of ~13 lines with ~3 lines.

### Token budget

- Step 1: ~2K tokens (factory function ~50 lines)
- Step 2: ~2K tokens (8 test cases)
- Steps 3–6: ~0.5K tokens each (mechanical — delete 13 lines, add 3)

Total: ~7K tokens.

### Risk of not doing this

- The 7 mock definitions diverge over time. A developer updates the mock in LibraryConsole (adding a new data attribute for a new test) but doesn't propagate to LibraryTable or ElnDetailCard. The mocks are now inconsistent — one test's ReferenceBadge renders differently from the others, masking layout bugs.
- Adding a new ReferenceBadge visual state (e.g., "archived" with a strikethrough) requires updating 7 mocks. One will be missed.
- New test files copy-paste from old ones — the 7 becomes 10, then 15.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
