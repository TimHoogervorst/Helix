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
import { getColumnTypeIcon } from "../../../shell/src/shared/components/CellEditors";
import { useTableInteraction } from "../../../shell/src/shared/hooks/useTableInteraction";
import {
  TypedFullCell,
  parseCellValue,
  renderCellValue,
} from "../../../shell/src/shared/components/TableCells";
import { resolveColorHex, deriveForeground } from "../../../shell/src/shared/components/IconBadge";
import { listDropdowns } from "../../dropdowns/api";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import {
  StickyActionCell,
  StickyActionHeader,
  TableChrome,
  TableScroll,
  TableStretch,
} from "../../../shell/src/shared/primitives/TableLayout";
import type { ElnSidebarData } from "./sidebarData";
import {
  evaluateRow,
  type FormulaColumn,
  type FormulaRow,
} from "../../../shell/src/shared/formulas/formulaEngine";
import {
  evaluateCellFormulas,
  rewriteCellFormulaRows,
  type CellFormulaMap,
} from "../../../shell/src/shared/formulas/cellFormulas";

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
  /** Schema hash that produced the last successful registration. */
  lastRegisteredSchemaContentHash?: string | null;
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
    referenceSchemaTypeId: c.referenceSchemaTypeId,
    expression: c.expression,
    resultType: c.resultType,
    expression_version: c.expression_version,
  }));
}

// ── Status Bar ─────────────────────────────────────────────────────────────

/** Priority order: red > yellow > orange > blue > green */
type DotColor = "red" | "yellow" | "orange" | "blue" | "green";

/**
 * Computes the status color for a row following the priority rules:
 * - Red: registration error exists
 * - Yellow: schema content hash is unavailable or differs from registration
 * - Orange: row data changed since last registration
 * - Blue: unregistered with no errors
 * - Green: registered, schema matches, data unchanged
 *
 */
function getDotColor(row: RegistryTableRow, schemaContentHash: string | null): DotColor {
  // Red: registration error — highest priority
  if (row.registrationError) return "red";

  if (row.isRegistered && row.entityId !== null) {
    // Yellow: schema hash unavailable or changed since registration.
    if (
      !schemaContentHash ||
      row.lastRegisteredSchemaContentHash !== schemaContentHash
    ) return "yellow";

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
  if (row.lastRegisteredSchemaContentHash !== schemaContentHash) return false;
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

/**
 * Preview mode has no backend to search, so reference columns fall back to
 * static options (rendered as a full-cell select) instead of the entity
 * picker popover.
 */
const MOCK_REFERENCE_OPTIONS = ["ENT-001", "ENT-002", "ENT-003"];

// ── Editable Cell ──────────────────────────────────────────────────────────

/** Resolve the operand_shape for a column type string from the registry. */
function resolveOperandShape(columnType: string): string {
  const colType = resolveColumnType(columnType);
  return colType?.operandShape ?? "text";
}

function resolveColumnShape(column: GridColumn): string {
  return column.type === "formula"
    ? resolveOperandShape(column.resultType ?? "text")
    : resolveOperandShape(column.type);
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

// ── Batch Register Response Types ───────────────────────────────────────────

interface BatchRegisterResult {
  row_index: number;
  entity_id: number;
  display_id: string;
  status: string;
  values?: Record<string, unknown>;
  schema_content_hash?: string;
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
  formulaMap?: CellFormulaMap;
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
  /** Workspace context for entity-picker cells (metadata only). */
  workspaceId?: string;
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
  formulaMap = {},
  projectId,
  folderId,
  updateAttrs,
  readOnly = false,
  stretchMode = "auto",
  onToggleStretch,
  showStretchToggle = false,
  previewMode = false,
  workspaceId,
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
        setEntityTypes(
          data.filter(
            (t) =>
              t.is_active &&
              !t.is_default &&
              t.tags.includes("RegistrationTable"),
          ),
        );
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
      const rowIndex = rows.findIndex((row) => row.displayId === rowDisplayId);
      const nextFormulaMap = { ...formulaMap };
      const rowFormulas = { ...(nextFormulaMap[String(rowIndex)] ?? {}) };
      delete rowFormulas[columnName];
      if (Object.keys(rowFormulas).length) nextFormulaMap[String(rowIndex)] = rowFormulas;
      else delete nextFormulaMap[String(rowIndex)];
      updateAttrs(Object.keys(nextFormulaMap).length
        ? { rows: updatedRows, formulaMap: nextFormulaMap }
        : { rows: updatedRows });
    },
    [formulaMap, rows, updateAttrs],
  );

  const handleFormulaCommit = useCallback((rowDisplayId: string, columnName: string, expression: string) => {
    const rowIndex = rows.findIndex((row) => row.displayId === rowDisplayId);
    const nextFormulaMap = {
      ...formulaMap,
      [String(rowIndex)]: { ...(formulaMap[String(rowIndex)] ?? {}), [columnName]: expression },
    };
    const evaluated = evaluateCellFormulas(
      rows.map((row) => row.values as Record<string, any>),
      nextFormulaMap,
      new Set(columns.filter((column) => column.type === "formula").map((column) => column.name)),
    );
    const result = evaluated[rowIndex]?.[columnName];
    updateAttrs({
      rows: rows.map((row, index) => index === rowIndex
        ? { ...row, values: { ...row.values, [columnName]: result?.ok ? result.value : null } }
        : row),
      formulaMap: nextFormulaMap,
    });
  }, [formulaMap, rows, updateAttrs]);

  const formulaColumns = columns.filter(
    (column) => column.type === "formula" && column.expression,
  );
  const backendOnlyColumns = formulaColumns.filter((column) =>
    usesBackendOnlyFunction(column.expression!),
  );
  const [refreshingRow, setRefreshingRow] = useState<string | null>(null);
  const [refreshedSnapshots, setRefreshedSnapshots] = useState<Record<string, string>>({});

  const computedValues = useCallback(
    (row: RegistryTableRow) => {
      const formulas = Object.fromEntries(
        formulaColumns.map((column) => [
          column.name,
          { expression: column.expression! } satisfies FormulaColumn,
        ]),
      );
      const evaluated = evaluateRow(row.values as FormulaRow, formulas);
      return {
        ...row.values,
        ...Object.fromEntries(
          Object.entries(evaluated).map(([name, result]) => {
          const column = formulaColumns.find((item) => item.name === name);
          if (column && usesBackendOnlyFunction(column.expression!)) {
            return [name, row.values[name]];
          }
          return [name, result.ok ? result.value : result.error.code];
          }),
        ),
      };
    },
    [formulaColumns],
  );

  const refreshRow = useCallback(async (row: RegistryTableRow) => {
    if (previewMode || !backendOnlyColumns.length || refreshingRow === row.displayId) return;
    const formulaNames = new Set(formulaColumns.map((column) => column.name));
    if (backendOnlyColumns.some((column) =>
      !referencedValuesAreComplete(column.expression!, row.values, formulaNames),
    )) return;
    let values = { ...row.values };
    for (const column of formulaColumns) values[column.name] = undefined;
    setRefreshingRow(row.displayId);
    try {
      const pending = [...formulaColumns];
      while (pending.length) {
        const ready = pending.filter((column) =>
          referencedValuesAreComplete(column.expression!, values, formulaNames, true),
        );
        if (!ready.length) break;
        for (const column of ready) {
          const response = await post<FormulaEvaluateResponse>(
            "/formulas/evaluate/",
            { expression: column.expression, row: values },
          );
          values[column.name] = response.result.ok
            ? response.result.value
            : (response.result.error?.code ?? "#VALUE!");
          pending.splice(pending.indexOf(column), 1);
        }
      }
      updateAttrs({
        rows: rows.map((item) =>
          item.displayId === row.displayId ? { ...item, values } : item,
        ),
      });
      setRefreshedSnapshots((current) => ({
        ...current,
        [row.displayId]: computeRowSnapshot({ ...row, values }),
      }));
    } finally {
      setRefreshingRow(null);
    }
  }, [backendOnlyColumns, formulaColumns, previewMode, refreshingRow, rows, updateAttrs]);

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

  // ── Interaction controller: cell selection, keyboard nav, TSV clipboard ──
  // Grid layout: column 0 is the Name pseudo-column, schema columns follow.
  const localEvaluatedRows = evaluateCellFormulas(
    rows.map((row) => row.values as Record<string, any>),
    formulaMap,
    new Set(columns.filter((column) => column.type === "formula").map((column) => column.name)),
  );
  const interaction = useTableInteraction({
    tableId: "registry-table",
    rowCount: rows.length,
    columnCount: columns.length + 1,
    readOnly,
    getValues: () =>
      rows.map((row, rowIndex) => {
        const values = computedValues(row);
        return [
          row.__name,
          ...columns.map((col) =>
            renderCellValue(
              resolveColumnShape(col),
              localEvaluatedRows[rowIndex]?.[col.name]?.ok
                ? localEvaluatedRows[rowIndex][col.name].value
                : values[col.name],
            ),
          ),
        ];
      }),
    onPaste: (anchor, values) => {
      const updatedRows = rows.map((row, rowIndex) => {
        const pastedRow = values[rowIndex - anchor.row];
        if (!pastedRow || rowIndex < anchor.row) return row;
        let name = row.__name;
        const nextValues = { ...row.values };
        pastedRow.forEach((raw, offset) => {
          const gridColumn = anchor.column + offset;
          if (gridColumn === 0) {
            name = raw;
            return;
          }
          const col = columns[gridColumn - 1];
          if (!col || col.type === "formula") return;
          try {
            nextValues[col.name] = parseCellValue(
              resolveColumnShape(col),
              raw,
            );
          } catch {
            // Skip values that don't parse for the column's shape
          }
        });
        return { ...row, __name: name, values: nextValues };
      });
      updateAttrs({ rows: updatedRows });
    },
  });
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
    const nextFormulaMap = rewriteCellFormulaRows(formulaMap, rows.length, "insert");
    updateAttrs({
      rows: [...rows, newRow],
      ...(Object.keys(nextFormulaMap).length ? { formulaMap: nextFormulaMap } : {}),
    });

    // Emit custom domain action via context.emitAction (fail-open).
    emitAction?.("row-added", { rowCount: rows.length + 1 });
  }, [formulaMap, rows, columns, updateAttrs, emitAction]);

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
      const nextFormulaMap = rewriteCellFormulaRows(
        formulaMap,
        rows.findIndex((r) => r.displayId === rowDisplayId),
        "delete",
      );
      updateAttrs({
        rows: rows.filter((r) => r.displayId !== rowDisplayId),
        ...(Object.keys(nextFormulaMap).length ? { formulaMap: nextFormulaMap } : {}),
      });
    },
    [formulaMap, previewMode, rows, updateAttrs],
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
            values: Object.fromEntries(
              Object.entries(row.values).filter(
                ([name]) => !columns.some(
                  (column) => column.name === name && column.type === "formula",
                ),
              ),
            ),
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
          const registeredValues = {
            ...row.values,
            ...(result.values ?? {}),
          };
          const hash = computeRowSnapshot({ ...row, values: registeredValues });
           updatedRows[originalIndex] = {
            ...updatedRows[originalIndex],
            values: registeredValues,
            entityId: result.entity_id,
            displayId: result.display_id,
            isRegistered: true,
            lastRegisteredValueHash: hash,
            lastRegisteredSchemaContentHash:
              result.schema_content_hash ?? schemaContentHash,
            registrationError: null,
           };
           if (backendOnlyColumns.length > 0) {
             setRefreshedSnapshots((current) => ({
               ...current,
               [result.display_id]: computeRowSnapshot({
                 ...row,
                 displayId: result.display_id,
                 values: registeredValues,
               }),
             }));
           }
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
    backendOnlyColumns.length,
    setRefreshedSnapshots,
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
            className="text-sm font-medium text-foreground outline-none focus:outline-none"
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
    <TableChrome
      className="w-full table-layout-chrome--compact"
      data-testid="registry-table-loaded"
      title={
        <span className="inline-flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {readOnly ? (
            <span data-testid="registry-table-title">{title}</span>
          ) : (
              <span
                className="outline-none focus:outline-none"
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
              className="text-xs font-normal text-muted-foreground"
              data-testid="registry-table-schema-label"
            >
              {schemaName}
            </span>
          )}
        </span>
      }
      toolbar={
        <>
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
          {refreshing && (
            <Loader className="h-3.5 w-3.5 text-muted-foreground" data-testid="refresh-spinner" />
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
                variant="primary"
                size="sm"
                className="table-layout-register-button"
                data-testid="register-entities-btn"
              >
                {registering ? (
                  <Loader className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" style={{ width: "1rem", height: "1rem", flexShrink: 0 }} />
                ) : (
                  <Upload className="h-4 w-4 shrink-0" aria-hidden="true" style={{ width: "1rem", height: "1rem", flexShrink: 0 }} />
                )}
              </IconButton>
            </>
          )}
          {previewMode && (
            <IconButton
              disabled
              title="Registration is disabled in preview"
              aria-label="Register entities"
              variant="primary"
              size="sm"
              className="table-layout-register-button"
              data-testid="register-entities-btn"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden="true" style={{ width: "1rem", height: "1rem", flexShrink: 0 }} />
            </IconButton>
          )}
        </>
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
      addRowOutside
    >

      <TableStretch
        mode={stretchMode}
        data-testid="registry-table-stretch-wrapper"
      >
      <TableScroll mode={stretchMode}>
        <div
          className="w-max min-w-full"
          ref={interaction.containerRef}
          onCopy={interaction.handleCopy}
          onPaste={interaction.handlePaste}
        >
        <table className={`text-base bg-background ${stretchMode === "auto" ? "w-max min-w-full" : "min-w-full"}`} data-testid="registry-table-grid">
          <colgroup>
            <col style={{ width: "2.5rem" }} />
            <col style={{ width: "10rem" }} />
            {columns.map((col) => <col key={col.name} style={{ width: "10rem" }} />)}
            {!readOnly && <col style={{ width: "2.5rem" }} />}
          </colgroup>
          <thead className={stretchMode === "auto" ? "bg-background" : ""}>
            <tr className="border-b border-hairline bg-surface text-left font-[var(--font-label)] text-2xs uppercase tracking-widest text-muted-foreground">
              {/* Status + entity pill column */}
              <th
                className="w-10 px-2 py-1 whitespace-nowrap"
                data-testid="registry-table-header-status"
                aria-label="Status"
              />
              {/* Mandatory Name column */}
              <th
                  className="px-4 py-1 text-left font-medium whitespace-nowrap"
                data-testid="registry-table-header-name"
              >
                Name
              </th>
              {/* Schema columns */}
              {columns.map((col) => (
                <th
                  key={col.name}
                  className="px-4 py-1 text-left font-medium whitespace-nowrap"
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
              rows.map((row, rowIndex) => {
                const values = computedValues(row);
                const rowSnapshot = computeRowSnapshot({ ...row, values });
                const refreshed = refreshedSnapshots[row.displayId] !== undefined;
                const stale = backendOnlyColumns.length > 0 && refreshed &&
                  refreshedSnapshots[row.displayId] !== rowSnapshot;
                const dotColor = getDotColor({ ...row, values }, schemaContentHash);
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
                  <td
                    className="p-0!"
                    {...interaction.cellProps({ row: rowIndex, column: 0 })}
                  >
                    <TypedFullCell
                      shape="text"
                      value={row.__name}
                      onCommit={(value) =>
                        handleNameCommit(row.displayId, String(value ?? ""))
                      }
                      position={{ row: rowIndex, column: 0 }}
                      interaction={interaction}
                      readOnly={readOnly}
                      placeholder="Enter name…"
                      data-testid={`name-cell-${row.displayId}`}
                    />
                  </td>

                  {/* Schema columns */}
                  {columns.map((col, columnIndex) => {
                    const shape = resolveColumnShape(col);
                    return (
                      <td
                        key={col.name}
                        className={`p-0! ${stale ? "opacity-50" : ""}`}
                        data-stale={stale ? "true" : undefined}
                        {...interaction.cellProps({
                          row: rowIndex,
                          column: columnIndex + 1,
                        })}
                      >
                        <TypedFullCell
                          shape={shape}
                           value={formulaMap[String(rowIndex)]?.[col.name] && localEvaluatedRows[rowIndex]?.[col.name]?.ok
                             ? localEvaluatedRows[rowIndex][col.name].value
                             : backendOnlyColumns.includes(col) && !refreshed
                               ? undefined
                               : values[col.name]}
                           formula={formulaMap[String(rowIndex)]?.[col.name]}
                           formulaError={localEvaluatedRows[rowIndex]?.[col.name]?.ok
                             ? undefined
                             : localEvaluatedRows[rowIndex]?.[col.name]?.error.code}
                           onCommit={(value) =>
                             handleCellCommit(row.displayId, col.name, value)
                           }
                           onFormulaCommit={(expression) =>
                             handleFormulaCommit(row.displayId, col.name, expression)
                           }
                           formulaEnabled={col.type !== "formula" && shape !== "entity-picker"}
                          position={{ row: rowIndex, column: columnIndex + 1 }}
                          interaction={interaction}
                          readOnly={readOnly || col.type === "formula"}
                          options={
                            shape === "dropdown"
                              ? dropdownOptionsMap.get(col.name)
                              : previewMode && shape === "entity-picker"
                                ? MOCK_REFERENCE_OPTIONS
                                : undefined
                          }
                          referenceSchemaId={col.referenceSchemaId}
                           workspaceId={workspaceId ?? "lims"}
                          placeholder={
                            backendOnlyColumns.includes(col) && !refreshed
                              ? "Refresh to calculate"
                              : shape === "entity-picker" ? "@mention…" : undefined
                          }
                          data-testid={`cell-${row.displayId}-${col.name}`}
                        />
                      </td>
                    );
                  })}

                  {/* Three-dot action menu — sticky to right edge, always visible on row hover.
                       No border or background so it blends seamlessly. Hidden in read-only mode. */}
                  {!readOnly && (
                     <StickyActionCell className="align-middle">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreActions
                           items={[
                             {
                               key: "refresh",
                               icon: RefreshCw,
                               label: "Refresh",
                               disabled: refreshingRow === row.displayId,
                               onClick: () => refreshRow(row),
                               tooltip: `Refresh computed fields for ${row.displayId}`,
                             },
                             {
                              key: "delete",
                              icon: Trash2,
                              label: "Delete",
                              onClick: () => handleDeleteRow(row.displayId),
                              destructive: true,
                              tooltip: `Delete row ${row.displayId}`,
                            },
                           ].filter(
                             (item) => item.key !== "refresh" || backendOnlyColumns.length > 0,
                           )}
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
        </div>
      </TableScroll>

      </TableStretch>
    </TableChrome>
  );
}

interface FormulaEvaluateResponse {
  result: {
    ok: boolean;
    value?: unknown;
    error?: { code: string };
  };
}

function usesBackendOnlyFunction(expression: string): boolean {
  const registry = ModRegistry.getInstance();
  const clientIds = new Set(
    registry.getClientFormulaFunctions().map((entry) => entry.id),
  );
  return [...expression.matchAll(/\b([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)].some(
    ([, name]) => {
      if (!name) return false;
      const catalogId = registry.getFormulaFunctions().has(name)
        ? name
        : name.toUpperCase();
      return registry.getFormulaFunctions().has(catalogId) &&
        !clientIds.has(catalogId);
    },
  );
}

function referencedValuesAreComplete(
  expression: string,
  values: Record<string, unknown>,
  formulaNames: ReadonlySet<string>,
  requireFormulaValues = false,
): boolean {
  return [...expression.matchAll(/\[([^\]]+)\]/g)].every(([, name]) => {
    if (name && formulaNames.has(name)) {
      if (!requireFormulaValues) return true;
      const value = values[name];
      return value !== undefined && value !== null && value !== "";
    }
    const value = name ? values[name] : undefined;
    return value !== undefined && value !== null && value !== "";
  });
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
      workspaceId: context.workspaceId,
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
