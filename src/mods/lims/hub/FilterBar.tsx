/**
 * Operator-aware filter bar for the Entity Hub.
 *
 * Replaces the old "Fields" popover (exact-match key:value filters) with
 * dynamic filter rows that resolve a column's type through the
 * ``ModRegistry`` to populate an operator dropdown, then render the correct
 * value input based on the operator's ``operandShape``.
 */

import { useState, useCallback, useMemo } from "react";
import { Filter, Plus, X } from "lucide-react";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { BackendOperator } from "../../../shell/src/mod-system/ModRegistry";
import type { AvailableColumn } from "../types";
import { ValueInput } from "./ValueInput";

// ── Filter row state ────────────────────────────────────────────────────────

/** A single filter row in the filter bar. */
export interface FilterRow {
  /** Unique id for React key. */
  id: number;
  /** Selected column key. */
  column: string;
  /** Selected operator id. */
  operator: string;
  /** Filter value. */
  value: string;
}

/** Serialized filter string for URL params: ``column:operator:value``. */
export function serializeFilter(row: FilterRow): string {
  return `${row.column}:${row.operator}:${row.value}`;
}

/** Parse a URL ``?f=column:operator:value`` string into a FilterRow. */
export function deserializeFilter(raw: string, id: number): FilterRow {
  const parts = raw.split(":");
  if (parts.length >= 3) {
    return { id, column: parts[0], operator: parts[1], value: parts.slice(2).join(":") };
  }
  // Legacy format "key:value" — treat as equals
  return { id, column: parts[0] ?? "", operator: "eq", value: parts[1] ?? "" };
}

// ── Props ───────────────────────────────────────────────────────────────────

export interface FilterBarProps {
  /** Available columns for the column selector dropdown. */
  availableColumns: AvailableColumn[];
  /** Currently active filter rows. */
  filters: FilterRow[];
  /** Called when filters change (add, remove, update). */
  onFiltersChange: (filters: FilterRow[]) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function FilterBar({
  availableColumns,
  filters,
  onFiltersChange,
}: FilterBarProps) {
  const [open, setOpen] = useState(false);
  const [nextId, setNextId] = useState(() => Date.now());

  // Filter available columns to those that are filterable
  const filterableColumns = useMemo(
    () => availableColumns.filter((c) => c.filterable),
    [availableColumns],
  );

  // ── Build a map of column key → type ID for operator resolution ───────
  const columnTypeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const col of availableColumns) {
      map.set(col.key, col.type);
    }
    return map;
  }, [availableColumns]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleAddFilter = useCallback(() => {
    const newFilter: FilterRow = {
      id: nextId,
      column: "",
      operator: "",
      value: "",
    };
    setNextId((n) => n + 1);
    onFiltersChange([...filters, newFilter]);
  }, [filters, nextId, onFiltersChange]);

  const handleRemoveFilter = useCallback(
    (id: number) => {
      onFiltersChange(filters.filter((f) => f.id !== id));
    },
    [filters, onFiltersChange],
  );

  const handleUpdateFilter = useCallback(
    (id: number, updates: Partial<FilterRow>) => {
      onFiltersChange(
        filters.map((f) =>
          f.id === id ? { ...f, ...updates } : f,
        ),
      );
    },
    [filters, onFiltersChange],
  );

  // ── Active filter count for the badge ─────────────────────────────────
  const activeCount = filters.filter((f) => f.column && f.operator).length;

  return (
    <div className="entities-filter-fields-wrap">
      <button
        className="entities-filter-fields-btn"
        type="button"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Filter size={14} />
        Filters
        {activeCount > 0 && (
          <span className="entities-filter-fields-count">{activeCount}</span>
        )}
      </button>

      {open && (
        <div
          className="entities-filter-fields-popover"
          style={{ minWidth: 380 }}
        >
          <div className="entities-filter-fields-popover-header">
            Field Filters
          </div>
          <div className="entities-filter-fields-popover-body">
            {/* Active filter rows */}
            {filters.map((row) => (
              <FilterRowEditor
                key={row.id}
                row={row}
                columns={filterableColumns}
                columnTypeMap={columnTypeMap}
                onUpdate={(updates) => handleUpdateFilter(row.id, updates)}
                onRemove={() => handleRemoveFilter(row.id)}
              />
            ))}

            {/* Add filter button */}
            {filterableColumns.length > 0 && (
              <button
                className="entities-filter-fields-add-btn"
                type="button"
                onClick={handleAddFilter}
                title="Add filter"
                style={{ marginTop: filters.length > 0 ? 8 : 0 }}
              >
                <Plus size={14} />
                Add Filter
              </button>
            )}

            {filterableColumns.length === 0 && (
              <div className="entities-filter-fields-popover-empty">
                No filterable fields available. Select a schema to see its
                fields.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filter Row Editor ───────────────────────────────────────────────────────

interface FilterRowEditorProps {
  row: FilterRow;
  columns: AvailableColumn[];
  columnTypeMap: Map<string, string>;
  onUpdate: (updates: Partial<FilterRow>) => void;
  onRemove: () => void;
}

function FilterRowEditor({
  row,
  columns,
  columnTypeMap,
  onUpdate,
  onRemove,
}: FilterRowEditorProps) {
  // ── Resolve available operators for the selected column ──────────────
  const operators = useMemo<BackendOperator[]>(() => {
    if (!row.column) return [];
    const typeId = columnTypeMap.get(row.column);
    if (!typeId) return [];
    try {
      const ct = ModRegistry.getInstance().getColumnType(typeId);
      return ct?.operators ?? [];
    } catch {
      return [];
    }
  }, [row.column, columnTypeMap]);

  // ── Resolve the selected operator's operandShape ─────────────────────
  const selectedOperator = useMemo<BackendOperator | undefined>(() => {
    if (!row.operator) return undefined;
    return operators.find((op) => op.id === row.operator);
  }, [row.operator, operators]);

  // ── When column changes, reset operator ──────────────────────────────
  const handleColumnChange = useCallback(
    (column: string) => {
      onUpdate({ column, operator: "", value: "" });
    },
    [onUpdate],
  );

  const handleOperatorChange = useCallback(
    (operator: string) => {
      onUpdate({ operator, value: "" });
    },
    [onUpdate],
  );

  const handleValueChange = useCallback(
    (value: string) => {
      onUpdate({ value });
    },
    [onUpdate],
  );

  return (
    <div className="entities-filter-row">
      {/* Column selector */}
      <select
        className="entities-filter-select"
        value={row.column}
        onChange={(e) => handleColumnChange(e.target.value)}
        style={{ flex: 1 }}
      >
        <option value="">Select field…</option>
        {columns.map((col) => (
          <option key={col.key} value={col.key}>
            {col.label}
          </option>
        ))}
      </select>

      {/* Operator selector */}
      <select
        className="entities-filter-select"
        value={row.operator}
        onChange={(e) => handleOperatorChange(e.target.value)}
        disabled={!row.column}
        style={{ flex: 1 }}
      >
        <option value="">Operator…</option>
        {operators.map((op) => (
          <option key={op.id} value={op.id}>
            {op.label}
          </option>
        ))}
      </select>

      {/* Value input — dispatched by operand_shape */}
      <ValueInput
        operandShape={selectedOperator?.operandShape ?? "text"}
        value={row.value}
        onChange={handleValueChange}
        disabled={!row.operator}
        placeholder="Value…"
      />

      {/* Remove button */}
      <button
        className="entities-filter-row-remove"
        type="button"
        onClick={onRemove}
        title="Remove filter"
      >
        <X size={14} />
      </button>
    </div>
  );
}
