# Table Kit

The Shell owns the reusable table foundation. Table blocks own their domain
behavior, while `TableKit` owns the controlled typed grid and its interaction;
layout behavior remains available through the shared table module and its
compatibility primitives.

## Frozen Contract

Table Kit uses native React and HTML through the existing TipTap node views.
TipTap/ProseMirror remains the document boundary: a table owns its clipboard
events and prevents the editor from processing them a second time. Kit
extraction preserves this interaction and visual behavior; it is not a table
redesign.

### Shared ownership

The Kit owns reusable behavior that is independent of a table block's domain:

- Typed cell rendering, editing, parsing, formatting, validation, and TSV serialization.
- Full-cell editing, commit/cancel behavior, keyboard navigation, and cell/range selection.
- Clipboard handling at the table boundary; TipTap/ProseMirror event isolation
  remains in the shared block-node wrapper.
- Explicit column tracks, width handling, stretch, horizontal overflow, opaque surfaces, and hover-only scrollbars.
- Leading and trailing grid decoration slots for block-owned status and actions.

### Block ownership

Registry Table, Plain Table, and Result Table retain their domain state and
actions. This includes row and column document state, schema selection and
hydration, the Registry Table Name pseudo-column, Result Table Entity Column
rules, registration, status indicators, server calls, and table-specific
toolbars.

Consumers use the Kit through the `<TableKit>` component and its prop types.
They do not duplicate cell dispatch, keyboard navigation, clipboard handling,
or table layout behavior in a mod. Result Table is the first completed tracer:
it resolves its Column Types to shapes, maps row objects to and from the typed
grid, and supplies Entity constraints, read-only rules, status, and actions at
the seam. Its existing component test suite remains unchanged and is the
behavior-preservation regression guard.

## Extraction And Migration Map

| Capability | Current owner | Target owner | Consumers | Test seam | Migration phase |
|---|---|---|---|---|---|
| Text, number, date, boolean, dropdown, entity-picker cells | ELN shared cell components and table node views | Table Kit | Registry, Plain, Result | Cell and Registry component tests | Kit extraction; deferred cell-editor updates are first |
| Full-cell editing, parsing, validation, errors | Table node views and shared cell components | Table Kit | Registry, Plain, Result | Cell interaction tests | Kit extraction |
| Arrow, Tab/Shift-Tab, Enter, Escape | `useTableInteraction` | Table Kit hook | Registry, Plain, Result | Interaction hook/component tests | Kit extraction |
| Active/range selection | `useTableInteraction` | Table Kit hook | Registry, Plain, Result | Selection and keyboard tests | Kit extraction |
| TSV copy/paste | `useTableInteraction` and node views | Table Kit | Registry, Plain, Result | Clipboard integration tests at TipTap boundary | Kit extraction |
| TipTap/ProseMirror event isolation | Shared block-node wrapper | Shared block-node wrapper | Registry, Plain, Result | TipTap node-view integration tests | Preserved at the editor boundary |
| Explicit tracks, stretch, overflow, opaque surfaces, hover scrollbars | Shared table layout primitives and node views | Table Kit layout primitives | Registry, Plain, Result | Table layout tests | Kit extraction |
| Leading/trailing grid decorations | Block table views | Table Kit | Registry, Plain, Result | TableKit component tests | Kit extraction |
| Row/column state and configurable Plain columns | ELN block state | Owning table block | Plain | Plain component tests | Plain migration |
| Schema picker and hydration | Registry Table | Registry Table | Registry | Registry component tests | Registry migration |
| Name pseudo-column | Registry Table | Registry Table | Registry | Registry component tests | Registry migration |
| Registration and status indicators | Registry Table | Owning table block | Registry, Result | Registration component/API tests | Registry migration; Result construction complete |
| Entity Column constraints and lock-after-registration | Result Table | Result Table | Result | Result component and backend tests | Result construction complete |

The migration order is the Kit contract, Kit extraction, Result Table tracer,
then Registry and Plain migrations. Result Table construction is complete and
formula evaluation remains in the block under ADR-0019.

## Layout primitives

- `TableScroll` constrains table content and provides horizontal scrolling with a scrollbar revealed on hover.
- `StickyActionHeader` and `StickyActionCell` keep a right-side action column visible.
- `TableChrome` provides a title bar, optional toolbar slot, table content, and optional add-row affordance.

Table consumers use the shared constrained scroll primitive and must not couple
layout behavior to a specific table block.
