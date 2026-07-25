/**
 * Tests for FilterBar — operator-aware entity hub filter bar.
 *
 * Covers:
 * - serializeFilter / deserializeFilter (new and legacy formats)
 * - FilterBar rendering (column → operator → value flow)
 * - Add / remove filter rows
 * - Active filter badge count
 * - ModRegistry integration for operator resolution
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { BackendColumnType } from "../../../shell/src/mod-system/ModRegistry";
import { FilterBar, serializeFilter, deserializeFilter } from "../hub/FilterBar";
import type { FilterRow, FilterBarProps } from "../hub/FilterBar";
import type { AvailableColumn } from "../types";

// ── Reset ModRegistry singleton before each test ──────────────────────────

function resetRegistry(): ModRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
  return ModRegistry.getInstance();
}

// ── Mock column types (from the backend column type registry) ─────────────

const MOCK_COLUMN_TYPES: BackendColumnType[] = [
  {
    id: "text",
    displayName: "Text",
    icon: "Type",
    operandShape: "text",
    defaultValue: "",
    operators: [
      { id: "eq", label: "equals", operandShape: "text", djangoLookupName: "exact" },
      { id: "neq", label: "not equals", operandShape: "text", djangoLookupName: "exact" },
      { id: "contains", label: "contains", operandShape: "text", djangoLookupName: "icontains" },
      { id: "starts_with", label: "starts with", operandShape: "text", djangoLookupName: "istartswith" },
      { id: "ends_with", label: "ends with", operandShape: "text", djangoLookupName: "iendswith" },
      { id: "is_empty", label: "is empty", operandShape: "none", djangoLookupName: "isnull" },
    ],
  },
  {
    id: "number",
    displayName: "Number",
    icon: "Hash",
    operandShape: "number",
    defaultValue: 0,
    operators: [
      { id: "eq", label: "equals", operandShape: "number", djangoLookupName: "exact" },
      { id: "neq", label: "not equals", operandShape: "number", djangoLookupName: "exact" },
      { id: "gt", label: "greater than", operandShape: "number", djangoLookupName: "gt" },
      { id: "gte", label: "greater or equal", operandShape: "number", djangoLookupName: "gte" },
      { id: "lt", label: "less than", operandShape: "number", djangoLookupName: "lt" },
      { id: "lte", label: "less or equal", operandShape: "number", djangoLookupName: "lte" },
      { id: "between", label: "between", operandShape: "range", djangoLookupName: "range" },
    ],
  },
  {
    id: "date",
    displayName: "Date",
    icon: "Calendar",
    operandShape: "date",
    defaultValue: null,
    operators: [
      { id: "eq", label: "equals", operandShape: "date", djangoLookupName: "exact" },
      { id: "neq", label: "not equals", operandShape: "date", djangoLookupName: "exact" },
      { id: "gt", label: "after", operandShape: "date", djangoLookupName: "gt" },
      { id: "lt", label: "before", operandShape: "date", djangoLookupName: "lt" },
      { id: "between", label: "between", operandShape: "range", djangoLookupName: "range" },
    ],
  },
  {
    id: "boolean",
    displayName: "Boolean",
    icon: "CheckSquare",
    operandShape: "boolean",
    defaultValue: false,
    operators: [
      { id: "eq", label: "equals", operandShape: "boolean", djangoLookupName: "exact" },
      { id: "neq", label: "not equals", operandShape: "boolean", djangoLookupName: "exact" },
    ],
  },
  {
    id: "select",
    displayName: "Select",
    icon: "List",
    operandShape: "select",
    defaultValue: "",
    operators: [
      { id: "eq", label: "equals", operandShape: "text", djangoLookupName: "exact" },
      { id: "neq", label: "not equals", operandShape: "text", djangoLookupName: "exact" },
      { id: "in", label: "is any of", operandShape: "select", djangoLookupName: "in" },
      { id: "is_empty", label: "is empty", operandShape: "none", djangoLookupName: "isnull" },
    ],
  },
  {
    id: "user",
    displayName: "User",
    icon: "User",
    operandShape: "entity-picker",
    defaultValue: null,
    operators: [
      { id: "eq", label: "equals", operandShape: "entity-picker", djangoLookupName: "exact" },
      { id: "neq", label: "not equals", operandShape: "entity-picker", djangoLookupName: "exact" },
      { id: "is_in_group", label: "is in group", operandShape: "select", djangoLookupName: "in" },
    ],
  },
];

// ── Available columns fixture ─────────────────────────────────────────────

const MOCK_COLUMNS: AvailableColumn[] = [
  { key: "name", label: "Name", source: "common", type: "text", filterable: true, width: null },
  { key: "status", label: "Status", source: "common", type: "select", filterable: true, width: null },
  { key: "created_at", label: "Created", source: "common", type: "date", filterable: true, width: null },
  { key: "author", label: "Author", source: "common", type: "user", filterable: true, width: null },
  { key: "display_id", label: "ID", source: "common", type: "text", filterable: false, width: null },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function setupFilterBar(overrides: Partial<FilterBarProps> = {}) {
  const props: FilterBarProps = {
    availableColumns: MOCK_COLUMNS,
    filters: [],
    onFiltersChange: vi.fn(),
    ...overrides,
  };
  return {
    props,
    ...render(<FilterBar {...props} />),
  };
}

/** Open the filter popover. */
function openPopover() {
  const btn = screen.getByText("Filters");
  fireEvent.click(btn);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  const registry = resetRegistry();
  // Hydrate column types into the registry
  for (const ct of MOCK_COLUMN_TYPES) {
    // Use registerMod to satisfy validation, then manually set column types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (registry as any).columnTypes.set(ct.id, ct);
  }
});

// ── serializeFilter / deserializeFilter ────────────────────────────────────

describe("serializeFilter", () => {
  it("serializes a filter row to column:operator:value", () => {
    const row: FilterRow = { id: 1, column: "name", operator: "contains", value: "PCR" };
    expect(serializeFilter(row)).toBe("name:contains:PCR");
  });

  it("serializes empty value as third segment", () => {
    const row: FilterRow = { id: 1, column: "status", operator: "eq", value: "" };
    expect(serializeFilter(row)).toBe("status:eq:");
  });
});

describe("deserializeFilter", () => {
  it("parses new format column:operator:value", () => {
    const row = deserializeFilter("name:contains:PCR", 42);
    expect(row).toEqual({ id: 42, column: "name", operator: "contains", value: "PCR" });
  });

  it("parses legacy key:value as eq operator", () => {
    const row = deserializeFilter("concentration:100", 1);
    expect(row).toEqual({ id: 1, column: "concentration", operator: "eq", value: "100" });
  });

  it("handles colons in value (e.g. ISO datetime)", () => {
    const row = deserializeFilter("created_at:gte:2025-03-15T10:30:00Z", 1);
    expect(row.column).toBe("created_at");
    expect(row.operator).toBe("gte");
    expect(row.value).toBe("2025-03-15T10:30:00Z");
  });
});

// ── FilterBar rendering ────────────────────────────────────────────────────

describe("FilterBar — rendering", () => {
  it("renders the Filters button", () => {
    setupFilterBar();
    expect(screen.getByText("Filters")).toBeInTheDocument();
  });

  it("shows active filter count badge", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "PCR" },
    ];
    setupFilterBar({ filters });
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("hides badge when no active filters", () => {
    setupFilterBar({ filters: [] });
    const btn = screen.getByText("Filters");
    // Badge should not be in the document
    expect(btn.querySelector(".entities-filter-fields-count")).toBeNull();
  });

  it("opens popover on Filters button click", () => {
    setupFilterBar();
    openPopover();
    expect(screen.getByText("Field Filters")).toBeInTheDocument();
    expect(screen.getByText("Add Filter")).toBeInTheDocument();
  });

  it("shows empty state when no filterable columns", () => {
    setupFilterBar({ availableColumns: [] });
    openPopover();
    expect(screen.getByText(/No filterable fields available/)).toBeInTheDocument();
  });

  it("does not show empty state when filterable columns exist", () => {
    setupFilterBar();
    openPopover();
    expect(screen.queryByText(/No filterable fields available/)).toBeNull();
  });
});

// ── FilterRowEditor — column → operator → value flow ──────────────────────

describe("FilterBar — column → operator → value flow", () => {
  it("renders column select, operator select, and value input per row", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "", operator: "", value: "" },
    ];
    setupFilterBar({ filters });
    openPopover();

    const selects = screen.getAllByRole("combobox");
    // One column select + one operator select per row
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it("shows operators for the selected column's type", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "", value: "" },
    ];
    setupFilterBar({ filters });
    openPopover();

    // Operator dropdown should show text-type operators
    const operatorSelects = screen.getAllByRole("combobox");
    const operatorSelect = operatorSelects[1]; // second select is operator
    // Should contain text operators
    expect(operatorSelect.textContent).toContain("equals");
    expect(operatorSelect.textContent).toContain("contains");
  });

  it("calls onFiltersChange when Add Filter is clicked", () => {
    const onFiltersChange = vi.fn();
    setupFilterBar({ filters: [], onFiltersChange });
    openPopover();

    fireEvent.click(screen.getByText("Add Filter"));
    expect(onFiltersChange).toHaveBeenCalled();
    // Should be called with the previous filters + one new row
    const callArg = onFiltersChange.mock.calls[0][0] as FilterRow[];
    expect(callArg.length).toBe(1);
    expect(callArg[0].column).toBe("");
    expect(callArg[0].operator).toBe("");
  });

  it("calls onFiltersChange when a filter row is removed", () => {
    const onFiltersChange = vi.fn();
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "PCR" },
    ];
    setupFilterBar({ filters, onFiltersChange });
    openPopover();

    // Click the remove (X) button
    const removeBtn = screen.getByTitle("Remove filter");
    fireEvent.click(removeBtn);
    expect(onFiltersChange).toHaveBeenCalledWith([]);
  });

  it("shows correct value input when operator with range shape is selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "created_at", operator: "between", value: "" },
    ];
    setupFilterBar({ filters });
    openPopover();

    // Should show range inputs (Min / Max)
    expect(screen.getByPlaceholderText("Min")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Max")).toBeInTheDocument();
  });

  it("shows 'no value needed' when operator with none shape is selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "is_empty", value: "" },
    ];
    setupFilterBar({ filters });
    openPopover();

    expect(screen.getByText("(no value needed)")).toBeInTheDocument();
  });

  it("shows multiple filter rows", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "PCR" },
      { id: 2, column: "status", operator: "eq", value: "finished" },
    ];
    setupFilterBar({ filters });
    openPopover();

    // Should show two remove buttons (one per row)
    const removeBtns = screen.getAllByTitle("Remove filter");
    expect(removeBtns.length).toBe(2);
  });

  it("disables operator select and value input when no column selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "", operator: "", value: "" },
    ];
    setupFilterBar({ filters });
    openPopover();

    const selects = screen.getAllByRole("combobox");
    // The second select is the operator — it should be disabled
    const operatorSelect = selects[1] as HTMLSelectElement;
    expect(operatorSelect.disabled).toBe(true);
  });

  it("excludes non-filterable columns from the column selector", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "", operator: "", value: "" },
    ];
    setupFilterBar({ filters });
    openPopover();

    // display_id has filterable: false — should NOT appear
    const columnSelect = screen.getAllByRole("combobox")[0];
    expect(columnSelect.textContent).not.toContain("ID");
  });
});

// ── onFiltersChange ────────────────────────────────────────────────────────

describe("FilterBar — onFiltersChange", () => {
  it("calls onFiltersChange when column is selected", () => {
    const onFiltersChange = vi.fn();
    const filters: FilterRow[] = [
      { id: 1, column: "", operator: "", value: "" },
    ];
    setupFilterBar({ filters, onFiltersChange });
    openPopover();

    const columnSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(columnSelect, { target: { value: "name" } });
    expect(onFiltersChange).toHaveBeenCalled();
  });
});

// ── Legacy format in deserializeFilter ─────────────────────────────────────

describe("deserializeFilter — backward compatibility", () => {
  it("parses legacy concentration:100 format", () => {
    const row = deserializeFilter("concentration:100", 1);
    expect(row).toEqual({
      id: 1,
      column: "concentration",
      operator: "eq",
      value: "100",
    });
  });

  it("parses legacy status:finished format", () => {
    const row = deserializeFilter("status:finished", 2);
    expect(row).toEqual({
      id: 2,
      column: "status",
      operator: "eq",
      value: "finished",
    });
  });
});
