# PRD: Test Infrastructure Deepening — Document Factory, LIMS Console Tests, TipTap Extension Tests

> Issue: [#TBD]()
> Created: 2026-06-27
> Status: Ready for Agent

---

## Problem Statement

The OpenScience codebase has three intersecting test gaps that collectively undermine developer confidence and make future refactors risky:

1. **TipTap document fixtures are duplicated 6+ times across backend test files.** `EMPTY_DOC`, `make_lims_table_doc()`, and `make_doc_with_ref()` are copy-pasted into every test file that needs them. When the TipTap JSON schema evolves (new node types, new attributes), every copy must be found and updated — a recipe for drift and inconsistent test data.

2. **The LIMS Console has zero tests.** ADR-0004 mandates that "shared code has shared tests; browser-specific code has browser-specific tests." The Library Console at `/library` has 3 test files with 23 test cases. The LIMS Console at `/lims` has an empty `__tests__/` directory. A developer can break the LIMS console (search, filtering, row selection, ViewState transitions, Load More) without any failing test.

3. **All five TipTap extensions have zero tests.** `Reference.ts`, `ReferenceSuggestion.ts`, `SlashCommands.ts`, `LimsTable.ts`, and `LimsTableNode.tsx` (617 lines — the most complex component in the frontend) have no test coverage. These extensions form the editor surface where users type `#references`, `/commands`, and insert `limsTable` nodes. A regex change in the Reference input rule, a keyboard navigation bug in the suggestion dropdown, or a malformed attribute parse in LimsTable silently corrupts editor documents.

These three items are **ordered by dependency**: Item 1 creates shared test utilities that Items 2 and 3 can use. Item 2 fills an ADR-0004 mandate. Item 3 protects the editor surface.

## Solution

### Item 1: Consolidate test fixtures into a shared Document Factory

Create a single, canonical Python module that exports all shared TipTap document factories. Every test file imports from this module instead of defining its own copy.

### Item 2: Write LIMS Console tests

Write a test suite for `LimsConsole.tsx` that matches the coverage of the Library Console tests (loading state, empty state, data rendering, URL parameter passing, row selection/deselection, navigation, Load More).

### Item 3: Write TipTap extension tests

Write tests for all five extensions. For the simpler extensions (`Reference.ts`, `LimsTable.ts`), test the input rules, attribute parsing, and HTML round-trips. For the complex extensions (`ReferenceSuggestion.ts`, `SlashCommands.ts`), extract and test the dropdown renderer lifecycle, keyboard navigation, and pure functions like `fuzzyMatch`. For `LimsTableNode.tsx`, test the pure data transformation functions and key event handlers.

## User Stories

### Item 1 — Document Factory

1. As a backend developer writing a new test, I want to import `EMPTY_DOC` from a shared module, so that I do not need to know the exact TipTap JSON structure for an empty document.

2. As a backend developer writing a sync test for a new node type, I want to call `make_lims_table_doc(schema_id, rows, entity_type)` from a shared factory, so that I build a valid limsTable document without copy-pasting the node structure.

3. As a backend developer writing a reference sync test, I want to call `make_doc_with_ref(display_id)` from a shared factory, so that I build a valid reference document in one line.

4. As a developer evolving the TipTap JSON schema (e.g., adding a `version` field to all nodes), I want to update the Document Factory in one place and have all tests pick up the change, so that test data stays consistent with the schema.

5. As a developer reading a test for the first time, I want the test data to come from a named, documented module, so that I understand what each fixture represents without reverse-engineering a raw JSON dict.

6. As a developer adding a new node type to the editor, I want a single place to add the corresponding test factory function, so that subsequent tests for that node type benefit from the factory immediately.

### Item 2 — LIMS Console Tests

7. As a developer working on the LIMS Console, I want a failing test when I break the entity list rendering, so that I can refactor the component with confidence.

8. As a developer adding a new filter to the LIMS Master table, I want a failing test when I break the `?search=` parameter passing, so that search functionality is protected by contract.

9. As a developer adding a new filter to the LIMS Master table, I want a failing test when I break the `?type=` parameter passing, so that entity type filtering is protected by contract.

10. As a developer modifying the ViewState machine, I want a failing test when I break the List → Detail → Expanded progression in the LIMS console, so that the shared state machine is validated in browser-specific integration tests as ADR-0004 requires.

11. As a developer working on the LIMS API, I want a failing test when the LIMS console can no longer parse the API response, so that frontend-backend contract drift is caught immediately.

12. As a developer modifying row click behavior, I want a failing test when clicking a row no longer selects it, so that the core interaction of the console is protected.

13. As a developer modifying row click behavior, I want a failing test when clicking an already-selected row no longer deselects it (return to List state), so that the toggle behavior is protected.

14. As a developer modifying navigation, I want a failing test when the expand button no longer navigates to `/lims/{display_id}`, so that the Workspace entry point is protected.

15. As a developer adding Load More pagination, I want a failing test when the "Load More" button stops working, so that paginated entity lists continue to work.

16. As a user with no entities in the database, I want to see "No entities found." when the LIMS page is empty, so that I know the system is working but has no data.

17. As a user waiting for entities to load, I want to see a loading indicator, so that I know the system is fetching data.

18. As a developer adding entity type icons, I want the test suite to verify that entity rows render their type icon and name correctly, so that visual identity is contract-tested.

### Item 3 — TipTap Extension Tests

19. As a developer modifying the Reference input rule, I want a failing test when typing `#E1 ` no longer creates a reference node, so that the core reference syntax is protected.

20. As a developer modifying the Reference input rule regex, I want a failing test when display IDs with unexpected formats are incorrectly parsed, so that regex changes are validated against known-good patterns.

21. As a user typing a `#` character in the editor, I want the autocomplete dropdown to show matching entries and entities, so that I can reference things without typing their full display ID.

22. As a developer modifying the ReferenceSuggestion dropdown, I want a failing test when ArrowDown no longer moves the selection down, so that keyboard navigation is protected.

23. As a developer modifying the ReferenceSuggestion dropdown, I want a failing test when ArrowUp no longer moves the selection up, so that keyboard navigation is protected.

24. As a developer modifying the ReferenceSuggestion dropdown, I want a failing test when Enter no longer inserts the selected reference, so that the primary selection action is protected.

25. As a developer modifying the ReferenceSuggestion Space-to-convert logic, I want a failing test when typing `#E1` followed by Space no longer auto-converts to a reference node, so that power-user keyboard flow is protected.

26. As a developer modifying the ReferenceSuggestion dropdown, I want a failing test when pressing Escape no longer closes the dropdown, so that the dismiss action is protected.

27. As a developer modifying the ReferenceSuggestion API call, I want a failing test when the search query is not sent to the correct endpoint (`/references/search/?q=...`), so that the API contract is protected.

28. As a user typing `/` in the editor, I want to see available commands (at minimum "Table"), so that I can discover and use editor features.

29. As a developer modifying the SlashCommands fuzzy match, I want a failing test when typing `/tbl` no longer matches "Table", so that typo-tolerant search is protected.

30. As a developer modifying the SlashCommands fuzzy match, I want a failing test when typing `/xyz` (which should match nothing) incorrectly matches a command, so that false positives are prevented.

31. As a developer modifying the SlashCommands dropdown, I want a failing test when Enter no longer executes the selected command, so that command execution is protected.

32. As a developer modifying the SlashCommands dropdown, I want a failing test when Tab no longer executes the selected command, so that the alternative execution key is protected.

33. As a developer modifying the SlashCommands dropdown, I want a failing test when Escape no longer closes the dropdown, so that dismiss is protected.

34. As a developer modifying the `limsTable` node schema (adding a new attribute), I want a failing test when the HTML parse/render round-trip no longer preserves the new attribute, so that copy-paste across editors keeps data intact.

35. As a developer modifying the `limsTable` attribute parsing, I want a failing test when malformed JSON in `data-columns` crashes the parser instead of falling back to an empty array, so that corrupted HTML does not break the editor.

36. As a developer modifying the `limsTable` attribute parsing, I want a failing test when a non-integer `data-schema-id` crashes the parser instead of falling back to `null`, so that corrupted HTML does not break the editor.

37. As a developer modifying `LimsTableNode`, I want a failing test when `handleAddRow` no longer appends a row with default values, so that the add-row button is protected.

38. As a developer modifying `LimsTableNode`, I want a failing test when `handleDeleteSelected` no longer removes selected rows, so that row deletion is protected.

39. As a developer modifying `LimsTableNode`, I want a failing test when `handleCellValueChanged` no longer updates the correct row by display ID, so that cell editing is protected.

40. As a developer modifying `LimsTableNode`, I want a failing test when `handleAddColumn` no longer backfills existing rows with default values for the new column, so that adding a column does not create null cells.

41. As a developer modifying `LimsTableNode`, I want a failing test when `handleSelectSchema` does not preserve existing column values with matching names, so that switching schemas does not destroy user data.

42. As a developer modifying `LimsTableNode`, I want a failing test when the gear menu does not close on outside click, so that the gear menu UX is protected.

## Implementation Decisions

### Shared Document Factory module

A new module `backend/core/tests/factories.py` will export the three duplicated fixtures. This folder was chosen because:
- `core/` is the shared backend module already depended on by all workspace apps
- `core/tests/` already exists (contains `test_abstracts.py` and `test_walker.py`)
- The factory functions have zero domain dependencies — they construct pure JSON dicts matching the TipTap node schema

Interfaces:

**`EMPTY_DOC: dict`** — A constant. A TipTap JSON document with a single empty paragraph. Equivalent to: `{"type": "doc", "content": [{"type": "paragraph"}]}`.

**`make_lims_table_doc(schema_id: int, rows_data: list[list] | None = None, entity_type: EntityType | None = None) -> dict`** — Builds a TipTap document containing a single `limsTable` node with the given schema, rows, and optional entity type (for column definitions). If `rows_data` is omitted, the table has no rows. If `entity_type` is provided, its `columns` are used.

**`make_doc_with_ref(display_id: str) -> dict`** — Builds a TipTap document containing a paragraph with a `reference` node pointing at the given display ID, wrapped in "See … for details." text.

All existing test files will be updated to import from `core.tests.factories` instead of defining their own copies. The migration is purely mechanical: replace the inline definition with an import.

### LIMS Console test suite

A new test file `frontend/src/console/instances/lims/__tests__/LimsConsole.test.tsx` will be created. It follows the exact pattern established by `LibraryConsole.test.tsx`:

- **Mock the API client:** `vi.mock("../../../api/client", () => ({ get: mockGet }))` replaces the generic `get` function. This is the LIMS equivalent of mocking `getLibraryContents`.
- **Mock heavy dependencies:** `ReferenceBadge`, `ConsoleProvider`, `EntityWorkspace` are mocked with minimal DOM stubs (same pattern as Library tests).
- **Render in MemoryRouter:** A `renderLims(initialRoute)` helper wraps `LimsConsole` in `<MemoryRouter>` with the given URL.
- **Test data fixtures:** `emptyResponse` (PaginatedResponse with no results), `populatedResponse` (2-3 entities with different types), `paginatedResponse` (response with `next` URL for Load More testing).

Tests to write (18 test cases covering the full component contract):

| Test | What it verifies |
|------|-----------------|
| Shows loading state initially | API never resolves → "Loading..." visible |
| Shows empty state when no entities | API returns empty → "No entities found." visible |
| Renders entities from API | API returns entities → display IDs, names, type names visible |
| Renders entity type icons | Entity with `entity_type_icon` → icon renders |
| Renders source entry references | Entity with `source_entry_display_id` → ReferenceBadge renders |
| Renders dash for missing source | Entity without source → dash renders |
| Passes search param to API | `?search=PCR` → API called with `search=PCR` |
| Passes type filter to API | `?type=5` → API called with `type=5` |
| Passes both params to API | `?search=PCR&type=5` → both passed |
| Highlights selected row | Click row → row has `is-selected` class |
| Deselects on second click | Click selected row → returns to list, no selection |
| Click expand navigates to entity URL | Click ">" button → navigates to `/lims/{display_id}` |
| Expand button stops propagation | Click ">" → row click handler not called |
| Load More button visible when more pages exist | API returns `next` URL → "Load More" visible |
| Load More fetches and appends | Click Load More → API called with next URL, rows appended |
| Row click does nothing in expanded state | viewState="expanded" → row click ignored |
| Error state renders error message | API rejects → error message visible |
| Renders source entry ReferenceBadge as clickable | Entity with source → badge rendered with clickable prop |

### TipTap Extension Test Suite

Test files will be created at `frontend/src/extensions/__tests__/`. Each extension gets its own test file.

**Test infrastructure:** For testing TipTap extensions, the test suite will create real TipTap `Editor` instances in jsdom. This is the same approach the actual application uses — the editor is the seam. The pattern:

```typescript
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

function createEditor(content?: any, extensions?: any[]) {
  return new Editor({
    extensions: extensions || [StarterKit],
    content: content || { type: "doc", content: [{ type: "paragraph" }] },
  });
}
```

**For Reference.ts:** Create editor, type `#E1 `, assert document contains `reference` node with `displayId: "E1"`. Test `#BLOOD1 ` works. Test `#123 ` does NOT create reference (regex rejects). Test HTML parse/render round-trip.

**For ReferenceSuggestion.ts:** Extract `fetchItems`, `DISPLAY_ID_PATTERN`, and dropdown renderer to named exports. Test Space-to-convert logic (3 branches: match+results, match+no-results, no-match). Test keyboard navigation (ArrowDown/Up bounds, Enter selects, Escape dismisses). Test `allow()` rejects non-paragraph parents. Test `onExit` resets all state. Test `fetchItems` hits `/references/search/?q=...`.

**For SlashCommands.ts:** Extract `fuzzyMatch` and `getCommands` to named exports. Test `fuzzyMatch` thoroughly: exact match, subsequence match, case insensitive, non-match, empty query, query longer than text, single character. Test keyboard navigation. Test both Escape and `onExit` produce identical end state (no duplicated-cleanup drift).

**For LimsTable.ts:** Test `schemaId` parsing (valid integer, empty string, invalid string, missing). Test `columns`/`rows` JSON parsing with try/catch fallback. Test HTML round-trip.

**For LimsTableNode.tsx:** Extract `headerWithSymbol`, `emptyValues`, `columnDefFor` to named exports. Test each pure function. Test `handleAddRow`, `handleDeleteSelected`, `handleCellValueChanged`, `handleAddColumn` (including duplicate name rejection), `handleSelectSchema` (column merge). Test gear menu toggle and outside-click close. Test title edit on blur and Enter key. Test rendering with mock `NodeViewProps`: title, schema badge, "No schema" fallback, add-row button, gear button.

### Exported name extraction decisions

To make the TipTap extensions testable without changing behavior, the following internal functions will be extracted to named exports:

| Module | Symbol to export | Reason |
|--------|-----------------|--------|
| `SlashCommands.ts` | `fuzzyMatch` | Pure function with 7+ branching edge cases |
| `SlashCommands.ts` | `getCommands` | Factory function — test command set |
| `ReferenceSuggestion.ts` | `fetchItems` | API call — mockable seam |
| `ReferenceSuggestion.ts` | `DISPLAY_ID_PATTERN` | Regex — test independently |
| `LimsTableNode.tsx` | `headerWithSymbol` | Pure function — maps type to symbol |
| `LimsTableNode.tsx` | `emptyValues` | Pure function — maps column types to defaults |
| `LimsTableNode.tsx` | `columnDefFor` | Pure function — builds AG Grid column defs |

These extractions are additive (existing default exports are unchanged) and do not modify behavior. They expose internal functions that are already called indirectly through the extension.

### Order of implementation

1. **Item 1 first** — Create `backend/core/tests/factories.py`, update all 6+ test files to import from it. Pure refactor, no behavior change.
2. **Extract named exports** from TipTap extensions — the 7 exports listed above. No behavior change.
3. **Item 2 and Item 3 can proceed in parallel** once Items 1 and the extraction step are done.

## Testing Decisions

### What makes a good test

Tests must only test external behavior, not implementation details. Specifically:

- **For backend factories:** Tests verify the factory returns the correct JSON structure. The factory is tested once; consumers trust it.
- **For LIMS Console:** Tests render the component in a MemoryRouter, interact via accessible queries (`screen.getByText`, `screen.getByTitle`), and assert on rendered DOM. No assertions on internal state (`selectedId`, `selectedEntity`, `viewState`). No direct calls to `fetchEntities`.
- **For TipTap extensions:** Tests create a real TipTap `Editor` instance, simulate user input (typing, key events), and assert on the resulting TipTap JSON document or the rendered DOM. This is the same interface the user interacts with — the editor IS the external behavior.
- **For extracted pure functions:** Unit tests call the function with inputs and assert on outputs. These are the exception: pure functions HAVE no external behavior beyond their inputs/outputs, so direct testing is correct.
- **For NodeViews:** Tests render the React component with mock `NodeViewProps`, simulate user interactions (clicks, typing), and assert on DOM changes or `updateAttributes` calls.

### Modules tested

| Module | Test file | Type |
|--------|----------|------|
| `backend/core/tests/factories.py` | `backend/core/tests/test_factories.py` | Shared |
| `frontend/src/console/instances/lims/LimsConsole.tsx` | `.../lims/__tests__/LimsConsole.test.tsx` | Browser-specific |
| `frontend/src/extensions/Reference.ts` | `.../extensions/__tests__/Reference.test.ts` | Shared |
| `frontend/src/extensions/ReferenceSuggestion.ts` | `.../extensions/__tests__/ReferenceSuggestion.test.ts` | Shared |
| `frontend/src/extensions/SlashCommands.ts` | `.../extensions/__tests__/SlashCommands.test.ts` | Shared |
| `frontend/src/extensions/LimsTable.ts` | `.../extensions/__tests__/LimsTable.test.ts` | Shared |
| `frontend/src/extensions/LimsTableNode.tsx` | `.../extensions/__tests__/LimsTableNode.test.tsx` | Shared |

### Prior art

- **Library Console tests** at [frontend/src/console/instances/library/__tests__/LibraryConsole.test.tsx](../frontend/src/console/instances/library/__tests__/LibraryConsole.test.tsx) — the direct template for LIMS Console tests. Uses `vi.mock()` for API and heavy components, `MemoryRouter` for routing, `waitFor` for async assertions.
- **Library Table tests** at [frontend/src/console/instances/library/__tests__/LibraryTable.test.tsx](../frontend/src/console/instances/library/__tests__/LibraryTable.test.tsx) — template for testing row rendering, selection, and click handlers.
- **useConsoleView tests** at [frontend/src/console/core/__tests__/useConsoleView.test.tsx](../frontend/src/console/core/__tests__/useConsoleView.test.tsx) — template for testing shared ViewState transitions.
- **Backend sync tests** at [backend/workspaces/eln/tests/test_sync.py](../backend/workspaces/eln/tests/test_sync.py) — template for testing with database-backed fixtures.
- **ReferenceBadge tests** at [frontend/src/components/ReferenceBadge.test.tsx](../frontend/src/components/ReferenceBadge.test.tsx) — template for testing display ID resolution and clickable states.

### Stretch goal: Extract LimsTable component

If time allows, extract the inline `<tr>` rendering from `LimsConsole.tsx` into a separate `LimsTable.tsx` component (following the Library's `LibraryTable` pattern). This makes the table testable independently and would reduce `LimsConsole.tsx` by ~50 lines. The table component would accept `entities`, `selectedId`, `onRowClick`, and `onRowExpand` as props.

This is NOT required for the LIMS Console tests (row logic can be tested through `LimsConsole.test.tsx`), but it follows the pattern established by the Library console.

## Out of Scope

- **Backend test coverage for LIMS services.** `backend/workspaces/lims/tests/test_services.py` already has tests.
- **E2E tests with Playwright.** The tests described here are unit/integration tests running in vitest (jsdom) and pytest (Django TestCase).
- **ADR creation.** This work implements the testing strategy already mandated by ADR-0004, which is Accepted.
- **Extracting a `LimsTable` component.** Listed as stretch goal, not required.
- **Testing ReferenceNode.tsx and LimsTableNode.tsx as full AG Grid integrations.** AG Grid is complex; tests focus on data transformation logic and event handlers.
- **Testing the ReferenceProvider context.** Acknowledged as untested but not part of this PRD.
- **Deleting the `delete_all` endpoints.** Candidate 5 is not included.
- **Frontend BrowsableItem TypeScript interface.** Candidate 4 is not included.

## Further Notes

### Why these three items together

These three items form a natural deepening sequence:

1. **Document Factory** creates the shared test utilities that Items 2 and 3 can use. It has the highest leverage-to-effort ratio: one interface, 10+ call sites. When the next TipTap node type lands, the factory absorbs the change.

2. **LIMS Console tests** fill the gap identified in the architecture review. ADR-0004 explicitly mandates per-browser tests. The Library Console already has them; LIMS should match. This closes the biggest testing asymmetry in the frontend.

3. **TipTap extension tests** protect the editor surface. The extensions are the "surface area" of the editor — every `#reference`, `/command`, and `limsTable` node flows through them. They are currently the most complex untested code in the frontend.

### Dependency order

```
Item 1 (Document Factory)
    │
    ├── Item 2 (LIMS Console tests) — benefits from shared fixtures for test data
    │
    └── Named export extraction (7 symbols)
              │
              └── Item 3 (TipTap extension tests) — depends on extracted exports
```

A fresh session should start with Item 1, do the extraction step, then tackle Items 2 and 3 (which can be parallelized).

### Risk of not doing this

- **Item 1:** The next node type addition (e.g., `protocol` node) will create an 8th copy of `EMPTY_DOC` and a 3rd copy of `make_lims_table_doc`. Each copy is one more place to miss when the schema evolves.
- **Item 2:** The next Console feature (keyboard navigation, bulk selection, column sorting) will land in Library first and get tests. LIMS will get the same feature without tests — creating a growing testing asymmetry.
- **Item 3:** A change to the Reference input rule regex (to support a new display ID format) or the SlashCommands dropdown (adding new commands) will be made blind — no test will fail if the change breaks existing functionality.

### Token budget guidance

For a fresh session picking up this PRD:

- Item 1: ~2K tokens (pure refactor, mechanical edits)
- Extraction step: ~3K tokens (7 small edits)
- Item 2: ~8K tokens (one test file, 18 test cases, following Library pattern)
- Item 3: ~15K tokens (5 test files, ~40 test cases across all extensions)

Total: ~28K tokens for all three items.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
