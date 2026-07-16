/**
 * React NodeView for the limsTable TipTap node (v2 — AG Grid backbone).
 *
 * Renders a Notion-style table card: title bar, AG Grid body, bottom "+"
 * button.  All table data lives in ``node.attrs.columns`` / ``node.attrs.rows``
 * and is synced back via ``updateAttributes``.
 */
import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AgGridReact } from "ag-grid-react";
import type { AgGridReact as AgGridReactType } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
} from "ag-grid-community";
import type {
  ColDef,
  CellValueChangedEvent,
  CellMouseDownEvent,
} from "ag-grid-community";
import type { GridColumn, GridRow } from "../../../shell/src/shared/types/types";
import type { EntityTypeSummary } from "../types";
import { get } from "../../../shell/src/api/client";
import { DisplayIdCellRenderer, MentionCellRenderer } from "../editor/extensions/MentionBadgeCellRenderer";
import { useClickOutside } from "../../../shell/src/shared/hooks/useClickOutside";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";

// ── Type-to-symbol mapping ────────────────────────────────────────────
const TYPE_SYMBOL: Record<string, string> = {
  Text: "Aa",
  Number: "#",
  Date: "📅",
  Boolean: "☑",
  Reference: "→",
};

/** Build a header name string: symbol + name (e.g. "Aa Notes", "# Volume"). */
function headerWithSymbol(c: GridColumn): string {
  const sym = TYPE_SYMBOL[c.type] ?? "Aa";
  return `${sym} ${c.name}`; //   = non-breaking thin space
}

// ── Map our column type → AG Grid colDef overrides ────────────────────
function columnDefFor(c: GridColumn, _index: number): ColDef<GridRow> {
  const base: ColDef<GridRow> = {
    field: `values.${c.name}`,
    headerName: headerWithSymbol(c),
    headerClass: `eln-grid-col-type-${c.type.toLowerCase()}`,
    sortable: true,
    resizable: true,
    editable: true,
    width: c.width,
    cellStyle: { display: "flex", alignItems: "center" },
  };

  switch (c.type) {
    case "Number":
      return {
        ...base,
        type: "numericColumn",
        valueFormatter: (p) => {
          if (p.value == null || p.value === "") return "";
          return c.units ? `${p.value} ${c.units}` : String(p.value);
        },
      };
    case "Date":
      return {
        ...base,
        valueFormatter: (p) => {
          if (!p.value) return "";
          return new Date(p.value as string).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        },
      };
    case "Boolean":
      return {
        ...base,
        cellEditor: "agCheckboxCellEditor",
        cellRenderer: "agCheckboxCellRenderer",
        cellStyle: { display: "flex", alignItems: "center", justifyContent: "center" },
      };
    case "Reference":
      return {
        ...base,
        cellRenderer: MentionCellRenderer,
        valueFormatter: undefined,
        cellEditor: "agTextCellEditor",
        cellStyle: { display: "flex", alignItems: "center", padding: 0 },
      };
    case "Text":
    default:
      return { ...base, type: "textColumn" };
  }
}

// ── Row "index" column — shows displayId ──────────────────────────────
const INDEX_COL: ColDef<GridRow> = {
  headerName: "#",
  width: 110,
  sortable: false,
  resizable: false,
  cellClass: "eln-grid-index-cell",
  headerClass: "eln-grid-index-header",
  valueGetter: (p) => p.data?.displayId ?? "",
  cellRenderer: DisplayIdCellRenderer,
  suppressNavigable: true,
};

// ── Name pseudo-column — editable, reads/writes row.__name ─────────────
const NameCellRenderer = (props: { value: string | undefined }) => {
  if (props.value) return <span>{props.value}</span>;
  return (
    <span style={{ color: "var(--gray-400)", fontStyle: "italic" }}>
      Enter name…
    </span>
  );
};

const NAME_COL: ColDef<GridRow> = {
  headerName: "Name",
  field: "__name",
  width: 180,
  sortable: true,
  resizable: true,
  editable: true,
  cellRenderer: NameCellRenderer,
  cellStyle: { display: "flex", alignItems: "center" },
  headerClass: "eln-grid-name-header",
};

// ── Default values per type for new rows ───────────────────────────────
function emptyValues(columns: GridColumn[]): Record<string, unknown> {
  const vals: Record<string, unknown> = {};
  for (const c of columns) {
    switch (c.type) {
      case "Number": vals[c.name] = 0; break;
      case "Boolean": vals[c.name] = false; break;
      default: vals[c.name] = ""; break;
    }
  }
  return vals;
}

// ── Inner Content Props ─────────────────────────────────────────────────

interface LimsTableContentProps {
  schemaId: number | null;
  schemaName: string | null;
  title: string;
  columns: GridColumn[];
  rows: GridRow[];
  updateAttrs: (attrs: Record<string, unknown>) => void;
}

// ── Inner Content Component (shared by old + new wrappers) ──────────────

/**
 * Pure rendering logic for the LIMS table block.
 *
 * Decoupled from TipTap's NodeViewWrapper so it can be reused by both
 * the legacy `LimsTableNode` (NodeViewProps → NodeViewWrapper) and
 * the new `LimsTableBlockComponent` (BlockComponentProps, no wrapper —
 * BlockNodeView provides it).
 */
export function LimsTableContent({
  schemaId,
  schemaName,
  title,
  columns,
  rows,
  updateAttrs,
}: LimsTableContentProps) {
  const gridRef = useRef<AgGridReactType>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [showGearMenu, setShowGearMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const gearBtnRef = useRef<HTMLButtonElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // Counter for generating unique #new-N displayIds
  const newRowCounter = useRef(
    rows.filter((r) => r.entityId === null).length + 1
  );

  // ── Gear menu panels ──────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<
    "addColumn" | "loadSchema" | null
  >(null);
  const [schemas, setSchemas] = useState<EntityTypeSummary[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] =
    useState<GridColumn["type"]>("Text");
  const addColNameRef = useRef<HTMLInputElement>(null);

  /** Reset panel state when gear menu closes. */
  const closePanel = useCallback(() => {
    setActivePanel(null);
    setNewColumnName("");
    setNewColumnType("Text");
    setShowGearMenu(false);
  }, []);

  // ── "Add Column" ─────────────────────────────────────────────────────

  const handleOpenAddColumn = useCallback(() => {
    setActivePanel("addColumn");
    setNewColumnName("");
    setNewColumnType("Text");
    // Focus the name input after render
    setTimeout(() => addColNameRef.current?.focus(), 50);
  }, []);

  const handleAddColumn = useCallback(() => {
    const name = newColumnName.trim();
    if (!name) return;
    // Prevent duplicate column names
    if (columns.some((c) => c.name.toLowerCase() === name.toLowerCase()))
      return;

    const newColumn: GridColumn = {
      name,
      type: newColumnType,
      isCustom: true,
    };

    const defaultVal =
      newColumnType === "Number" ? 0 : newColumnType === "Boolean" ? false : "";

    const newRows = rows.map((row) => ({
      ...row,
      values: { ...row.values, [name]: defaultVal },
    }));

    // Defer the ProseMirror transaction to avoid a flushSync conflict
    // (same pattern as handleSelectSchema).
    queueMicrotask(() => {
      try {
        updateAttrs({
          columns: [...columns, newColumn],
          rows: newRows,
        });
      } catch (err) {
        console.error("Failed to add column:", err);
      }
    });
    closePanel();
  }, [
    newColumnName,
    newColumnType,
    columns,
    rows,
    updateAttrs,
    closePanel,
  ]);

  const handleAddColumnKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddColumn();
      } else if (e.key === "Escape") {
        closePanel();
      }
    },
    [handleAddColumn, closePanel]
  );

  // ── "Load Schema" ────────────────────────────────────────────────────

  const handleOpenLoadSchema = useCallback(async () => {
    setActivePanel("loadSchema");
    if (schemas.length === 0) {
      setSchemasLoading(true);
      try {
        const data = await get<EntityTypeSummary[]>("/lims/entity-types/");
        setSchemas(data.filter((t) => t.is_active));
      } catch {
        // silently leave list empty
      } finally {
        setSchemasLoading(false);
      }
    }
  }, [schemas.length]);

  const handleSelectSchema = useCallback(
    (entityType: EntityTypeSummary) => {
      const newColumns: GridColumn[] = entityType.columns.map((c) => ({
        name: c.name,
        type: c.type,
        required: c.required,
        default: c.default,
        units: c.units,
        description: c.description,
      }));

      const oldColNames = new Set(columns.map((c) => c.name));

      const newRows = rows.map((row) => {
        const newValues: Record<string, unknown> = {};
        for (const col of newColumns) {
          if (oldColNames.has(col.name)) {
            newValues[col.name] = row.values[col.name] ?? col.default ?? "";
          } else {
            newValues[col.name] =
              col.default ??
              (col.type === "Number" ? 0 : col.type === "Boolean" ? false : "");
          }
        }
        // Reset entity binding — entities belong to the old schema
        return {
          entityId: null,
          displayId: row.displayId,
          values: newValues,
          __name: row.__name ?? "",
        };
      });

      // Defer the ProseMirror transaction to avoid a flushSync conflict:
      // dispatching synchronously during React's event phase causes
      // TipTap's useSyncExternalStore to call flushSync() internally,
      // which React rejects because it is already processing the event.
      queueMicrotask(() => {
        try {
          updateAttrs({
            schemaId: entityType.id,
            schemaName: entityType.name,
            columns: newColumns,
            rows: newRows,
          });
        } catch (err) {
          console.error("Failed to apply schema:", err);
        }
      });
      closePanel();
    },
    [columns, rows, updateAttrs, closePanel]
  );

  // ── ColDefs ──────────────────────────────────────────────────────────
  const colDefs: ColDef<GridRow>[] = useMemo(() => {
    const cols = [INDEX_COL];
    if (schemaId !== null) {
      cols.push(NAME_COL);
    }
    cols.push(...columns.map(columnDefFor));
    return cols;
  }, [columns, schemaId]);

  const defaultColDef: ColDef<GridRow> = useMemo(
    () => ({
      flex: 1,
      minWidth: 80,
      cellStyle: {
        display: "flex",
        alignItems: "center",
        borderRight: "none",
        borderLeft: "none",
      },
    }),
    []
  );

  // ── Handlers ────────────────────────────────────────────────────────

  const handleCellValueChanged = useCallback(
    (ev: CellValueChangedEvent<GridRow>) => {
      const field = ev.colDef.field ?? "";
      const colName = field.replace("values.", "");

      // Defer the ProseMirror transaction via queueMicrotask to avoid
      // flushSync during React's render phase — AG Grid fires cell value
      // change events synchronously during the edit cycle, and calling
      // updateAttrs directly would trigger a ProseMirror dispatch that
      // React 18 rejects while it's already rendering.
      queueMicrotask(() => {
        if (colName === "__name") {
          const updatedRows = rows.map((r) => {
            if (r.displayId !== ev.data.displayId) return r;
            return { ...r, __name: (ev.newValue as string) ?? "" };
          });
          updateAttrs({ rows: updatedRows });
          return;
        }

        const updatedRows = rows.map((r) => {
          if (r.displayId !== ev.data.displayId) return r;
          return {
            entityId: r.entityId ?? ev.data.entityId ?? null,
            displayId: r.displayId,
            values: { ...r.values, [colName]: ev.newValue },
          };
        });
        updateAttrs({ rows: updatedRows });
      });
    },
    [rows, updateAttrs]
  );

  const handleAddRow = useCallback(() => {
    const newRow: GridRow = {
      entityId: null,
      displayId: `#new-${newRowCounter.current++}`,
      values: emptyValues(columns),
      __name: "",
    };
    updateAttrs({ rows: [...rows, newRow] });
  }, [rows, columns, updateAttrs]);

  const handleDeleteSelected = useCallback(() => {
    const selected = gridRef.current?.api.getSelectedNodes();
    if (!selected?.length) return;
    const ids = new Set(selected.map((n) => n.data?.displayId));
    updateAttrs({ rows: rows.filter((r) => !ids.has(r.displayId)) });
  }, [rows, updateAttrs]);

  // ── Ensure AG Grid cell editing starts inside ProseMirror's non-editable wrapper ─
  const handleCellMouseDown = useCallback((params: CellMouseDownEvent) => {
    // Only trigger editing for editable columns (skip the index column)
    const rowIndex = params.rowIndex;
    if (rowIndex == null || !params.column || !params.colDef.editable) return;
    // Defer so ProseMirror's mousedown selection logic completes first
    const { column } = params;
    setTimeout(() => {
      gridRef.current?.api.startEditingCell({
        rowIndex,
        colKey: column,
      });
    }, 0);
  }, []);

  const handleTitleBlur = useCallback(
    (e: React.FocusEvent<HTMLSpanElement>) => {
      const newTitle = e.currentTarget.textContent?.trim() || "Table";
      if (newTitle !== title) {
        updateAttrs({ title: newTitle });
      }
    },
    [title, updateAttrs]
  );

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    },
    []
  );

  // ── Close gear menu on outside click ─────────────────────────────────
  useClickOutside(
    [gearBtnRef, menuContainerRef],
    () => setShowGearMenu(false),
    showGearMenu,
  );

  // ── Position gear menu relative to the gear button ───────────────────
  // The menu is portaled to document.body to escape ancestor
  // overflow:hidden clipping.  We compute its fixed position from the
  // gear button's bounding rect and keep it in sync on scroll/resize.
  useEffect(() => {
    if (!showGearMenu) {
      setMenuPos(null);
      return;
    }

    const recalc = () => {
      const btn = gearBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    };

    recalc();
    window.addEventListener("scroll", recalc, { capture: true, passive: true });
    window.addEventListener("resize", recalc, { passive: true });

    return () => {
      window.removeEventListener("scroll", recalc, { capture: true });
      window.removeEventListener("resize", recalc);
    };
  }, [showGearMenu]);

  // ── Backfill schema name for pre-existing tables that have schemaId but no stored name
  useEffect(() => {
    if (schemaId === null || schemaName !== null) return;
    let cancelled = false;
    get<EntityTypeSummary>(`/lims/entity-types/${schemaId}/`)
      .then((et) => {
        if (!cancelled && et?.name) {
          updateAttrs({ schemaName: et.name });
        }
      })
      .catch(() => {
        // keep fallback
      });
    return () => { cancelled = true; };
  }, [schemaId, schemaName, updateAttrs]);

  // ── Prevent ProseMirror from intercepting events inside the AG Grid ────
  // ProseMirror listens on its editor element (ancestor of this NodeView).
  // Its mousedown handler adjusts editor selection/focus, which interferes
  // with AG Grid cell editing.  We stop native bubble-phase propagation so
  // ProseMirror never sees these events, letting AG Grid manage its own
  // editing lifecycle independently.
  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const stop = (e: MouseEvent) => {
      e.stopPropagation();
    };
    el.addEventListener("mousedown", stop);
    return () => el.removeEventListener("mousedown", stop);
  }, []);

  return (
    <div className={`eln-table-card${schemaId !== null ? " eln-table-card--schema-backed" : ""}`}>
      {/* Title bar */}
      <div className="eln-table-title-bar">
        <div className="eln-table-title-left">
          <span className="eln-table-title-icon">⊞</span>
          <span
            className="eln-table-title-text"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
          >
            {title}
          </span>
          {schemaId !== null && (
            <span className="eln-table-schema-label" title={`Schema ID: ${schemaId}`}>
              {schemaName || `Schema #${schemaId}`}
            </span>
          )}
        </div>
        <div className="eln-table-title-right">
          <button
            ref={gearBtnRef}
            type="button"
            className="eln-table-gear-btn"
            onClick={() => setShowGearMenu((v) => !v)}
            title="Table settings"
            aria-label="Table settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* ── Gear menu — portaled to document.body to escape ancestor
            overflow:hidden clipping on .eln-table-card / .lims-table-wrapper. */}
      {showGearMenu &&
        menuPos &&
        createPortal(
          <div
            className={`eln-table-gear-menu${activePanel ? " eln-table-gear-panel" : ""}`}
            ref={menuContainerRef}
            style={{
              position: "fixed",
              top: menuPos.top,
              right: menuPos.right,
            }}
          >
            {!activePanel && (
              <>
                <button
                  className="eln-table-gear-item"
                  onClick={() => {
                    handleAddRow();
                    setShowGearMenu(false);
                  }}
                >
                  + Add Row
                </button>
                <button
                  className="eln-table-gear-item"
                  onClick={() => {
                    handleDeleteSelected();
                    setShowGearMenu(false);
                  }}
                >
                  − Delete Row
                </button>
                <div className="eln-table-gear-divider" />
                <button
                  className="eln-table-gear-item"
                  onClick={handleOpenAddColumn}
                >
                  Add Column…
                </button>
                <button
                  className="eln-table-gear-item"
                  onClick={handleOpenLoadSchema}
                >
                  Load Schema…
                </button>
              </>
            )}

            {/* ── Add Column panel ──────────────────────────────── */}
            {activePanel === "addColumn" && (
              <>
                <div className="eln-table-gear-panel-head">
                  <button
                    className="eln-table-gear-back"
                    onClick={() => setActivePanel(null)}
                    title="Back"
                  >
                    ←
                  </button>
                  <span className="eln-table-gear-panel-title">Add Column</span>
                </div>
                <div className="eln-table-gear-panel-body">
                  <input
                    ref={addColNameRef}
                    className="eln-table-gear-input"
                    type="text"
                    placeholder="Column name"
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    onKeyDown={handleAddColumnKeyDown}
                  />
                  <select
                    className="eln-table-gear-select"
                    value={newColumnType}
                    onChange={(e) =>
                      setNewColumnType(
                        e.target.value as GridColumn["type"]
                      )
                    }
                    onKeyDown={handleAddColumnKeyDown}
                  >
                    <option value="Text">Aa Text</option>
                    <option value="Number"># Number</option>
                    <option value="Date">📅 Date</option>
                    <option value="Boolean">☑ Boolean</option>
                  </select>
                  <button
                    className="eln-table-gear-confirm"
                    onClick={handleAddColumn}
                    disabled={!newColumnName.trim()}
                  >
                    Add
                  </button>
                </div>
              </>
            )}

            {/* ── Load Schema panel ────────────────────────────── */}
            {activePanel === "loadSchema" && (
              <>
                <div className="eln-table-gear-panel-head">
                  <button
                    className="eln-table-gear-back"
                    onClick={() => setActivePanel(null)}
                    title="Back"
                  >
                    ←
                  </button>
                  <span className="eln-table-gear-panel-title">
                    Load Schema
                  </span>
                </div>
                <div className="eln-table-gear-panel-body">
                  {schemasLoading ? (
                    <span className="eln-table-gear-hint">Loading…</span>
                  ) : schemas.length === 0 ? (
                    <span className="eln-table-gear-hint">
                      No schemas available
                    </span>
                  ) : (
                    schemas.map((s) => (
                      <button
                        key={s.id}
                        className="eln-table-gear-item eln-table-schema-option"
                        onClick={() => handleSelectSchema(s)}
                      >
                        <span className="eln-table-schema-name">{s.name}</span>
                        <span className="eln-table-schema-prefix">
                          {s.prefix}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>,
          document.body
        )}

      {/* AG Grid */}
      <div
        ref={gridContainerRef}
        className="eln-grid-theme ag-theme-alpine"
        style={{ width: "100%" }}
      >
        <AgGridReact<GridRow>
          ref={gridRef}
          theme="legacy"
          modules={[AllCommunityModule]}
          rowData={rows}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          domLayout="autoHeight"
          rowSelection="single"
          suppressRowClickSelection={true}
          enableRangeSelection={false}
          onCellMouseDown={handleCellMouseDown}
          onCellValueChanged={handleCellValueChanged}
          getRowId={(p) => p.data.displayId}
          undoRedoCellEditing={true}
          stopEditingWhenCellsLoseFocus={true}
          singleClickEdit={true}
        />
      </div>

      {/* Bottom "+" button */}
      <div className="eln-table-add-row-tag">
        <button
          className="eln-table-add-row-btn"
          onClick={handleAddRow}
          aria-label="Add row"
          title="Add row"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ── Legacy NodeView wrapper (for existing TipTap node extensions) ───────

function LimsTableNode(props: NodeViewProps) {
  const { node, updateAttributes } = props;

  // Read attrs from the TipTap node (source of truth)
  const schemaId = (node.attrs.schemaId as number | null) ?? null;
  const schemaName = (node.attrs.schemaName as string | null) ?? null;
  const title = (node.attrs.title as string) || "Table";
  const columns: GridColumn[] = (node.attrs.columns as GridColumn[]) ?? [];
  const rows: GridRow[] = (node.attrs.rows as GridRow[]) ?? [];

  return (
    <NodeViewWrapper className="lims-table-wrapper" contentEditable={false}>
      <LimsTableContent
        schemaId={schemaId}
        schemaName={schemaName}
        title={title}
        columns={columns}
        rows={rows}
        updateAttrs={updateAttributes}
      />
    </NodeViewWrapper>
  );
}

export default LimsTableNode;

// ── New BlockComponentProps wrapper (for the slot system) ───────────────

/**
 * Slot-system block component for the LIMS table.
 *
 * Receives `BlockComponentProps` (no NodeViewWrapper — BlockNodeView
 * provides one). Renders the same inner content as the legacy NodeView.
 */
export function LimsTableBlockComponent({ instance }: BlockComponentProps) {
  const attrs = instance.attrs as Record<string, unknown>;
  const schemaId = (attrs.schemaId as number | null) ?? null;
  const schemaName = (attrs.schemaName as string | null) ?? null;
  const title = (attrs.title as string) || "Table";
  const columns: GridColumn[] = (attrs.columns as GridColumn[]) ?? [];
  const rows: GridRow[] = (attrs.rows as GridRow[]) ?? [];

  return (
    <LimsTableContent
      schemaId={schemaId}
      schemaName={schemaName}
      title={title}
      columns={columns}
      rows={rows}
      updateAttrs={instance.updateAttrs}
    />
  );
}
