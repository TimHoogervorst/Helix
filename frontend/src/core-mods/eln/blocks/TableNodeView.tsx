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
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Plus } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────

export interface TableColumn {
  id: string;
  name: string;
}

export interface TableRow {
  id: string;
  cells: Record<string, string>;
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
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
}: {
  value: string;
  onCommit: (newValue: string) => void;
  className?: string;
  placeholder?: string;
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

  if (editing) {
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
      className={`cursor-text ${value ? "" : "italic text-muted-foreground"} ${className}`}
      onClick={startEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEdit();
        }
      }}
      aria-label={ariaLabel}
      data-testid={dataTestId}
    >
      {value || placeholder}
    </span>
  );
}

// ── NodeView ────────────────────────────────────────────────────────────

function TableNodeView(props: NodeViewProps) {
  const { node, updateAttributes } = props;

  const title = (node.attrs.title as string) ?? DEFAULT_TITLE;
  const columns: TableColumn[] = (node.attrs.columns as TableColumn[]) ?? [];
  const rows: TableRow[] = (node.attrs.rows as TableRow[]) ?? [];

  // ── Title ──────────────────────────────────────────────────────────────
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      updateAttributes({ title: newTitle });
    },
    [updateAttributes],
  );

  // ── Column operations ──────────────────────────────────────────────────
  const handleColumnRename = useCallback(
    (colId: string, newName: string) => {
      const updated = columns.map((c) =>
        c.id === colId ? { ...c, name: newName } : c,
      );
      updateAttributes({ columns: updated });
    },
    [columns, updateAttributes],
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
    updateAttributes({ columns: updatedColumns, rows: updatedRows });
  }, [columns, rows, updateAttributes]);

  // ── Row operations ────────────────────────────────────────────────────
  const handleCellChange = useCallback(
    (rowId: string, colId: string, value: string) => {
      const updatedRows = rows.map((r) =>
        r.id === rowId
          ? { ...r, cells: { ...r.cells, [colId]: value } }
          : r,
      );
      updateAttributes({ rows: updatedRows });
    },
    [rows, updateAttributes],
  );

  const handleAddRow = useCallback(() => {
    const id = crypto.randomUUID();
    const cells: Record<string, string> = {};
    for (const col of columns) {
      cells[col.id] = "";
    }
    updateAttributes({ rows: [...rows, { id, cells }] });
  }, [columns, rows, updateAttributes]);

  // ── Render ────────────────────────────────────────────────────────────
  const hasRows = rows.length > 0;

  return (
    <NodeViewWrapper
      className="table-block-wrapper"
      contentEditable={false}
    >
      <div
        className="rounded-lg border border-hairline bg-panel"
        data-testid="eln-table"
      >
        {/* ── Title bar ──────────────────────────────────────────────── */}
        <div className="border-b border-hairline px-4 py-2.5">
          <InlineEdit
            value={title}
            onCommit={handleTitleChange}
            className="text-sm font-medium text-foreground"
            aria-label="Table title"
            data-testid="table-title"
          />
        </div>

        {/* ── Table ──────────────────────────────────────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            {/* ── Header ─────────────────────────────────────────────── */}
            <thead>
              <tr className="border-b border-hairline bg-surface/60 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {columns.map((col) => (
                  <th key={col.id} className="px-3 py-2 font-medium">
                    <InlineEdit
                      value={col.name}
                      onCommit={(newName) =>
                        handleColumnRename(col.id, newName)
                      }
                      aria-label={`Column name: ${col.name}`}
                      data-testid={`column-header-${col.id}`}
                    />
                  </th>
                ))}
                {/* Ghost "+" button for adding a column */}
                <th className="w-10 px-0 py-2">
                  <button
                    type="button"
                    className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground hover:bg-surface/40 border border-dashed border-transparent hover:border-hairline rounded"
                    onClick={handleAddColumn}
                    aria-label="Add column"
                    data-testid="add-column-btn"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </th>
              </tr>
            </thead>

            {/* ── Body ────────────────────────────────────────────────── */}
            <tbody>
              {hasRows ? (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-hairline last:border-b-0 hover:bg-surface/60 transition-colors"
                  >
                    {columns.map((col) => (
                      <td key={col.id} className="px-3 py-2 font-mono text-[12px]">
                        <InlineEdit
                          value={row.cells[col.id] ?? ""}
                          onCommit={(newValue) =>
                            handleCellChange(row.id, col.id, newValue)
                          }
                          placeholder="—"
                          aria-label={`Cell: ${col.name}`}
                          data-testid={`cell-${row.id}-${col.id}`}
                        />
                      </td>
                    ))}
                    {/* Placeholder cell for the add-column button column */}
                    <td className="px-0 py-2" />
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

        {/* ── Ghost "+ New Row" button ────────────────────────────────── */}
        <div className="border-t border-hairline">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground/60 transition-all hover:text-muted-foreground hover:bg-surface/40 border border-dashed border-transparent hover:border-hairline rounded-b-lg"
            onClick={handleAddRow}
            aria-label="Add new row"
            data-testid="add-row-btn"
          >
            <Plus className="h-3 w-3" />
            <span>New Row</span>
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export default TableNodeView;
