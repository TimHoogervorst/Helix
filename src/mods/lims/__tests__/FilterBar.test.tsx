/**
 * Tests for FilterBar — operator-aware entity hub filter pills.
 *
 * Covers:
 * - serializeFilter / deserializeFilter (new and legacy formats)
 * - FilterBar rendering (inline pills with field/operator/value zones)
 * - Add / remove filter pills
 * - Field name popover (column selector)
 * - Operator popover (operator selector per column type)
 * - Inline value input (dispatched by operandShape)
 * - ModRegistry integration for operator resolution
 * - "Clear all" link when filters are active
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

/** Click the field name trigger on a pill to open the column popover. */
function openFieldPopover() {
  const fieldBtn = screen.getByTitle("Choose field");
  fireEvent.click(fieldBtn);
}

/** Click the operator trigger on a pill to open the operator popover. */
function openOperatorPopover() {
  const operatorBtn = screen.getByTitle("Choose operator");
  fireEvent.click(operatorBtn);
}

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  const registry = resetRegistry();
  // Hydrate column types into the registry
  for (const ct of MOCK_COLUMN_TYPES) {
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
  it("renders the '+ Add Filter' button", () => {
    setupFilterBar();
    expect(screen.getByText("Add Filter")).toBeInTheDocument();
  });

  it("shows filter pills when filters exist", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "PCR" },
    ];
    setupFilterBar({ filters });
    // The pill should display the field label ("Name") and operator label ("contains")
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("contains")).toBeInTheDocument();
  });

  it("shows 'Field' placeholder when no column selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "", operator: "", value: "" },
    ];
    setupFilterBar({ filters });
    expect(screen.getByText("Field")).toBeInTheDocument();
  });

  it("shows 'Clear all' link when filters are active", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "PCR" },
    ];
    setupFilterBar({ filters });
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });

  it("does NOT show 'Clear all' when no active filters", () => {
    setupFilterBar({ filters: [] });
    expect(screen.queryByText("Clear all")).toBeNull();
  });

  it("hides '+ Add Filter' when no filterable columns exist", () => {
    setupFilterBar({ availableColumns: [] });
    expect(screen.queryByText("Add Filter")).toBeNull();
  });

  it("renders remove button for each pill", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "PCR" },
    ];
    setupFilterBar({ filters });
    expect(screen.getByTitle("Remove filter")).toBeInTheDocument();
  });
});

// ── Add / remove filter pills ──────────────────────────────────────────────

describe("FilterBar — add / remove pills", () => {
  it("calls onFiltersChange when '+ Add Filter' is clicked", () => {
    const onFiltersChange = vi.fn();
    setupFilterBar({ filters: [], onFiltersChange });

    fireEvent.click(screen.getByText("Add Filter"));
    expect(onFiltersChange).toHaveBeenCalled();
    const callArg = onFiltersChange.mock.calls[0][0] as FilterRow[];
    expect(callArg.length).toBe(1);
    expect(callArg[0].column).toBe("");
    expect(callArg[0].operator).toBe("");
  });

  it("calls onFiltersChange when a filter pill is removed", () => {
    const onFiltersChange = vi.fn();
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "PCR" },
    ];
    setupFilterBar({ filters, onFiltersChange });

    const removeBtn = screen.getByTitle("Remove filter");
    fireEvent.click(removeBtn);
    expect(onFiltersChange).toHaveBeenCalledWith([]);
  });

  it("shows multiple filter pills", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "PCR" },
      { id: 2, column: "status", operator: "eq", value: "finished" },
    ];
    setupFilterBar({ filters });

    // Two remove buttons (one per pill)
    const removeBtns = screen.getAllByTitle("Remove filter");
    expect(removeBtns.length).toBe(2);
  });

  it("clears all filters when 'Clear all' is clicked", () => {
    const onFiltersChange = vi.fn();
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "PCR" },
    ];
    setupFilterBar({ filters, onFiltersChange });

    fireEvent.click(screen.getByText("Clear all"));
    expect(onFiltersChange).toHaveBeenCalledWith([]);
  });
});

// ── Field name popover ─────────────────────────────────────────────────────

describe("FilterBar — field name popover", () => {
  it("opens column popover when field name is clicked", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "", operator: "", value: "" },
    ];
    setupFilterBar({ filters });
    openFieldPopover();

    // Should show filterable column labels in the popover
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Author")).toBeInTheDocument();
  });

  it("excludes non-filterable columns from field popover", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "", operator: "", value: "" },
    ];
    setupFilterBar({ filters });
    openFieldPopover();

    // display_id has filterable: false — should NOT appear
    expect(screen.queryByText("ID")).toBeNull();
  });

  it("calls onFiltersChange when a field is selected from popover", () => {
    const onFiltersChange = vi.fn();
    const filters: FilterRow[] = [
      { id: 1, column: "", operator: "", value: "" },
    ];
    setupFilterBar({ filters, onFiltersChange });
    openFieldPopover();

    // Click the "Name" option in the popover
    fireEvent.click(screen.getByText("Name"));
    expect(onFiltersChange).toHaveBeenCalled();
  });
});

// ── Operator popover ───────────────────────────────────────────────────────

describe("FilterBar — operator popover", () => {
  it("operator trigger is disabled when no column selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "", operator: "", value: "" },
    ];
    setupFilterBar({ filters });

    const operatorBtn = screen.getByTitle("Choose operator");
    expect((operatorBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("operator trigger is enabled when column is selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "", value: "" },
    ];
    setupFilterBar({ filters });

    const operatorBtn = screen.getByTitle("Choose operator");
    expect((operatorBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("opens operator popover with text-type operators when Name column selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "", value: "" },
    ];
    setupFilterBar({ filters });
    openOperatorPopover();

    // Text operators should be shown
    expect(screen.getByText("equals")).toBeInTheDocument();
    expect(screen.getByText("contains")).toBeInTheDocument();
    expect(screen.getByText("starts with")).toBeInTheDocument();
    expect(screen.getByText("is empty")).toBeInTheDocument();
  });

  it("calls onFiltersChange when an operator is selected", () => {
    const onFiltersChange = vi.fn();
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "", value: "" },
    ];
    setupFilterBar({ filters, onFiltersChange });
    openOperatorPopover();

    fireEvent.click(screen.getByText("contains"));
    expect(onFiltersChange).toHaveBeenCalled();
  });
});

// ── Inline value input ────────────────────────────────────────────────────

describe("FilterBar — inline value input", () => {
  it("shows text input when text-type operator is selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "" },
    ];
    setupFilterBar({ filters });

    const input = screen.getByPlaceholderText("value…");
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).type).toBe("text");
  });

  it("shows number input when number operator is selected", () => {
    const numberColumns: AvailableColumn[] = [
      { key: "concentration", label: "Concentration", source: "schema", type: "number", filterable: true, width: null },
    ];
    const numberFilters: FilterRow[] = [
      { id: 1, column: "concentration", operator: "gt", value: "" },
    ];
    setupFilterBar({ availableColumns: numberColumns, filters: numberFilters });

    const input = screen.getByPlaceholderText("value…");
    expect((input as HTMLInputElement).type).toBe("number");
  });

  it("shows range inputs (min/max) when between operator is selected", () => {
    const numberColumns: AvailableColumn[] = [
      { key: "concentration", label: "Concentration", source: "schema", type: "number", filterable: true, width: null },
    ];
    const numberFilters: FilterRow[] = [
      { id: 1, column: "concentration", operator: "between", value: "" },
    ];
    setupFilterBar({ availableColumns: numberColumns, filters: numberFilters });

    expect(screen.getByPlaceholderText("Min")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Max")).toBeInTheDocument();
  });

  it("shows (no value needed) when is_empty operator is selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "is_empty", value: "" },
    ];
    setupFilterBar({ filters });

    expect(screen.getByText("(no value needed)")).toBeInTheDocument();
  });

  it("shows no colon separator when is_empty operator is selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "is_empty", value: "" },
    ];
    setupFilterBar({ filters });

    // The colon separator should not appear for "none" operands
    const pill = document.querySelector(".entities-filter-pill");
    expect(pill?.querySelector(".entities-filter-pill-colon")).toBeNull();
  });

  it("value input is disabled when no operator selected", () => {
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "", value: "" },
    ];
    setupFilterBar({ filters });

    const input = screen.getByPlaceholderText("select field first");
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it("calls onFiltersChange when value changes", () => {
    const onFiltersChange = vi.fn();
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "contains", value: "" },
    ];
    setupFilterBar({ filters, onFiltersChange });

    const input = screen.getByPlaceholderText("value…");
    fireEvent.change(input, { target: { value: "PCR" } });
    expect(onFiltersChange).toHaveBeenCalled();
  });
});

// ── onFiltersChange ────────────────────────────────────────────────────────

describe("FilterBar — onFiltersChange", () => {
  it("calls onFiltersChange when column is selected via popover", () => {
    const onFiltersChange = vi.fn();
    const filters: FilterRow[] = [
      { id: 1, column: "", operator: "", value: "" },
    ];
    setupFilterBar({ filters, onFiltersChange });
    openFieldPopover();

    fireEvent.click(screen.getByText("Name"));
    expect(onFiltersChange).toHaveBeenCalled();
  });

  it("calls onFiltersChange when operator is selected via popover", () => {
    const onFiltersChange = vi.fn();
    const filters: FilterRow[] = [
      { id: 1, column: "name", operator: "", value: "" },
    ];
    setupFilterBar({ filters, onFiltersChange });
    openOperatorPopover();

    fireEvent.click(screen.getByText("contains"));
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
