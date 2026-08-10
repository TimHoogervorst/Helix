/**
 * Operator-aware filter bar for the Entity Hub.
 *
 * Renders active field filters as interactive inline "pills" rather than
 * a button + popover.  Each pill exposes three clickable/edit-table zones:
 *
 *   [FieldName ▼] [Operator ▼] : [value input] [×]
 *
 * Clicking the field name opens a popover with all filterable columns.
 * Clicking the operator opens a popover with the operators for that column's
 * type.  The value is an inline input dispatched by ``operandShape``.
 */

import { useState, useCallback, useMemo } from "react";
import { Plus, X } from "lucide-react";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { BackendOperator } from "../../../shell/src/mod-system/ModRegistry";
import type { AvailableColumn } from "../types";
import { ValueInput } from "./ValueInput";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";

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
  /** Map from column key to dropdown option strings. Used to render a
   *  dropdown picker for "dropdown"-type filter values instead of a
   *  plain text input. */
  dropdownOptionsMap?: Map<string, string[]>;
}

// ── Component ───────────────────────────────────────────────────────────────

export function FilterBar({
  availableColumns,
  filters,
  onFiltersChange,
  dropdownOptionsMap,
}: FilterBarProps) {
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

  return (
    <div className="entities-filter-pills-bar">
      {/* Active filter pills */}
      {filters.map((row) => (
        <FilterPill
          key={row.id}
          row={row}
          columns={filterableColumns}
          columnTypeMap={columnTypeMap}
          dropdownOptionsMap={dropdownOptionsMap}
          onUpdate={(updates) => handleUpdateFilter(row.id, updates)}
          onRemove={() => handleRemoveFilter(row.id)}
        />
      ))}

      {/* + Add Filter ghost button */}
      {filterableColumns.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAddFilter}
          title="Add filter"
        >
          <Plus size={14} />
          Add Filter
        </Button>
      )}

      {/* Clear all link when filters are active */}
      {filters.filter((f) => f.column && f.operator).length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFiltersChange([])}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}

// ── Filter Pill ─────────────────────────────────────────────────────────────

interface FilterPillProps {
  row: FilterRow;
  columns: AvailableColumn[];
  columnTypeMap: Map<string, string>;
  dropdownOptionsMap?: Map<string, string[]>;
  onUpdate: (updates: Partial<FilterRow>) => void;
  onRemove: () => void;
}

function FilterPill({
  row,
  columns,
  columnTypeMap,
  dropdownOptionsMap,
  onUpdate,
  onRemove,
}: FilterPillProps) {
  // ── Popover open state ─────────────────────────────────────────────────
  const [fieldPopoverOpen, setFieldPopoverOpen] = useState(false);
  const [operatorPopoverOpen, setOperatorPopoverOpen] = useState(false);

  // ── Resolve labels ────────────────────────────────────────────────────
  const colLabel =
    columns.find((c) => c.key === row.column)?.label ?? "Field";

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

  // ── Resolve the selected operator's label and operandShape ────────────
  const selectedOperator = useMemo<BackendOperator | undefined>(() => {
    if (!row.operator) return undefined;
    return operators.find((op) => op.id === row.operator);
  }, [row.operator, operators]);

  const opLabel = selectedOperator?.label ?? "is";

  // ── When column changes, reset operator ──────────────────────────────
  const handleColumnChange = useCallback(
    (column: string) => {
      setFieldPopoverOpen(false);
      onUpdate({ column, operator: "", value: "" });
    },
    [onUpdate],
  );

  const handleOperatorChange = useCallback(
    (operator: string) => {
      setOperatorPopoverOpen(false);
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

  // ── Shared blur handler for popover wrappers ─────────────────────────
  const popoverBlur = useCallback(
    (e: React.FocusEvent, setter: (v: boolean) => void) => {
      // Close after a tick so click events on options fire first
      if (!e.currentTarget.contains(e.relatedTarget)) {
        setTimeout(() => setter(false), 150);
      }
    },
    [],
  );

  return (
    <div className="entities-filter-pill">
      {/* ── Field name — clickable popover trigger ──────────────────────── */}
      <div
        className="entities-filter-pill-field-wrap"
        onBlur={(e) => popoverBlur(e, setFieldPopoverOpen)}
      >
        <button
          className={`entities-filter-pill-field${row.column ? " is-set" : ""}`}
          type="button"
          onClick={() => setFieldPopoverOpen((prev) => !prev)}
          title="Choose field"
          aria-haspopup="listbox"
          aria-expanded={fieldPopoverOpen}
        >
          {colLabel}
        </button>
        {fieldPopoverOpen && (
          <div className="entities-filter-pill-popover" role="listbox">
            {columns.map((col) => (
              <button
                key={col.key}
                className={`entities-filter-pill-option${row.column === col.key ? " is-selected" : ""}`}
                type="button"
                role="option"
                aria-selected={row.column === col.key}
                onClick={() => handleColumnChange(col.key)}
              >
                {col.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Operator — clickable popover trigger ────────────────────────── */}
      <div
        className="entities-filter-pill-operator-wrap"
        onBlur={(e) => popoverBlur(e, setOperatorPopoverOpen)}
      >
        <button
          className={`entities-filter-pill-operator${row.operator ? " is-set" : ""}`}
          type="button"
          onClick={() => row.column && setOperatorPopoverOpen((prev) => !prev)}
          disabled={!row.column}
          title="Choose operator"
          aria-haspopup="listbox"
          aria-expanded={operatorPopoverOpen}
        >
          {opLabel}
        </button>
        {operatorPopoverOpen && (
          <div className="entities-filter-pill-popover" role="listbox">
            {operators.map((op) => (
              <button
                key={op.id}
                className={`entities-filter-pill-option${row.operator === op.id ? " is-selected" : ""}`}
                type="button"
                role="option"
                aria-selected={row.operator === op.id}
                onClick={() => handleOperatorChange(op.id)}
              >
                {op.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Colon separator (hidden for "none" operands like is_empty) ──── */}
      {selectedOperator?.operandShape !== "none" && (
        <span className="entities-filter-pill-colon">:</span>
      )}

      {/* ── Value input — inline, dispatched by operandShape ────────────── */}
      <div className="entities-filter-pill-value-wrap">
        <ValueInput
          operandShape={selectedOperator?.operandShape ?? "text"}
          value={row.value}
          onChange={handleValueChange}
          disabled={!row.operator}
          placeholder={row.operator ? "value…" : "select field first"}
          dropdownOptions={dropdownOptionsMap?.get(row.column)}
        />
      </div>

      {/* ── Remove button ──────────────────────────────────────────────── */}
      <IconButton
        className="entities-filter-pill-remove"
        aria-label="Remove filter"
        title="Remove filter"
        onClick={onRemove}
      >
        <X size={11} />
      </IconButton>
    </div>
  );
}
