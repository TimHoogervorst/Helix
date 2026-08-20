# Table Kit as a Deep Typed Grid Module

**Status:** Proposed  
**Date:** 2026-08-20

## Context

Table blocks share the same interaction, rendering, selection, and clipboard
machinery, but previously assembled that machinery independently. The repeated
assembly made behavior fixes block-specific and forced each block to convert
typed values to and from a string grid at the clipboard boundary.

The Table Kit now provides the shared grid seam in the Shell. Result Table is
the first tracer migration and must preserve its existing document format and
domain behavior.

## Decision

Table Kit is a deep, renderer-agnostic module whose public seam is the
`<TableKit>` component and its prop types. It owns the interaction state
machine, cell registry, typed cell rendering/editing, clipboard serialization
and parsing, read-only filtering, bounds clamping, and generic grid layout.

The interface is a typed, controlled grid:

- Blocks resolve domain Column Types to operand shapes before passing columns
  to the Kit.
- Blocks pass rows as a two-dimensional grid of typed values and map callback
  positions and values back to their domain row objects.
- The Kit never evaluates formulas and never consults the Mod Registry or
  Column Types.
- Blocks retain persisted row and column state, registration, formula previews,
  server calls, and table-specific chrome.
- Per-cell read-only behavior is supplied by a predicate, allowing Result Table
  to protect Computed Field cells and registered-row Entity cells.
- Leading and trailing decoration slots provide non-selectable status and
  sticky action columns without making those decorations part of the grid.

The migration uses a strangler approach. Existing shared import paths remain
available through re-export shims while table blocks move onto the single
module. Result Table is migrated first as a behavior-preserving tracer; Registry
Table and Plain Table follow separately.

## Rationale

### Typed end-to-end grid

Keeping values typed from the block boundary through editing and clipboard
callbacks centralizes shape-specific parsing, formatting, invalid-value
skipping, and read-only filtering. Blocks no longer duplicate string-grid
conversion rules.

### Columns as data

Columns carry their resolved operand shape and shape-specific options. This
keeps the Kit generic while allowing each block to resolve domain-specific
Column Types, including Result Table's entity-picker constraints and computed
field result shapes.

### Controlled data flow

The Kit renders supplied rows and emits edits, paste operations, and clears. It
does not own persisted document state, which keeps TipTap attributes and domain
actions in their owning block.

### Decoration slots

Leading and trailing slots let blocks compose status and action affordances
around one shared selectable grid. The slots remain inside the scroll container
while staying outside grid selection semantics.

## Consequences

- Selection, editing, rendering, clipboard behavior, and cell read-only
  filtering have one implementation seam and component test seam.
- New table blocks can use typed columns, controlled rows, decoration slots,
  and clipboard behavior without reassembling grid infrastructure.
- Formula evaluation remains governed by ADR-0019 and stays in the block.
- The Result Table migration does not change stored TipTap document data.
- During incremental migration, compatibility re-exports preserve old import
  paths; they can be removed after all table blocks use Table Kit.
- Table Kit's interface becomes a shared dependency, so changes to its
  interaction or value semantics require cross-block regression coverage.

## Rejected Alternatives

- **Keep a string grid at the block boundary:** rejected because it preserves
  conversion duplication and makes shape-specific behavior inconsistent.
- **Let Table Kit own row or document state:** rejected because persisted TipTap
  attributes and domain actions belong to the table block.
- **Pass render callbacks for every cell:** rejected because it leaks grid
  interaction and typed value handling back into each block.
- **Put formula evaluation in Table Kit:** rejected because formula ownership
  and backend authority remain with the Result Table block under ADR-0019.
- **Migrate every table block in the tracer:** rejected because Registry Table
  and Plain Table need separate, behavior-preserving follow-up migrations.
