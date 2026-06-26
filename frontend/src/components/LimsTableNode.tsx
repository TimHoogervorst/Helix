/**
 * React NodeView for the limsTable TipTap node (v2 — AG Grid backbone).
 *
 * Renders a Notion-style table card: title bar, AG Grid body, bottom "+"
 * button.  All table data lives in ``node.attrs.columns`` / ``node.attrs.rows``
 * and is synced back via ``updateAttributes``.
 */
import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AgGridReact } from "ag-grid-react";
import type { AgGridReact as AgGridReactType } from "ag-grid-react";
import type {
  ColDef,
  CellValueChangedEvent,
  CellMouseDownEvent,
} from "ag-grid-community";
import type { GridColumn, GridRow, EntityType } from "../types/lims";
import { get } from "../api/client";
import { DisplayIdCellRenderer, ReferenceCellRenderer } from "./ReferenceBadgeCellRenderer";

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
  return `${sym} ${c.name}`; //   = non-breaking thin space
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
        cellRenderer: ReferenceCellRenderer,
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

// ── NodeView ───────────────────────────────────────────────────────────

function LimsTableNode(props: NodeViewProps) {
  const { node, updateAttributes } = props;

  // Read attrs from the TipTap node (source of truth)
  const schemaId = (node.attrs.schemaId as number | null) ?? null;
  const schemaName = (node.attrs.schemaName as string | null) ?? null;
  const title = (node.attrs.title as string) || "Table";
  const columns: GridColumn[] = (node.attrs.columns as GridColumn[]) ?? [];
  const rows: GridRow[] = (node.attrs.rows as GridRow[]) ?? [];

  const gridRef = useRef<AgGridReactType>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [showGearMenu, setShowGearMenu] = useState(false);
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
  const [schemas, setSchemas] = useState<EntityType[]>([]);
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

    updateAttributes({
      columns: [...columns, newColumn],
      rows: newRows,
    });
    closePanel();
  }, [
    newColumnName,
    newColumnType,
    columns,
    rows,
    updateAttributes,
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
        const data = await get<EntityType[]>("/lims/entity-types/");
        setSchemas(data.filter((t) => t.is_active));
      } catch {
        // silently leave list empty
      } finally {
        setSchemasLoading(false);
      }
    }
  }, [schemas.length]);

  const handleSelectSchema = useCallback(
    (entityType: EntityType) => {
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
        return { entityId: null, displayId: row.displayId, values: newValues };
      });

      updateAttributes({
        schemaId: entityType.id,
        schemaName: entityType.name,
        columns: newColumns,
        rows: newRows,
      });
      closePanel();
    },
    [columns, rows, updateAttributes, closePanel]
  );

  // ── ColDefs ──────────────────────────────────────────────────────────
  const colDefs: ColDef<GridRow>[] = useMemo(
    () => [INDEX_COL, ...columns.map(columnDefFor)],
    [columns]
  );

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
      const colName = ev.colDef.field?.replace("values.", "") ?? "";
      const updatedRows = rows.map((r) => {
        if (r.displayId !== ev.data.displayId) return r;
        return {
          entityId: r.entityId ?? ev.data.entityId ?? null,
          displayId: r.displayId,
          values: { ...r.values, [colName]: ev.newValue },
        };
      });
      updateAttributes({ rows: updatedRows });
    },
    [rows, updateAttributes]
  );

  const handleAddRow = useCallback(() => {
    const newRow: GridRow = {
      entityId: null,
      displayId: `#new-${newRowCounter.current++}`,
      values: emptyValues(columns),
    };
    updateAttributes({ rows: [...rows, newRow] });
  }, [rows, columns, updateAttributes]);

  const handleDeleteSelected = useCallback(() => {
    const selected = gridRef.current?.api.getSelectedNodes();
    if (!selected?.length) return;
    const ids = new Set(selected.map((n) => n.data?.displayId));
    updateAttributes({ rows: rows.filter((r) => !ids.has(r.displayId)) });
  }, [rows, updateAttributes]);

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
        updateAttributes({ title: newTitle });
      }
    },
    [title, updateAttributes]
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
  useEffect(() => {
    if (!showGearMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      // Only close if the click is outside BOTH the gear button AND the menu container
      const insideGearBtn = gearBtnRef.current?.contains(target);
      const insideMenu = menuContainerRef.current?.contains(target);
      if (!insideGearBtn && !insideMenu) {
        setShowGearMenu(false);
      }
    };
    const timer = setTimeout(
      () => document.addEventListener("mousedown", handleClick),
      0
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [showGearMenu]);

  // ── Backfill schema name for pre-existing tables that have schemaId but no stored name
  useEffect(() => {
    if (schemaId === null || schemaName !== null) return;
    let cancelled = false;
    get<EntityType>(`/lims/entity-types/${schemaId}/`)
      .then((et) => {
        if (!cancelled && et?.name) {
          updateAttributes({ schemaName: et.name });
        }
      })
      .catch(() => {
        // keep fallback
      });
    return () => { cancelled = true; };
  }, [schemaId, schemaName, updateAttributes]);

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
    <NodeViewWrapper className="lims-table-wrapper" contentEditable={false}>
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
          <div className="eln-table-title-right" ref={menuContainerRef}>
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
            {showGearMenu && !activePanel && (
              <div className="eln-table-gear-menu">
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
              </div>
            )}

            {/* ── Add Column panel ────────────────────────────────── */}
            {showGearMenu && activePanel === "addColumn" && (
              <div className="eln-table-gear-menu eln-table-gear-panel">
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
              </div>
            )}

            {/* ── Load Schema panel ──────────────────────────────── */}
            {showGearMenu && activePanel === "loadSchema" && (
              <div className="eln-table-gear-menu eln-table-gear-panel">
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
              </div>
            )}
          </div>
        </div>

        {/* AG Grid */}
        <div
          ref={gridContainerRef}
          className="eln-grid-theme ag-theme-alpine"
          style={{ width: "100%" }}
        >
          <AgGridReact<GridRow>
            ref={gridRef}
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
    </NodeViewWrapper>
  );
}

export default LimsTableNode;
