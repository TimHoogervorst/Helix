# PRD-05: ELN Table v2 — AG Grid Backbone

**Date:** 2026-06-24
**Status:** Approved, implementation started

## Problem

The current `limsTable` TipTap node stores table cells as TipTap `tableRow > tableCell > paragraph` nodes in the document tree. Row/column insertion requires fragile offset-based surgery on the TipTap document model, which has proven buggy. Additionally, cells are rich-text paragraphs with no type enforcement — a number column can accidentally hold prose, and the experience doesn't match the spreadsheet-like feel needed for structured sample data entry.

## Goal

Replace the TipTap-native table rendering with AG Grid Community (MIT) as the rendering backbone, stored as a JSON attribute on the same `limsTable` TipTap node. The result should feel like a Notion table: lightweight, no heavy borders, subtle horizontal row separators, typed columns, and inline spreadsheet-style editing.

## Architecture

```
TipTap limsTable node
├── attrs.schemaId       (number | null)
├── attrs.title          (string)
├── attrs.columns        (ColumnDef[])
├── attrs.rows           (RowData[])
└── NodeView → React → AG Grid (gridRef)
```

### Key Design Decisions

1. **JSON attribute, not TipTap content** — The node's `content` slot is no longer used for rows/cells. All table data lives in `attrs` as `columns` and `rows` JSON arrays. This makes row/col operations plain array manipulation.

2. **AG Grid Community (MIT)** — Chosen over Handsontable (dual-license) and TanStack Table (too thin — no built-in editing, resizing, scrolling). AG Grid provides typed cell editors, column resize/reorder/sort, virtual scrolling, and a clean API for extracting grid state.

3. **Manual save on ELN entry save** — Grid state stays in AG Grid's internal model during editing. When the user saves the ELN entry, the save flow calls `gridRef.api.forEachNode()` to serialize into the node attribute, then pushes entities to LIMS in batch.

4. **Rows are entities** — When schema-backed, each row maps to a LIMS Entity. The `display_id` (e.g., `BLOOD1`) is the row identifier. Unsaved rows get a placeholder `#`. Plain (non-schema) tables use the same data structure but never push to LIMS.

5. **Schema columns are a starting template** — Users can reorder, hide, and add custom columns locally without changing the entity type definition. Schema-defined columns cannot be renamed or deleted (they belong to the schema). Custom columns become extra keys in the entity's `properties` JSON.

6. **No migration** — Existing tables are being deleted. No backward-compatibility code needed.

## Data Model

### Node Attribute Schema

```json
{
  "schemaId": 3,
  "title": "Blood Samples",
  "columns": [
    { "name": "Volume", "type": "Number", "units": "mL" },
    { "name": "pH", "type": "Number" },
    { "name": "Notes", "type": "Text" }
  ],
  "rows": [
    {
      "entityId": 42,
      "displayId": "BLOOD1",
      "values": { "Volume": 10, "pH": 7.4, "Notes": "From batch A" }
    },
    {
      "entityId": null,
      "displayId": "#new",
      "values": { "Volume": 5, "pH": 6.8 }
    }
  ]
}
```

### Column Types → AG Grid Editors

| LIMS Type | AG Grid Editor | Notes |
|-----------|---------------|-------|
| Text | `agTextCellEditor` | Plain text input |
| Number | `agNumberCellEditor` | Numeric with stepper |
| Date | Custom date picker | Lightweight popup |
| Boolean | `agCheckboxCellRenderer` | Toggle on click |
| Reference | `agTextCellEditor` (for now) | Will become entity lookup dropdown |

## UX Details

### Visual Design
- Custom AG Grid theme (not built-in Alpine/Balham)
- No outer table border
- Column headers: subtle bottom border (1px solid #e0e0e0)
- Rows: thin horizontal separator only (1px solid #f0f0f0), no vertical borders
- Hovered row: light background (#f8f8f8)
- Selected cell: faint blue outline
- Row numbers column on left (entity `display_id`)

### Row Operations
- **Add**: Header button "Add Row" + bottom placeholder row with `+`
- **Delete**: Row context menu → Delete (soft-unlink from table, not hard-delete entity)
- **Duplicate**: Row context menu → Duplicate
- **Context menu**: Right-click row number → Delete / Duplicate / Insert above / Insert below
- No drag-to-reorder

### Column Operations
- **Add**: Header button → inline popover (name + type)
- **Resize**: Drag column edge (AG Grid built-in)
- **Sort**: Click header (AG Grid built-in)
- **Reorder**: Drag header (AG Grid built-in)
- Schema columns: reorder/hide allowed, delete/rename blocked

### Table Creation
- Slash command `/table` → inserts blank grid with schema picker prompt
- Slash command `/table <schema-name>` → inserts with schema columns pre-populated
- Header bar: title input + "Load Schema" button

### Cell Editing
- Single-click to edit
- Enter/click-out to commit
- Boolean: checkbox toggle
- Reference: plain text for now

### Save Flow
1. User presses Ctrl+S or clicks global save
2. ELN editor iterates all `limsTable` nodes
3. Each node's React component serializes AG Grid via `gridRef.api.forEachNode()` → updates node `attrs`
4. TipTap document is serialized with updated attributes
5. Backend `sync_entities` walks nodes, creates/updates entities, patches `entityIds` back
6. Response content replaces editor state (existing pattern from PRD-04)

### Row Identity
- Schema-backed tables: rows display entity `display_id` (e.g., `BLOOD1`)
- New unsaved rows: show `#` placeholder
- After save, backend-assigned `display_id` replaces placeholder
- Plain tables: rows always show `#1`, `#2`, etc.

## Implementation Plan (12 Steps)

| Step | Description |
|------|-------------|
| 1 | AG Grid POC — standalone component outside TipTap, confirming library fits |
| 2 | New `limsTable` node attribute schema (JSON columns + rows) |
| 3 | AG Grid embedded in NodeView — basic rendering from JSON data |
| 4 | Cell editing — typed editors (Text, Number, Boolean, Date) |
| 5 | Add/remove rows — header button + bottom `+` row |
| 6 | Add/remove/reorder columns — header button + drag |
| 7 | Schema loading — pick entity type, populate columns |
| 8 | Save: grid state → node attribute |
| 9 | Save: entities → LIMS batch endpoint |
| 10 | Reference column editor — entity lookup dropdown |
| 11 | Notion-style CSS theme |
| 12 | Slash command `/table [schema-name]` |

## Files to Touch

| File | Change |
|------|--------|
| `frontend/src/extensions/LimsTable.ts` | Rewrite — JSON attribute schema, no TipTap table content |
| `frontend/src/components/LimsTableNode.tsx` | Rewrite — AG Grid NodeView, gridRef, save callback |
| `frontend/src/components/LimsTableGrid.tsx` | New — AG Grid wrapper with column type mapping |
| `frontend/src/types/lims.ts` | Extend — RowData, GridColumn types |
| `frontend/src/styles.css` | Add — AG Grid theme overrides |
| `frontend/package.json` | Add — `ag-grid-community`, `ag-grid-react` |
| `backend/lims/services.py` | Update — `sync_entities` for new node format |
