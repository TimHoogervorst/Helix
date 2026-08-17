/**
 * React NodeView for the elnTable TipTap node.
 *
 * Renders a simple editable data table matching the prototype's
 * "Reagents & materials" table styling.  Supports:
 * - Click-to-edit column headers
 * - Click-to-edit cells
 * - Ghost "+ New Row" button below the last row
 * - Ghost "+" button after the last column header
 *
 * All edits sync back to node attributes via ``updateAttributes``.
 */
import { useCallback, useState } from "react";
import { createBlockAdapter } from "../../../shell/src/mod-system/createBlockAdapter";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { getCellEditor } from "../../../shell/src/shared/components/CellEditors";

// ── Types ───────────────────────────────────────────────────────────────

export interface TableColumn {
  id: string;
  name: string;
  type?: string;
}

export interface TableRow {
  id: string;
  cells: Record<string, unknown>;
}

interface TableBlockContentProps {
  title: string;
  columns: TableColumn[];
  rows: TableRow[];
  updateAttrs: (attrs: Record<string, unknown>) => void;
  readOnly?: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────

const DEFAULT_TITLE = "Table";
const NEW_COLUMN_PREFIX = "Column ";
const MOCK_DROPDOWN_OPTIONS = ["Researcher", "Reviewer", "Operator"];

// ── Helpers ─────────────────────────────────────────────────────────────

function nextColumnName(columns: TableColumn[]): string {
  const indices = columns
    .map((c) => {
      const match = c.name.match(/^Column (\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });
  const max = indices.length > 0 ? Math.max(...indices) : 0;
  return `${NEW_COLUMN_PREFIX}${max + 1}`;
}

function TypedTableCell({
  column,
  value,
  onCommit,
}: {
  column: TableColumn;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const CellEditor = getCellEditor(column.type ?? "text");
  return (
    <CellEditor
      value={value}
      onCommit={onCommit}
      columnName={column.name}
      dropdownOptions={column.type === "dropdown" ? MOCK_DROPDOWN_OPTIONS : undefined}
      workspaceId="eln"
    />
  );
}

// ── Inline Edit ─────────────────────────────────────────────────────────

/**
 * A lightweight inline-editable span.
 * Click to edit, blur/Enter to commit, Escape to cancel.
 */
function InlineEdit({
  value,
  onCommit,
  className = "",
  placeholder = "",
  readOnly = false,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
}: {
  value: string;
  onCommit: (newValue: string) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const startEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    } else if (!trimmed && value) {
      // Don't clear the value if it was non-empty
      setDraft(value);
    }
  }, [draft, value, onCommit]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [commit, cancel],
  );

  if (editing && !readOnly) {
    return (
      <input
        type="text"
        className={`w-full border border-primary/30 bg-panel px-1 py-0.5 text-inherit outline-none focus:border-primary ${className}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        autoFocus
        aria-label={ariaLabel}
        data-testid={dataTestId}
      />
    );
  }

  return (
    <span
      className={`${readOnly ? "" : "cursor-text"} ${value ? "" : "italic text-muted-foreground"} ${className}`}
      {...(!readOnly && {
        onClick: startEdit,
        role: "button",
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent<HTMLSpanElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startEdit();
          }
        },
      })}
      aria-label={ariaLabel}
      data-testid={dataTestId}
    >
      {value || placeholder}
    </span>
  );
}

// ── Inner Content Component (shared by old + new wrappers) ──────────────

/**
 * Pure rendering logic for the table block.
 *
 * Decoupled from TipTap's NodeViewWrapper so it can be reused by both
 * the legacy `TableNodeView` (NodeViewProps → NodeViewWrapper) and
 * the new `TableBlockComponent` (BlockComponentProps, no wrapper —
 * BlockNodeView provides it).
 */
export function TableBlockContent({
  title,
  columns,
  rows,
  updateAttrs,
  readOnly = false,
}: TableBlockContentProps) {
  // ── Title ──────────────────────────────────────────────────────────────
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      updateAttrs({ title: newTitle });
    },
    [updateAttrs],
  );

  // ── Column operations ──────────────────────────────────────────────────
  const handleColumnRename = useCallback(
    (colId: string, newName: string) => {
      const updated = columns.map((c) =>
        c.id === colId ? { ...c, name: newName } : c,
      );
      updateAttrs({ columns: updated });
    },
    [columns, updateAttrs],
  );

  const handleAddColumn = useCallback(() => {
    const id = crypto.randomUUID();
    const name = nextColumnName(columns);
    const updatedColumns = [...columns, { id, name }];
    // Backfill empty cell value into all existing rows
    const updatedRows = rows.map((r) => ({
      ...r,
      cells: { ...r.cells, [id]: "" },
    }));
    updateAttrs({ columns: updatedColumns, rows: updatedRows });
  }, [columns, rows, updateAttrs]);

  const handleDeleteColumn = useCallback(
    (colId: string) => {
      const updatedColumns = columns.filter((c) => c.id !== colId);
      const updatedRows = rows.map((r) => {
        const { [colId]: _, ...rest } = r.cells;
        return { ...r, cells: rest };
      });
      updateAttrs({ columns: updatedColumns, rows: updatedRows });
    },
    [columns, rows, updateAttrs],
  );

  // ── Hover state for column delete button ──────────────────────────────
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // ── Row operations ────────────────────────────────────────────────────
  const handleCellChange = useCallback(
    (rowId: string, colId: string, value: unknown) => {
      const updatedRows = rows.map((r) =>
        r.id === rowId
          ? { ...r, cells: { ...r.cells, [colId]: value } }
          : r,
      );
      updateAttrs({ rows: updatedRows });
    },
    [rows, updateAttrs],
  );

  const handleAddRow = useCallback(() => {
    const id = crypto.randomUUID();
    const cells: Record<string, unknown> = {};
    for (const col of columns) {
      cells[col.id] = "";
    }
    updateAttrs({ rows: [...rows, { id, cells }] });
  }, [columns, rows, updateAttrs]);

  const handleDeleteRow = useCallback(
    (rowId: string) => {
      updateAttrs({ rows: rows.filter((r) => r.id !== rowId) });
    },
    [rows, updateAttrs],
  );

  // ── Render ────────────────────────────────────────────────────────────
  const hasRows = rows.length > 0;

  return (
    <>
      <div
        className="rounded-lg border border-hairline bg-background"
        data-testid="eln-table"
      >
        {/* ── Title bar ──────────────────────────────────────────────── */}
        <div className="border-b border-hairline px-4 py-2.5">
          <InlineEdit
            value={title}
            onCommit={handleTitleChange}
            readOnly={readOnly}
            className="text-sm font-medium text-foreground"
            aria-label="Table title"
            data-testid="table-title"
          />
        </div>

        {/* ── Table ──────────────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-base">
            {/* ── Header ─────────────────────────────────────────────── */}
            <thead>
              <tr className="border-b border-hairline bg-surface text-left font-[var(--font-label)] text-2xs uppercase tracking-widest text-muted-foreground">
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className="min-w-[100px] px-3 py-2 font-medium"
                    onMouseEnter={() => setHoveredColumn(col.id)}
                    onMouseLeave={() => setHoveredColumn(null)}
                  >
                    <div className="flex items-center gap-1">
                      <InlineEdit
                        value={col.name}
                        onCommit={(newName) =>
                          handleColumnRename(col.id, newName)
                        }
                        readOnly={readOnly}
                        aria-label={`Column name: ${col.name}`}
                        data-testid={`column-header-${col.id}`}
                      />
                      {!readOnly && hoveredColumn === col.id && (
                        <button
                          type="button"
                          className="btn-ghost grid place-items-center rounded p-0.5 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.preventDefault();
                            handleDeleteColumn(col.id);
                          }}
                          aria-label={`Delete column ${col.name}`}
                          data-testid={`delete-column-${col.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                {/* Ghost "+" button for adding a column */}
                {!readOnly && <th className="w-10 px-0 py-2">
                  <button
                    type="button"
                    className="btn-icon grid place-items-center rounded"
                    onClick={handleAddColumn}
                    aria-label="Add column"
                    data-testid="add-column-btn"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </th>}
              </tr>
            </thead>

            {/* ── Body ────────────────────────────────────────────────── */}
            <tbody>
              {hasRows ? (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-hairline last:border-b-0 hover:bg-surface transition-colors"
                    onMouseEnter={() => setHoveredRow(row.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {columns.map((col) => (
                      <td key={col.id} className="min-w-[100px] px-3 py-2 font-[var(--font-label)] text-sm">
                        {readOnly ? (
                          <span className="inline-block px-4 py-2" data-testid={`cell-${row.id}-${col.id}`}>
                            {String(row.cells[col.id] ?? "")}
                          </span>
                        ) : (
                          <TypedTableCell
                            column={col}
                            value={row.cells[col.id]}
                            onCommit={(newValue) => handleCellChange(row.id, col.id, newValue)}
                          />
                        )}
                      </td>
                    ))}
                    {/* Delete row button on hover */}
                    <td className="w-10 px-0 py-2">
                      {!readOnly && hoveredRow === row.id && (
                        <button
                          type="button"
                          className="btn-ghost grid place-items-center rounded p-0.5 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.preventDefault();
                            handleDeleteRow(row.id);
                          }}
                          aria-label="Delete row"
                          data-testid={`delete-row-${row.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-3 py-4 text-center text-xs text-muted-foreground italic"
                  >
                    No rows yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Ghost "+ New Row" button below the card ──────────────────── */}
      {!readOnly && <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={handleAddRow}
        aria-label="Add new row"
        data-testid="add-row-btn"
      >
        <Plus className="h-3 w-3" />
        <span>New Row</span>
      </Button>}
    </>
  );
}
/**
 * Slot-system block component for the ELN table.
 *
 * Receives `BlockComponentProps` (no NodeViewWrapper — BlockNodeView
 * provides one). Renders the same inner content as the legacy NodeView.
 */
export const TableBlockComponent = createBlockAdapter(
  TableBlockContent,
  ({ instance, context }) => {
    const attrs = instance.attrs as Record<string, unknown>;
    return {
      title: (attrs.title as string) ?? DEFAULT_TITLE,
      columns: (attrs.columns as TableColumn[]) ?? [],
      rows: (attrs.rows as TableRow[]) ?? [],
      updateAttrs: instance.updateAttrs,
      readOnly: context.viewMode === "view",
    };
  },
);
