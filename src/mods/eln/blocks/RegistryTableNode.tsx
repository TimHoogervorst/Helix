/**
 * React component for the registryTable TipTap block.
 *
 * Three states:
 * 1. **Placeholder** (schemaId === null): compact box with Database icon,
 *    "Registry Table" label, and "Load Schema" button.
 * 2. **Picker open**: a portaled popover lists active EntityTypes fetched
 *    from the LIMS API. Loading and empty states handled.
 * 3. **Loaded table**: editable title bar, schema name label, blue-tinted
 *    header row with mandatory "Name" column + schema columns, data rows
 *    with type-aware cell editors, status dots, row add/delete operations,
 *    and reference-cell @-mention popover.
 *
 * Schema is locked once loaded — no swap action.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";
import { Database, Loader, Trash2, Plus, RefreshCw } from "lucide-react";
import { get, del } from "../../../shell/src/api/client";
import type { EntityTypeSummary } from "../types";
import type { GridColumn, GridColumnType } from "../../../shell/src/shared/types/types";
import { useClickOutside } from "../../../shell/src/shared/hooks/useClickOutside";
import MentionBadge from "../../../shell/src/shared/components/MentionBadge";
import MoreActions from "../components/MoreActions";

// ── Registry Table Row Type ────────────────────────────────────────────────

/** A single row in the registry table, extending GridRow with registration state. */
export interface RegistryTableRow {
  /** LIMS entity ID — null for unregistered rows. */
  entityId: number | null;
  /** Display ID like "BLOOD1", assigned by server on registration. */
  displayId: string;
  /** Entity name — stored at row level for the Name pseudo-column. */
  __name: string;
  /** Cell values keyed by column name. */
  values: Record<string, unknown>;
  /** Whether this row has been successfully registered. */
  isRegistered: boolean;
  /** SHA-256 hash of values at last successful registration (null if never registered). */
  lastRegisteredValueHash: string | null;
  /** Error message from the most recent failed registration attempt. */
  registrationError: string | null;
}

/** Create default empty values for a set of columns. */
function emptyValues(columns: GridColumn[]): Record<string, unknown> {
  const vals: Record<string, unknown> = {};
  for (const c of columns) {
    vals[c.name] = emptyValue(c);
  }
  return vals;
}

/** Get the default value for a single column. */
function emptyValue(col: GridColumn): unknown {
  switch (col.type) {
    case "Number":
      return col.default ? Number(col.default) : 0;
    case "Boolean":
      return col.default === "true";
    default:
      return col.default ?? "";
  }
}

/** Convert an EntityTypeSummary's columns to GridColumn[] for use in the table. */
function toGridColumns(entityType: EntityTypeSummary): GridColumn[] {
  return entityType.columns.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    required: c.required,
    default: c.default,
    units: c.units,
    description: c.description,
  }));
}

// ── Status Dot ─────────────────────────────────────────────────────────────

/** Priority order: red > yellow > orange > blue > green */
type DotColor = "red" | "yellow" | "orange" | "blue" | "green";

interface StatusDotProps {
  row: RegistryTableRow;
  schemaContentHash: string | null;
}

/**
 * Computes the status dot color for a row following the priority rules:
 * - Red: registration error exists
 * - Yellow: schema content hash unavailable (stored hash is null → can't verify match)
 * - Orange: row data changed since last registration
 * - Blue: unregistered with no errors
 * - Green: registered, schema matches, data unchanged
 *
 * NOTE: Full yellow-dot detection (comparing stored schemaContentHash against
 * the current EntityType hash from the API) requires fetching the EntityType
 * on every render, which is deferred to a future enhancement.  The current
 * implementation shows yellow when a row is registered but no schema hash was
 * captured at schema-load time.
 */
function getDotColor(row: RegistryTableRow, schemaContentHash: string | null): DotColor {
  // Red: registration error — highest priority
  if (row.registrationError) return "red";

  if (row.isRegistered && row.entityId !== null) {
    // Yellow: schema content hash unavailable — can't verify match
    if (!schemaContentHash) return "yellow";

    // Orange: data changed since last registration
    if (row.lastRegisteredValueHash !== null) {
      const currentSnapshot = computeValueSnapshot(row.values);
      if (currentSnapshot !== row.lastRegisteredValueHash) return "orange";
    }

    // Green: registered, schema matches, data unchanged
    return "green";
  }

  // Blue: unregistered, no errors
  return "blue";
}

/** Produces a deterministic serialisation of values for change detection. */
function computeValueSnapshot(values: Record<string, unknown>): string {
  const sorted = Object.keys(values)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = values[key];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

const DOT_COLORS: Record<DotColor, string> = {
  red: "#ef4444",
  yellow: "#eab308",
  orange: "#f97316",
  blue: "#3b82f6",
  green: "#22c55e",
};

const DOT_LABELS: Record<DotColor, string> = {
  red: "Registration error",
  yellow: "Schema has changed since last registration",
  orange: "Data changed since last registration",
  blue: "Not yet registered",
  green: "Registered, up to date",
};

function StatusDot({ row, schemaContentHash }: StatusDotProps) {
  const color = getDotColor(row, schemaContentHash);
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: DOT_COLORS[color] }}
      title={DOT_LABELS[color]}
      data-testid={`status-dot-${color}`}
      aria-label={DOT_LABELS[color]}
    />
  );
}

// ── Editable Cell ──────────────────────────────────────────────────────────

interface EditableCellProps {
  columnName: string;
  columnType: GridColumnType;
  value: unknown;
  rowDisplayId: string;
  onCommit: (columnName: string, newValue: unknown) => void;
  readOnly?: boolean;
}

/**
 * Renders the appropriate editor for a cell based on its column type.
 *
 * - Text: contentEditable span (inline edit)
 * - Number: <input type="number"> on click
 * - Date: <input type="date"> on click
 * - Boolean: <input type="checkbox"> (always visible)
 * - Reference: clickable MentionBadge + popover for entity search
 */
function EditableCell({
  columnName,
  columnType,
  value,
  rowDisplayId,
  onCommit,
  readOnly = false,
}: EditableCellProps) {
  if (readOnly) {
    // Render all cell types as read-only display, except Reference which
    // keeps its MentionBadge clickable.
    if (columnType === "Reference") {
      return (
        <ReferenceCell
          value={value as string}
          onCommit={(v) => onCommit(columnName, v)}
          readOnly
        />
      );
    }
    if (columnType === "Boolean") {
      return (
        <span className="text-sm" data-testid="boolean-display">
          {value === true ? "Yes" : "No"}
        </span>
      );
    }
    return (
      <span className="text-sm" data-testid="readonly-cell">
        {value != null ? String(value) : ""}
      </span>
    );
  }

  switch (columnType) {
    case "Number":
      return (
        <NumberCell
          value={value as number | null}
          onCommit={(v) => onCommit(columnName, v)}
        />
      );
    case "Date":
      return (
        <DateCell
          value={value as string | null}
          onCommit={(v) => onCommit(columnName, v)}
        />
      );
    case "Boolean":
      return (
        <BooleanCell
          value={value as boolean}
          onCommit={(v) => onCommit(columnName, v)}
        />
      );
    case "Reference":
      return (
        <ReferenceCell
          value={value as string}
          onCommit={(v) => onCommit(columnName, v)}
        />
      );
    case "Text":
    default:
      return (
        <TextCell
          value={value as string}
          onCommit={(v) => onCommit(columnName, v)}
        />
      );
  }
}

// ── Text Cell ──────────────────────────────────────────────────────────────

function TextCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  const handleBlur = useCallback(() => {
    const newVal = ref.current?.textContent ?? "";
    if (newVal !== (value ?? "")) {
      onCommit(newVal);
    }
  }, [value, onCommit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  }, []);

  return (
    <span
      ref={ref}
      className="outline-none min-w-[60px] inline-block px-1 py-0.5 rounded hover:bg-surface/50 focus:bg-surface/80"
      contentEditable
      suppressContentEditableWarning
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      data-testid="text-cell"
    >
      {value || ""}
    </span>
  );
}

// ── Number Cell ────────────────────────────────────────────────────────────

function NumberCell({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        className="w-full bg-surface/80 px-1 py-0.5 rounded border border-primary/30 outline-none text-sm"
        defaultValue={value != null ? String(value) : ""}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const num = raw === "" ? null : Number(raw);
          onCommit(isNaN(num as number) ? null : num);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLElement).blur();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        data-testid="number-input"
      />
    );
  }

  return (
    <span
      className="cursor-text min-w-[40px] inline-block px-1 py-0.5 rounded hover:bg-surface/50 text-sm tabular-nums"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      tabIndex={0}
      data-testid="number-display"
    >
      {value != null ? String(value) : ""}
    </span>
  );
}

// ── Date Cell ──────────────────────────────────────────────────────────────

function DateCell({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        className="bg-surface/80 px-1 py-0.5 rounded border border-primary/30 outline-none text-sm"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const raw = e.target.value;
          onCommit(raw || null);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLElement).blur();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        data-testid="date-input"
      />
    );
  }

  const display = value
    ? new Date(value + "T00:00:00").toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <span
      className="cursor-text min-w-[80px] inline-block px-1 py-0.5 rounded hover:bg-surface/50 text-sm"
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      tabIndex={0}
      data-testid="date-display"
    >
      {display || ""}
    </span>
  );
}

// ── Boolean Cell ───────────────────────────────────────────────────────────

function BooleanCell({
  value,
  onCommit,
}: {
  value: boolean;
  onCommit: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-center">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-hairline cursor-pointer accent-primary"
        checked={value === true}
        onChange={(e) => onCommit(e.target.checked)}
        data-testid="boolean-checkbox"
      />
    </div>
  );
}

// ── Reference Cell ─────────────────────────────────────────────────────────

interface SearchResult {
  display_id: string;
  title: string;
  type: string;
  icon: string;
  workspaceId: string | null;
}

function ReferenceCell({
  value,
  onCommit,
  readOnly = false,
}: {
  value: string;
  onCommit: (v: string) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Close on outside click ────────────────────────────────────────────
  useClickOutside(
    [triggerRef, popoverRef],
    () => setOpen(false),
    open,
  );

  // ── Focus input when popover opens ────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
    }
  }, [open]);

  // ── Search entities as user types ─────────────────────────────────────
  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await get<SearchResult[]>(
        `/lims/entities/?search=${encodeURIComponent(q)}`,
      );
      setResults(data.slice(0, 10));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Select an entity ──────────────────────────────────────────────────
  const handleSelect = useCallback(
    (displayId: string) => {
      onCommit(displayId);
      setOpen(false);
    },
    [onCommit],
  );

  // ── Clear the reference ───────────────────────────────────────────────
  const handleClear = useCallback(() => {
    onCommit("");
    setOpen(false);
  }, [onCommit]);

  return (
    <div className="relative inline-flex items-center gap-1">
      {value ? (
        <div className="flex items-center gap-1">
          <MentionBadge displayId={value} clickable />
          {!readOnly && (
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive text-xs leading-none px-0.5"
              onClick={handleClear}
              title="Clear reference"
              aria-label="Clear reference"
              data-testid="ref-clear-btn"
            >
              ×
            </button>
          )}
        </div>
      ) : (
        !readOnly && (
          <button
            ref={triggerRef}
            type="button"
            className="text-xs text-muted-foreground italic hover:text-foreground px-1 py-0.5 rounded hover:bg-surface/50"
            onClick={() => setOpen(true)}
            data-testid="ref-trigger-btn"
          >
            @mention…
          </button>
        )
      )}

      {/* ── Popover — portaled to body ────────────────────────────────── */}
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="z-50 w-72 rounded-md border border-hairline bg-popover shadow-lg"
            style={{
              position: "fixed",
              top: (triggerRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
              left: triggerRef.current?.getBoundingClientRect().left ?? 0,
            }}
            data-testid="ref-popover"
          >
            <div className="p-2 border-b border-hairline">
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search entities…"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                data-testid="ref-search-input"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader className="h-4 w-4 animate-spin" />
                  Searching…
                </div>
              ) : results.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  {query.length > 0
                    ? "No entities found."
                    : "Type to search entities."}
                </div>
              ) : (
                results.map((r) => (
                  <button
                    key={r.display_id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-surface/60 transition-colors first:rounded-t-md last:rounded-b-md"
                    onClick={() => handleSelect(r.display_id)}
                    data-testid={`ref-result-${r.display_id}`}
                  >
                    <span className="font-medium">{r.display_id}</span>
                    {r.title && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {r.title}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
            {value && (
              <div className="border-t border-hairline p-1">
                <button
                  type="button"
                  className="w-full text-left px-2 py-1 text-xs text-destructive hover:bg-surface/60 rounded"
                  onClick={handleClear}
                  data-testid="ref-clear-option"
                >
                  Clear reference
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── Inner Content Props ─────────────────────────────────────────────────────

interface RegistryTableContentProps {
  schemaId: number | null;
  schemaName: string | null;
  schemaContentHash: string | null;
  title: string;
  columns: GridColumn[];
  rows: RegistryTableRow[];
  updateAttrs: (attrs: Record<string, unknown>) => void;
  /** When true, inline editing and action buttons are hidden. */
  readOnly?: boolean;
}

// ── Inner Content Component ─────────────────────────────────────────────────

/**
 * Pure rendering logic for the registry table block.
 *
 * Decoupled from TipTap's NodeViewWrapper so it can be reused by both
 * the legacy NodeView path and the new BlockComponentProps path.
 */
export function RegistryTableContent({
  schemaId,
  schemaName,
  schemaContentHash,
  title,
  columns,
  rows,
  updateAttrs,
  readOnly = false,
}: RegistryTableContentProps) {
  // ── Picker state ────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [entityTypes, setEntityTypes] = useState<EntityTypeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerPos, setPickerPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const loadBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const newRowCounter = useRef(
    rows.filter((r) => !r.isRegistered).length + 1,
  );

  // ── Fetch entity types when picker opens ────────────────────────────
  const handleOpenPicker = useCallback(async () => {
    setShowPicker(true);
    if (entityTypes.length === 0) {
      setLoading(true);
      try {
        const data = await get<EntityTypeSummary[]>("/lims/entity-types/");
        setEntityTypes(data.filter((t) => t.is_active));
      } catch {
        // silently leave list empty
      } finally {
        setLoading(false);
      }
    }
  }, [entityTypes.length]);

  // ── Position picker relative to the button ──────────────────────────
  useEffect(() => {
    if (!showPicker) {
      setPickerPos(null);
      return;
    }
    const recalc = () => {
      const btn = loadBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPickerPos({
        top: rect.bottom + 4,
        left: rect.left,
      });
    };
    recalc();
    window.addEventListener("scroll", recalc, { capture: true, passive: true });
    window.addEventListener("resize", recalc, { passive: true });
    return () => {
      window.removeEventListener("scroll", recalc, { capture: true });
      window.removeEventListener("resize", recalc);
    };
  }, [showPicker]);

  // ── Close picker on outside click ───────────────────────────────────
  useClickOutside(
    [loadBtnRef, pickerRef],
    () => setShowPicker(false),
    showPicker,
  );

  // ── Select an entity type → snapshot schema into block attrs ────────
  const handleSelectEntityType = useCallback(
    (entityType: EntityTypeSummary) => {
      const newColumns = toGridColumns(entityType);

      updateAttrs({
        schemaId: entityType.id,
        schemaName: entityType.name,
        schemaContentHash: entityType.content_hash,
        columns: newColumns,
        rows: [], // reset rows when loading a new schema
      });
      setShowPicker(false);
    },
    [updateAttrs],
  );

  // ── Title editing ───────────────────────────────────────────────────
  const handleTitleBlur = useCallback(
    (e: React.FocusEvent<HTMLSpanElement>) => {
      const newTitle = e.currentTarget.textContent?.trim() || "Registry Table";
      if (newTitle !== title) {
        updateAttrs({ title: newTitle });
      }
    },
    [title, updateAttrs],
  );

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    },
    [],
  );

  // ── Cell value commit ────────────────────────────────────────────────
  const handleCellCommit = useCallback(
    (rowDisplayId: string, columnName: string, newValue: unknown) => {
      const updatedRows = rows.map((r) => {
        if (r.displayId !== rowDisplayId) return r;
        return {
          ...r,
          values: { ...r.values, [columnName]: newValue },
        };
      });
      updateAttrs({ rows: updatedRows });
    },
    [rows, updateAttrs],
  );

  // ── Name cell commit ─────────────────────────────────────────────────
  const handleNameCommit = useCallback(
    (rowDisplayId: string, newName: string) => {
      const updatedRows = rows.map((r) => {
        if (r.displayId !== rowDisplayId) return r;
        return { ...r, __name: newName };
      });
      updateAttrs({ rows: updatedRows });
    },
    [rows, updateAttrs],
  );

  // ── Add row ──────────────────────────────────────────────────────────
  const handleAddRow = useCallback(() => {
    const newRow: RegistryTableRow = {
      entityId: null,
      displayId: `#new-${newRowCounter.current++}`,
      __name: "",
      values: emptyValues(columns),
      isRegistered: false,
      lastRegisteredValueHash: null,
      registrationError: null,
    };
    updateAttrs({ rows: [...rows, newRow] });
  }, [rows, columns, updateAttrs]);

  // ── Delete row ───────────────────────────────────────────────────────
  const handleDeleteRow = useCallback(
    async (rowDisplayId: string) => {
      const row = rows.find((r) => r.displayId === rowDisplayId);
      // If the row is registered, call the API to delete the entity
      if (row?.entityId !== null && row?.entityId !== undefined) {
        try {
          await del(`/lims/entities/${row.entityId}/`);
        } catch {
          // Even if API call fails, remove from local state
          console.warn(
            `Failed to delete entity ${row.entityId} from LIMS. Removing from table anyway.`,
          );
        }
      }
      updateAttrs({ rows: rows.filter((r) => r.displayId !== rowDisplayId) });
    },
    [rows, updateAttrs],
  );

  // ── Refresh schema ───────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const handleRefreshSchema = useCallback(async () => {
    if (schemaId === null) return;
    setRefreshing(true);
    try {
      const entityType = await get<EntityTypeSummary>(
        `/lims/entity-types/${schemaId}/`,
      );

      const newColumns = toGridColumns(entityType);

      // Build UUID → old column lookup for value migration
      const idToOldCol = new Map<string, GridColumn>();
      for (const col of columns) {
        if (col.id) idToOldCol.set(col.id, col);
      }

      // Migrate row values: preserve surviving columns, default for new ones
      const updatedRows = rows.map((row) => {
        const newValues: Record<string, unknown> = {};
        for (const newCol of newColumns) {
          if (newCol.id && idToOldCol.has(newCol.id)) {
            // Column survived — preserve value from old column name key
            const oldCol = idToOldCol.get(newCol.id)!;
            newValues[newCol.name] =
              row.values[oldCol.name] ?? emptyValue(newCol);
          } else {
            // New column — fill with default empty value
            newValues[newCol.name] = emptyValue(newCol);
          }
        }
        return { ...row, values: newValues };
      });

      updateAttrs({
        schemaContentHash: entityType.content_hash,
        schemaName: entityType.name,
        columns: newColumns,
        rows: updatedRows,
      });
    } catch {
      // silently leave state unchanged on failure
    } finally {
      setRefreshing(false);
    }
  }, [schemaId, columns, rows, updateAttrs]);

  // ── Placeholder state ───────────────────────────────────────────────
  if (schemaId === null) {
    return (
      <div
        className="rounded-lg border border-hairline bg-panel p-4"
        data-testid="registry-table-placeholder"
      >
        <div className="flex items-center gap-2.5">
          <Database className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">
            Registry Table
          </span>
        </div>
        <div className="mt-3">
          <button
            ref={loadBtnRef}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-surface/80 hover:text-foreground transition-colors"
            onClick={handleOpenPicker}
            data-testid="load-schema-btn"
          >
            Load Schema
          </button>
        </div>

        {/* ── Picker popover — portaled to body ────────────────────── */}
        {showPicker &&
          pickerPos &&
          createPortal(
            <div
              ref={pickerRef}
              className="z-50 w-72 max-h-60 overflow-y-auto rounded-md border border-hairline bg-popover shadow-lg"
              style={{
                position: "fixed",
                top: pickerPos.top,
                left: pickerPos.left,
              }}
              data-testid="schema-picker"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading schemas…
                </div>
              ) : entityTypes.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  No schemas available. Create one in LIMS → Entity Types.
                </div>
              ) : (
                entityTypes.map((et) => (
                  <button
                    key={et.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-surface/60 transition-colors first:rounded-t-md last:rounded-b-md"
                    onClick={() => handleSelectEntityType(et)}
                    data-testid={`schema-option-${et.id}`}
                  >
                    <span className="font-medium">{et.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({et.prefix})
                    </span>
                  </button>
                ))
              )}
            </div>,
            document.body,
          )}
      </div>
    );
  }

  // ── Loaded table state ──────────────────────────────────────────────
  return (
    <div
      className="rounded-lg border border-hairline bg-panel"
      data-testid="registry-table-loaded"
    >
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {readOnly ? (
          <span
            className="flex-1 text-sm font-medium text-foreground"
            data-testid="registry-table-title"
          >
            {title}
          </span>
        ) : (
          <span
            className="flex-1 text-sm font-medium text-foreground outline-none"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            data-testid="registry-table-title"
          >
            {title}
          </span>
        )}
        {refreshing && (
          <Loader className="h-3.5 w-3.5 animate-spin text-muted-foreground" data-testid="refresh-spinner" />
        )}
        {schemaName && (
          <span
            className="text-xs text-muted-foreground bg-surface px-2 py-0.5 rounded"
            data-testid="registry-table-schema-label"
          >
            {schemaName}
          </span>
        )}
        {!readOnly && (
          <MoreActions
            items={[
              {
                key: "refresh-schema",
                icon: RefreshCw,
                label: "Refresh schema",
                onClick: handleRefreshSchema,
                disabled: refreshing,
              },
            ]}
          />
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="registry-table-grid">
          <thead>
            <tr className="bg-blue-50 border-b border-hairline">
              {/* Status dot column */}
              <th
                className="w-8 px-2 py-2 bg-blue-100"
                data-testid="registry-table-header-status"
                aria-label="Status"
              />
              {/* Mandatory Name column */}
              <th
                className="px-4 py-2 text-left font-medium text-foreground bg-blue-100"
                data-testid="registry-table-header-name"
              >
                Name
              </th>
              {/* Schema columns */}
              {columns.map((col) => (
                <th
                  key={col.name}
                  className="px-4 py-2 text-left font-medium text-foreground"
                  data-testid={`registry-table-header-${col.name}`}
                >
                  {col.name} ({col.type})
                </th>
              ))}
              {/* Delete button column — hidden in read-only mode */}
              {!readOnly && (
                <th
                  className="w-8 px-2 py-2"
                  data-testid="registry-table-header-delete"
                  aria-label="Actions"
                />
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr data-testid="registry-table-empty-row">
                <td
                  colSpan={readOnly ? 2 + columns.length : 3 + columns.length}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  {readOnly
                    ? "No rows."
                    : 'No rows yet. Click "+ New Row" below to add one.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.displayId}
                  className="border-b border-hairline last:border-b-0 group"
                  data-testid={`registry-table-row-${row.displayId}`}
                >
                  {/* Status dot */}
                  <td className="px-2 py-2 text-center align-middle">
                    <StatusDot
                      row={row}
                      schemaContentHash={schemaContentHash}
                    />
                  </td>

                  {/* Name column */}
                  <td className="px-4 py-2 align-middle">
                    {readOnly ? (
                      <span
                        className="text-sm"
                        data-testid={`name-cell-${row.displayId}`}
                      >
                        {row.__name || ""}
                      </span>
                    ) : (
                      <>
                        <span
                          className="outline-none min-w-[100px] inline-block px-1 py-0.5 rounded hover:bg-surface/50 focus:bg-surface/80 text-sm"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            const newName = e.currentTarget.textContent ?? "";
                            if (newName !== (row.__name ?? "")) {
                              handleNameCommit(row.displayId, newName);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              (e.target as HTMLElement).blur();
                            }
                          }}
                          data-testid={`name-cell-${row.displayId}`}
                        >
                          {row.__name || ""}
                        </span>
                        {!row.__name && (
                          <span className="text-xs text-muted-foreground italic pointer-events-none select-none">
                            Enter name…
                          </span>
                        )}
                      </>
                    )}
                  </td>

                  {/* Schema columns */}
                  {columns.map((col) => (
                    <td
                      key={col.name}
                      className="px-4 py-2 align-middle"
                      data-testid={`cell-${row.displayId}-${col.name}`}
                    >
                      <EditableCell
                        columnName={col.name}
                        columnType={col.type}
                        value={row.values[col.name]}
                        rowDisplayId={row.displayId}
                        onCommit={(colName, newValue) =>
                          handleCellCommit(row.displayId, colName, newValue)
                        }
                        readOnly={readOnly}
                      />
                    </td>
                  ))}

                  {/* Delete button — visible on row hover, hidden in read-only mode */}
                  {!readOnly && (
                    <td className="px-2 py-2 align-middle text-center">
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity p-1 rounded hover:bg-surface/50"
                        onClick={() => handleDeleteRow(row.displayId)}
                        title="Delete row"
                        aria-label={`Delete row ${row.displayId}`}
                        data-testid={`delete-row-${row.displayId}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* "+ New Row" ghost button — hidden in read-only mode */}
      {!readOnly && (
        <div className="border-t border-hairline px-4 py-1.5">
          <button
            type="button"
            className="flex items-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground hover:bg-surface/50 rounded px-2 py-1.5 transition-colors"
            onClick={handleAddRow}
            data-testid="add-row-btn"
          >
            <Plus className="h-3.5 w-3.5" />
            New Row
          </button>
        </div>
      )}
    </div>
  );
}

// ── Slot-system Block Component ─────────────────────────────────────────────

/**
 * Slot-system block component for the registry table.
 *
 * Receives `BlockComponentProps` (no NodeViewWrapper — BlockNodeView
 * provides one). Renders the same inner content.
 */
export function RegistryTableBlockComponent({
  instance,
  context,
}: BlockComponentProps) {
  const attrs = instance.attrs as Record<string, unknown>;
  const schemaId = (attrs.schemaId as number | null) ?? null;
  const schemaName = (attrs.schemaName as string | null) ?? null;
  const schemaContentHash =
    (attrs.schemaContentHash as string | null) ?? null;
  const title = (attrs.title as string) || "Registry Table";
  const columns: GridColumn[] = (attrs.columns as GridColumn[]) ?? [];
  const rows: RegistryTableRow[] =
    (attrs.rows as RegistryTableRow[]) ?? [];
  const readOnly = context.viewMode === "view";

  return (
    <RegistryTableContent
      schemaId={schemaId}
      schemaName={schemaName}
      schemaContentHash={schemaContentHash}
      title={title}
      columns={columns}
      rows={rows}
      updateAttrs={instance.updateAttrs}
      readOnly={readOnly}
    />
  );
}
