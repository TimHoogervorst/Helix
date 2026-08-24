/**
 * React NodeView for the elnTable TipTap node.
 *
 * Renders a simple editable data table matching the prototype's
 * "Reagents & materials" table styling.  Supports:
 * - Click-to-edit column headers
 * - Full-cell typed editing: the cell becomes the editor in place
 * - Spreadsheet-style cell selection, arrow/Tab/Enter keyboard navigation,
 *   and TSV copy/paste via the shared useTableInteraction controller
 * - Ghost "+ New Row" button below the last row
 * - Ghost "+" button after the last column header
 *
 * All edits sync back to node attributes via ``updateAttributes``.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createBlockAdapter } from "../../../shell/src/mod-system/createBlockAdapter";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { TableKit } from "../../../shell/src/shared/table/TableKit";
import { TableChrome } from "../../../shell/src/shared/table/TableChrome";

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
  const draftRef = useRef(value);
  const editorRef = useRef<HTMLSpanElement>(null);

  const startEdit = useCallback(() => {
    setDraft(value);
    draftRef.current = value;
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draftRef.current.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    } else if (!trimmed && value) {
      // Don't clear the value if it was non-empty
      setDraft(value);
    }
  }, [value, onCommit]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
    draftRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!editing || !editorRef.current) return;
    editorRef.current.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editorRef.current);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing]);

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
      <span
        ref={editorRef}
        className={`outline-none focus:outline-none ${className}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        onInput={(e) => {
          draftRef.current = e.currentTarget.textContent ?? "";
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
        data-testid={dataTestId}
      >
        {draft}
      </span>
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
    const updatedColumns = [...columns, { id, name, type: "text" }];
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

  return (
    <TableChrome
      className="w-full table-layout-chrome--compact"
      data-layout="dynamic-bleed"
      data-testid="eln-table"
      title={
        <InlineEdit
          value={title}
          onCommit={handleTitleChange}
          readOnly={readOnly}
          className="text-sm font-medium text-foreground"
          aria-label="Table title"
          data-testid="table-title"
        />
      }
      addRow={!readOnly && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAddRow}
          aria-label="Add new row"
          data-testid="add-row-btn"
        >
          <Plus className="h-3 w-3" />
          <span>New Row</span>
        </Button>
      )}
    >
        <TableKit
          columns={columns.map((col) => ({
            header: (
              <div
                className="flex items-center gap-1"
                onMouseEnter={() => setHoveredColumn(col.id)}
                onMouseLeave={() => setHoveredColumn(null)}
              >
                <InlineEdit
                  value={col.name}
                  onCommit={(newName) => handleColumnRename(col.id, newName)}
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
            ),
            shape: "text",
            width: "10rem",
            cellTestId: (_, index) => `cell-${rows[index]?.id}-${col.id}`,
          }))}
          rows={rows.map((row) => columns.map((col) => row.cells[col.id]))}
          tableId="eln-table"
          readOnly={readOnly}
          onEdit={(position, value) => {
            const row = rows[position.row];
            const column = columns[position.column];
            if (row && column) handleCellChange(row.id, column.id, value);
          }}
          onClear={(positions) => {
            const updatedRows = rows.map((row, rowIndex) => {
              const rowPositions = positions.filter((position) => position.row === rowIndex);
              if (!rowPositions.length) return row;
              const cells = { ...row.cells };
              for (const position of rowPositions) {
                const column = columns[position.column];
                if (column) cells[column.id] = "";
              }
              return { ...row, cells };
            });
            updateAttrs({ rows: updatedRows });
          }}
          onPaste={(anchor, values) => {
            const updatedRows = rows.map((row, rowIndex) => {
              const pastedRow = values[rowIndex - anchor.row];
              if (!pastedRow || rowIndex < anchor.row) return row;
              const cells = { ...row.cells };
              columns.slice(anchor.column).forEach((column, offset) => {
                const value = pastedRow[offset];
                if (value !== undefined) cells[column.id] = value;
              });
              return { ...row, cells };
            });
            updateAttrs({ rows: updatedRows });
          }}
          trailingHeader={!readOnly ? (
            <button
              type="button"
              className="btn-icon grid place-items-center rounded"
              onClick={handleAddColumn}
              aria-label="Add column"
              data-testid="add-column-btn"
            >
              <Plus className="h-3 w-3" />
            </button>
          ) : undefined}
          renderTrailingCell={!readOnly ? (_, rowIndex) => {
            const row = rows[rowIndex];
            return (
              <button
                type="button"
                className="invisible btn-ghost grid place-items-center rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:visible"
                onClick={(e) => {
                  e.preventDefault();
                  if (row) handleDeleteRow(row.id);
                }}
                aria-label="Delete row"
                data-testid={`delete-row-${row?.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            );
          } : undefined}
          getRowProps={() => ({
            className: "hover:bg-surface transition-colors group",
          })}
          getCellProps={() => ({
            className: "h-10 min-w-[100px] font-[var(--font-label)] text-sm",
          })}
          emptyState={
            <div className="px-3 py-4 text-center text-xs text-muted-foreground italic">
              No rows yet
            </div>
          }
          data-testid="eln-table-grid"
        />
    </TableChrome>
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
