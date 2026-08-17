/**
 * React component for the registry-table TipTap block.
 *
 * Three states:
 * 1. **Placeholder** (schemaId === null): compact box with Database icon,
 *    "Registry Table" label, and "Load Schema" button.
 * 2. **Picker open**: a portaled popover lists active EntityTypes fetched
 *    from the LIMS API. Loading and empty states handled.
 * 3. **Loaded table**: editable title bar, schema name label, header row
 *    with mandatory "Name" column + schema columns, data rows
 *    with type-aware cell editors, status dots, row add/delete operations,
 *    and reference-cell @-mention popover.
 *
 * Schema is locked once loaded — no swap action.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createBlockAdapter } from "../../../shell/src/mod-system/createBlockAdapter";
import { Database, Loader, Trash2, Plus, RefreshCw, Upload, ArrowLeftRight } from "lucide-react";
import { get, del, post } from "../../../shell/src/api/client";
import type { EntityTypeSummary } from "../types";
import type { GridColumn } from "../../../shell/src/shared/types/types";
import { usePickerPortal } from "../../../shell/src/shared/hooks/usePickerPortal";
import { PickerPortal } from "../../../shell/src/shared/components/PickerPortal";
import MentionBadge from "../../../shell/src/shared/components/MentionBadge";
import MoreActions, { type MoreActionsItem } from "../components/MoreActions";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { getCellEditor, getColumnTypeIcon, type CellEditorComponent } from "../../../shell/src/shared/components/CellEditors";
import { resolveColorHex, deriveForeground } from "../../../shell/src/shared/components/IconBadge";
import { listDropdowns } from "../../dropdowns/api";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import {
  StickyActionCell,
  StickyActionHeader,
  TableScroll,
  TableStretch,
} from "../../../shell/src/shared/primitives/TableLayout";
import type { ElnSidebarData } from "./sidebarData";

// ── Registry Table Row Type ────────────────────────────────────────────────

/** A single row in the registry table, extending GridRow with registration state. */
export interface RegistryTableRow {
  /** Entity ID — null for unregistered rows. */
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

/** Resolve a column type string to a BackendColumnType from the registry. */
function resolveColumnType(columnType: string) {
  const typeId = columnType.toLowerCase();
  return ModRegistry.getInstance().getColumnType(typeId);
}

/** Get the default value for a single column, driven by its column type's
 *  ``defaultValue`` from the registry. */
function emptyValue(col: GridColumn): unknown {
  const colType = resolveColumnType(col.type);
  const defaultValue = colType?.defaultValue ?? "";

  if (col.default !== undefined) {
    const shape = colType?.operandShape ?? "text";
    if (shape === "number") {
      return Number(col.default);
    }
    if (shape === "boolean") {
      return col.default === "true";
    }
    return col.default;
  }
  return defaultValue;
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
    dropdownId: c.dropdownId,
    referenceSchemaId: c.referenceSchemaId,
  }));
}

// ── Status Bar ─────────────────────────────────────────────────────────────

/** Priority order: red > yellow > orange > blue > green */
type DotColor = "red" | "yellow" | "orange" | "blue" | "green";

/**
 * Computes the status color for a row following the priority rules:
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
      const currentSnapshot = computeRowSnapshot(row);
      if (currentSnapshot !== row.lastRegisteredValueHash) return "orange";
    }

    // Green: registered, schema matches, data unchanged
    return "green";
  }

  // Blue: unregistered, no errors
  return "blue";
}

/** Produces a deterministic serialisation of row state (values + name) for change detection. */
function computeRowSnapshot(row: RegistryTableRow): string {
  const data: Record<string, unknown> = { ...row.values, __name: row.__name };
  const sorted = Object.keys(data)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = data[key];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

/**
 * A row is "green" (unchanged since last registration) when all of these hold:
 * - isRegistered is true
 * - entityId is non-null
 * - No registration error
 * - Schema content hash is available
 * - lastRegisteredValueHash is non-null and matches the current value snapshot
 */
function isGreen(row: RegistryTableRow, schemaContentHash: string | null): boolean {
  if (!row.isRegistered || row.entityId === null) return false;
  if (row.registrationError) return false;
  if (!schemaContentHash) return false;
  if (row.lastRegisteredValueHash === null) return false;
  return computeRowSnapshot(row) === row.lastRegisteredValueHash;
}

const DOT_COLORS: Record<DotColor, string> = {
  red: "var(--color-status-red)",
  yellow: "var(--color-status-yellow)",
  orange: "var(--color-status-orange)",
  blue: "var(--color-status-blue)",
  green: "var(--color-status-green)",
};

const DOT_LABELS: Record<DotColor, string> = {
  red: "Registration error",
  yellow: "Schema has changed since last registration",
  orange: "Data changed since last registration",
  blue: "Not yet registered",
  green: "Registered, up to date",
};

// ── Editable Cell ──────────────────────────────────────────────────────────

interface EditableCellProps {
  columnName: string;
  columnType: string;
  value: unknown;
  onCommit: (columnName: string, newValue: unknown) => void;
  readOnly?: boolean;
  /** Resolved dropdown options for dropdown-type columns. */
  dropdownOptions?: string[];
  /** Target schema ID for reference columns. */
  referenceSchemaId?: number;
}

/** Resolve the operand_shape for a column type string from the registry. */
function resolveOperandShape(columnType: string): string {
  const colType = resolveColumnType(columnType);
  return colType?.operandShape ?? "text";
}

/** Render the compact type badge shown after a column name in the header row.
 *  Reads the icon from the column type registry and falls back to the type
 *  label for unknown or unregistered types. */
function renderColumnTypeBadge(columnType: string): React.ReactNode {
  const colType = resolveColumnType(columnType);
  if (colType) {
    const IconComponent = getColumnTypeIcon(colType.icon);
    const colorKey = colType.color || "muted";
    const bg = resolveColorHex(colorKey);
    const fg = deriveForeground(bg);
    if (IconComponent) {
      return (
        <span
          className="inline-flex items-center justify-center rounded"
          style={{ backgroundColor: bg, color: fg, width: 18, height: 18 }}
        >
          <IconComponent className="h-3 w-3" aria-label={colType.displayName} />
        </span>
      );
    }
  }
  // Fallback: compact label for legacy types
  return columnType;
}

/**
 * Renders the appropriate editor for a cell based on its column type's
 * ``operand_shape``, looked up from the column type registry.
 *
 * The dispatch is fully generic — adding a new column type requires zero
 * changes to this component (unless a completely custom editor is needed,
 * deferred).
 */
function EditableCell({
  columnName,
  columnType,
  value,
  onCommit,
  readOnly = false,
  dropdownOptions,
  referenceSchemaId,
}: EditableCellProps) {
  const operandShape = resolveOperandShape(columnType);
  const CellEditor: CellEditorComponent = getCellEditor(operandShape);

  if (readOnly) {
    // Render all cell types as read-only display, except entity-picker
    // and select which keep their interactive elements visible.
    if (operandShape === "entity-picker") {
      return (
        <CellEditor
          value={value}
          onCommit={(v) => onCommit(columnName, v)}
          readOnly
          referenceSchemaId={referenceSchemaId}
        />
      );
    }
    if (operandShape === "dropdown" && dropdownOptions && dropdownOptions.length > 0) {
      return (
        <CellEditor
          value={value}
          onCommit={(v) => onCommit(columnName, v)}
          readOnly
          dropdownOptions={dropdownOptions}
        />
      );
    }
    if (operandShape === "boolean") {
      return (
        <span data-testid="boolean-display" className="inline-block px-4 py-2">
          {value === true ? "Yes" : "No"}
        </span>
      );
    }
    return (
      <span data-testid="readonly-cell" className="inline-block px-4 py-2">
        {value != null ? String(value) : ""}
      </span>
    );
  }

  return (
    <CellEditor
      value={value}
      onCommit={(v) => onCommit(columnName, v)}
      dropdownOptions={dropdownOptions}
      referenceSchemaId={referenceSchemaId}
    />
  );
}

// ── Batch Register Response Types ───────────────────────────────────────────

interface BatchRegisterResult {
  row_index: number;
  entity_id: number;
  display_id: string;
  status: string;
}

interface BatchRegisterError {
  row_index: number;
  field: string;
  message: string;
}

interface BatchRegisterResponse {
  results: BatchRegisterResult[];
  errors: BatchRegisterError[];
}

// ── Inner Content Props ─────────────────────────────────────────────────────

interface RegistryTableContentProps {
  schemaId: number | null;
  schemaName: string | null;
  schemaContentHash: string | null;
  title: string;
  columns: GridColumn[];
  rows: RegistryTableRow[];
  /** Project containing the current ELN entry, used for new entities. */
  projectId?: number | null;
  /** Folder containing the current ELN entry, used for new entities. */
  folderId?: number | null;
  updateAttrs: (attrs: Record<string, unknown>) => void;
  /** When true, inline editing and action buttons are hidden. */
  readOnly?: boolean;
  /** Current stretch mode — "auto" (max-content) or "full" (full-width). */
  stretchMode?: "auto" | "full";
  /** Called when the user clicks the stretch toggle button. */
  onToggleStretch?: () => void;
  /** When true, the stretch toggle button is rendered. */
  showStretchToggle?: boolean;
  /** When true, render the table without any backend or local mutations. */
  previewMode?: boolean;
  /**
   * Optional emitAction function for emitting custom domain actions
   * declared in the block registration's `emits` field.
   *
   * Replaces the legacy `sendAction` prop — blocks call this with a
   * localId and payload, and the renderer derives the global action ID
   * as `{blockId}.{localId}` and emits on the workspace bus.
   */
  emitAction?: (localId: string, payload?: Record<string, unknown>) => void;
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
  projectId,
  folderId,
  updateAttrs,
  readOnly = false,
  stretchMode = "auto",
  onToggleStretch,
  showStretchToggle = false,
  previewMode = false,
  emitAction,
}: RegistryTableContentProps) {
  // ── Picker state ────────────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [entityTypes, setEntityTypes] = useState<EntityTypeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const newRowCounter = useRef(
    rows.filter((r) => !r.isRegistered).length + 1,
  );

  const { triggerRef, panelRef, position } = usePickerPortal({
    open: showPicker,
    onClose: () => setShowPicker(false),
  });

  // ── Resolve dropdown options for dropdown columns ──────────────────────
  const [dropdownOptionsMap, setDropdownOptionsMap] = useState<
    Map<string, string[]>
  >(new Map());

  useEffect(() => {
    if (previewMode) {
      setDropdownOptionsMap(new Map(
        columns
          .filter((column) => column.type === "dropdown")
          .map((column) => [column.name, ["Researcher", "Reviewer", "Operator"]]),
      ));
      return;
    }
    const selectColumns = columns.filter(
      (c) => c.type === "dropdown" && c.dropdownId,
    );
    if (selectColumns.length === 0) {
      setDropdownOptionsMap(new Map());
      return;
    }

    let cancelled = false;
    listDropdowns()
      .then((dropdowns) => {
        if (cancelled) return;
        const map = new Map<string, string[]>();
        const optionsById = new Map<number, string[]>();
        for (const d of dropdowns) {
          optionsById.set(d.id, d.options);
        }
        for (const col of selectColumns) {
          if (col.dropdownId) {
            const opts = optionsById.get(col.dropdownId);
            if (opts) {
              map.set(col.name, opts);
            }
          }
        }
        setDropdownOptionsMap(map);
      })
      .catch(() => {
        if (!cancelled) setDropdownOptionsMap(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [columns, previewMode]);

  // ── Fetch entity types when picker opens ────────────────────────────
  const handleOpenPicker = useCallback(async () => {
    if (previewMode) return;
    setShowPicker(true);
    if (entityTypes.length === 0) {
      setLoading(true);
      try {
        const data = await get<EntityTypeSummary[]>("/schemas/");
        setEntityTypes(data.filter((t) => t.is_active && !t.is_default));
      } catch {
        // silently leave list empty
      } finally {
        setLoading(false);
      }
    }
  }, [entityTypes.length, previewMode]);

  // ── Select an entity type → snapshot schema into block attrs ────────
  const handleSelectEntityType = useCallback(
    (entityType: EntityTypeSummary) => {
      if (previewMode) return;
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
    [previewMode, updateAttrs],
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

    // Emit custom domain action via context.emitAction (fail-open).
    emitAction?.("row-added", { rowCount: rows.length + 1 });
  }, [rows, columns, updateAttrs, emitAction]);

  // ── Delete row ───────────────────────────────────────────────────────
  const handleDeleteRow = useCallback(
    async (rowDisplayId: string) => {
      if (previewMode) return;
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
    [previewMode, rows, updateAttrs],
  );

  // ── Refresh schema ───────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const handleRefreshSchema = useCallback(async () => {
    if (previewMode || schemaId === null) return;
    setRefreshing(true);
    try {
      const entityType = await get<EntityTypeSummary>(
        `/schemas/${schemaId}/`,
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
  }, [previewMode, schemaId, columns, rows, updateAttrs]);

  // ── Register entities ───────────────────────────────────────────────
  const [registering, setRegistering] = useState(false);

  const handleRegister = useCallback(async () => {
    if (previewMode || schemaId === null) return;

    // Collect non-green rows with their original indices
    const nonGreenRows: { index: number; row: RegistryTableRow }[] = [];
    const emptyNameErrors: { index: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (isGreen(row, schemaContentHash)) continue;
      if (!row.__name || !row.__name.trim()) {
        emptyNameErrors.push({ index: i, error: "Name is required." });
        continue;
      }
      nonGreenRows.push({ index: i, row });
    }

    // Nothing to do
    if (nonGreenRows.length === 0 && emptyNameErrors.length === 0) return;

    setRegistering(true);

    // Apply local empty-name errors immediately
    const updatedRows = [...rows];
    for (const { index, error } of emptyNameErrors) {
      updatedRows[index] = { ...updatedRows[index], registrationError: error };
    }

    if (nonGreenRows.length > 0) {
      try {
        const payload = {
          schema_id: schemaId,
          project_id: projectId ?? null,
          rows: nonGreenRows.map(({ row }) => ({
            entity_id: row.entityId,
            name: row.__name,
            values: row.values,
            ...(folderId !== null && folderId !== undefined
              ? { folder_id: folderId }
              : {}),
          })),
        };

        const response = await post<BatchRegisterResponse>(
          "/lims/entities/batch-register/",
          payload,
        );

        // Apply successful results
        for (const result of response.results) {
          if (result.row_index < 0 || result.row_index >= nonGreenRows.length) continue;
          const { index: originalIndex, row } = nonGreenRows[result.row_index];
          const hash = computeRowSnapshot(row);
          updatedRows[originalIndex] = {
            ...updatedRows[originalIndex],
            entityId: result.entity_id,
            displayId: result.display_id,
            isRegistered: true,
            lastRegisteredValueHash: hash,
            registrationError: null,
          };
        }

        // Apply API errors
        for (const error of response.errors) {
          if (error.row_index < 0 || error.row_index >= nonGreenRows.length) continue;
          const { index: originalIndex } = nonGreenRows[error.row_index];
          updatedRows[originalIndex] = {
            ...updatedRows[originalIndex],
            registrationError: error.message,
          };
        }
      } catch (err) {
        // Network or unexpected error — mark all sent rows as errored
        const message =
          err instanceof Error ? err.message : "Registration failed";
        for (const { index: originalIndex } of nonGreenRows) {
          updatedRows[originalIndex] = {
            ...updatedRows[originalIndex],
            registrationError: message,
          };
        }
      }
    }

    updateAttrs({ rows: updatedRows });
    setRegistering(false);

    // Emit custom domain action via context.emitAction (fail-open).
    if (nonGreenRows.length > 0) {
      const successCount = nonGreenRows.filter(
        ({ index }) => !updatedRows[index]?.registrationError,
      ).length;

      emitAction?.("entities-registered", {
        registeredCount: successCount,
        totalAttempted: nonGreenRows.length,
      });
    }
  }, [
    previewMode,
    schemaId,
    rows,
    schemaContentHash,
    projectId,
    folderId,
    updateAttrs,
    emitAction,
  ]);

  // ── Placeholder state ───────────────────────────────────────────────
  if (schemaId === null) {
    return (
      <div
        className="rounded-lg border border-hairline bg-background p-4"
        data-testid="registry-table-placeholder"
      >
        <div className="flex items-center gap-2.5">
          <Database className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span
            className="text-sm font-medium text-foreground outline-none"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            data-testid="registry-table-title"
          >
            {title}
          </span>
        </div>
        <div className="mt-3">
          <button
            ref={triggerRef}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-surface/80 hover:text-foreground transition-colors"
            onClick={handleOpenPicker}
            data-testid="load-schema-btn"
          >
            Load Schema
          </button>
        </div>

        {/* ── Picker popover ──────────────────────────────────────── */}
        {showPicker && (
          <PickerPortal
            position={position}
            panelRef={panelRef}
            testId="schema-picker"
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
          </PickerPortal>
        )}
      </div>
    );
  }

  // ── Loaded table state ──────────────────────────────────────────────
  return (
    <>
      <div
        className="rounded-lg border border-hairline bg-background w-full"
        data-testid="registry-table-loaded"
      >
      {/* Title bar — always full width, matching the workspace content container. */}
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5 w-full">
        <Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {/* Stretch toggle — only rendered when overrides.stretch is truthy */}
        {showStretchToggle && (
          <IconButton
            onClick={onToggleStretch}
            title={
              stretchMode === "auto"
                ? "Stretch table to full width"
                : "Auto-fit table to content"
            }
            aria-label={
              stretchMode === "auto"
                ? "Stretch table to full width"
                : "Auto-fit table to content"
            }
            aria-pressed={stretchMode === "full"}
            data-testid="stretch-toggle-btn"
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        )}
        {readOnly ? (
          <span
            className="text-sm font-medium text-foreground"
            data-testid="registry-table-title"
          >
            {title}
          </span>
        ) : (
          <span
            className="text-sm font-medium text-foreground outline-none"
            contentEditable
            suppressContentEditableWarning
            onBlur={handleTitleBlur}
            onKeyDown={handleTitleKeyDown}
            data-testid="registry-table-title"
          >
            {title}
          </span>
        )}
        {schemaName && (
          <span
            className="text-xs text-muted-foreground"
            data-testid="registry-table-schema-label"
          >
            {schemaName}
          </span>
        )}
        <div className="flex-1" />
        {refreshing && (
          <Loader className="h-3.5 w-3.5 animate-spin text-muted-foreground" data-testid="refresh-spinner" />
        )}
        {!readOnly && !previewMode && (
          <>
            <IconButton
              onClick={handleRefreshSchema}
              disabled={refreshing}
              title="Refresh schema"
              aria-label="Refresh schema"
              data-testid="refresh-schema-btn"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            <IconButton
              onClick={handleRegister}
              disabled={registering}
              title="Register entities"
              aria-label="Register entities"
              data-testid="register-entities-btn"
            >
              {registering ? (
                <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
            </IconButton>
          </>
        )}
        {previewMode && (
          <IconButton
            disabled
            title="Registration is disabled in preview"
            aria-label="Register entities"
            data-testid="register-entities-btn"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        )}
      </div>

      {/* Table wrapper — constrained in auto mode so only the title bar
          spans the full workspace content width. */}
      <TableStretch
        mode={stretchMode}
        data-testid="registry-table-stretch-wrapper"
      >
      {/* Table — overflow-x-auto constrains the scrollbar while negative
          margins + padding let the table content extend visually into both
          left and right gutters when scrolled. In auto mode the wrapper
          breaks out 19rem on each side (17.5rem gutter + 1.5rem main px-6)
          so columns remain visible in the gutter spaces.  The table uses
          w-max min-w-full so it can grow past the card width. */}
      <TableScroll mode={stretchMode}>
        <table className={`text-base bg-background ${stretchMode === "auto" ? "w-max min-w-full" : "min-w-full"}`} data-testid="registry-table-grid">
          <thead className={stretchMode === "auto" ? "bg-background" : ""}>
            <tr className="border-b border-hairline bg-surface text-left font-[var(--font-label)] text-2xs uppercase tracking-widest text-muted-foreground">
              {/* Status + entity pill column */}
              <th
                className="px-2 py-2 whitespace-nowrap"
                data-testid="registry-table-header-status"
                aria-label="Status"
              />
              {/* Mandatory Name column */}
              <th
                className="px-4 py-2 text-left font-medium whitespace-nowrap"
                data-testid="registry-table-header-name"
              >
                Name
              </th>
              {/* Schema columns */}
              {columns.map((col) => (
                <th
                  key={col.name}
                  className="px-4 py-2 text-left font-medium whitespace-nowrap"
                  data-testid={`registry-table-header-${col.name}`}
                >
                  {col.name}
                  <span className="ml-1 inline-flex items-center text-2xs text-muted-foreground font-normal align-middle">
                    {renderColumnTypeBadge(col.type)}
                  </span>
                </th>
              ))}
              {/* Actions column — sticky to right edge, always visible during horizontal scroll.
                   No border or background so it blends seamlessly. Hidden in read-only mode. */}
              {!readOnly && (
                <StickyActionHeader
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
              rows.map((row) => {
                const dotColor = getDotColor(row, schemaContentHash);
                return (
                <tr
                  key={row.displayId}
                  className="border-b border-hairline last:border-b-0 hover:bg-surface transition-colors group"
                  data-testid={`registry-table-row-${row.displayId}`}
                >
                  {/* Status bar + entity pill */}
                  <td className="relative px-2 py-2 text-center align-middle">
                    {/* Colored status bar on the left edge of the row,
                        top-to-bottom, extends inward on row hover */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[3px] group-hover:w-[5px] transition-all duration-150"
                      style={{ backgroundColor: DOT_COLORS[dotColor] }}
                      title={DOT_LABELS[dotColor]}
                      aria-label={DOT_LABELS[dotColor]}
                      data-testid={`status-bar-${dotColor}`}
                    />
                    {row.isRegistered && row.entityId !== null && row.displayId && (
                      <MentionBadge
                        displayId={row.displayId}
                        clickable
                        compact
                        resolved={{
                          displayId: row.displayId,
                          title: row.__name,
                          type: "entity",
                          id: row.entityId,
                          icon: "📦",
                          workspaceId: "lims",
                        }}
                      />
                    )}
                  </td>

                  {/* Name column */}
                  <td className="align-middle font-[var(--font-label)] text-sm whitespace-nowrap">
                    {readOnly ? (
                      <span
                        data-testid={`name-cell-${row.displayId}`}
                        className="inline-block px-4 py-2"
                      >
                        {row.__name || ""}
                      </span>
                    ) : (
                      <span
                        className={`outline-none min-w-[100px] inline-block px-4 py-2 rounded hover:bg-surface focus:bg-surface ${!row.__name ? "name-cell-placeholder" : ""}`}
                        contentEditable
                        suppressContentEditableWarning
                        data-placeholder="Enter name…"
                        onInput={(e) => {
                          // Keep the placeholder class in sync on every keystroke
                          // so it survives browser-injected <br> tags in contentEditable.
                          const el = e.currentTarget;
                          const text = el.textContent ?? "";
                          if (text.trim().length === 0) {
                            el.classList.add("name-cell-placeholder");
                          } else {
                            el.classList.remove("name-cell-placeholder");
                          }
                        }}
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
                        {row.__name || null}
                      </span>
                    )}
                  </td>

                  {/* Schema columns */}
                  {columns.map((col) => (
                    <td
                      key={col.name}
                      className="align-middle font-[var(--font-label)] text-sm whitespace-nowrap"
                      data-testid={`cell-${row.displayId}-${col.name}`}
                    >
                      <EditableCell
                        columnName={col.name}
                        columnType={col.type}
                        value={row.values[col.name]}
                        onCommit={(colName, newValue) =>
                          handleCellCommit(row.displayId, colName, newValue)
                        }
                        readOnly={readOnly}
                        dropdownOptions={dropdownOptionsMap.get(col.name)}
                        referenceSchemaId={col.referenceSchemaId}
                      />
                    </td>
                  ))}

                  {/* Three-dot action menu — sticky to right edge, always visible on row hover.
                       No border or background so it blends seamlessly. Hidden in read-only mode. */}
                  {!readOnly && (
                     <StickyActionCell className="align-middle">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreActions
                          items={[
                            {
                              key: "delete",
                              icon: Trash2,
                              label: "Delete",
                              onClick: () => handleDeleteRow(row.displayId),
                              destructive: true,
                              tooltip: `Delete row ${row.displayId}`,
                            },
                          ]}
                        />
                      </div>
                     </StickyActionCell>
                  )}
                </tr>
              );
              })
            )}
          </tbody>
        </table>
      </TableScroll>

      </TableStretch>
    </div>
    {/* "+ New Row" button below the card — constrained to center gutter width.
         In auto mode left-aligned so it stays anchored to the center gutter
         even when the table extends past it; in full mode centered at 48rem.
         Hidden in read-only mode. */}
    {!readOnly && (
      <div className={`mt-2 ${
        stretchMode === "auto"
          ? "max-w-3xl"
          : "max-w-3xl mx-auto"
      }`}>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={handleAddRow}
          aria-label="Add new row"
          data-testid="add-row-btn"
        >
          <Plus className="h-3 w-3" />
          <span>New Row</span>
        </Button>
      </div>
    )}
    </>
  );
}

// ── Slot-system Block Component ─────────────────────────────────────────────

/**
 * Slot-system block component for the registry table.
 *
 * Receives `BlockComponentProps` (no NodeViewWrapper — BlockNodeView
 * provides one). Renders the same inner content.
 */
export const RegistryTableBlockComponent = createBlockAdapter(
  RegistryTableContent,
  ({ instance, context, overrides = {} }) => {
    const attrs = instance.attrs as Record<string, unknown>;
    const stretchMode = (attrs.stretchMode as "auto" | "full") ?? "auto";
    const entryContext = context.entry as ElnSidebarData | undefined;
    const projectId = entryContext?.projectId ?? entryContext?.entry?.project ?? null;
    const folderId = entryContext?.folderId ?? entryContext?.entry?.folder ?? null;

    return {
      schemaId: (attrs.schemaId as number | null) ?? null,
      schemaName: (attrs.schemaName as string | null) ?? null,
      schemaContentHash:
        (attrs.schemaContentHash as string | null) ?? null,
      title: (attrs.title as string) || "Registry Table",
      columns: (attrs.columns as GridColumn[]) ?? [],
      rows: (attrs.rows as RegistryTableRow[]) ?? [],
       projectId,
       folderId,
      updateAttrs: instance.updateAttrs,
      readOnly: context.viewMode === "view",
      previewMode: context.viewMode === "prototype",
      stretchMode,
      onToggleStretch: () => {
        const nextMode = stretchMode === "auto" ? "full" : "auto";
        instance.updateAttrs({ stretchMode: nextMode });
      },
      showStretchToggle: overrides.stretch === true,
      emitAction: context.viewMode === "prototype" ? undefined : context.emitAction,
    };
  },
);
