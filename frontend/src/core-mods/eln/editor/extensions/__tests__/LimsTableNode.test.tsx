/**
 * Tests for the LimsTableNode React NodeView component and its
 * pure utility functions.
 *
 * Covers: headerWithSymbol, emptyValues, columnDefFor, and component
 * rendering (title, schema badge, gear menu, title editing, schema
 * selection, column addition).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import {
  headerWithSymbol,
  columnDefFor,
  emptyValues,
} from "../LimsTableNode";
import type { GridColumn, GridRow } from "../../../../lims/types";

// ── Mock AG Grid ──────────────────────────────────────────────────────────

vi.mock("ag-grid-react", () => ({
  AgGridReact: React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      api: {
        getSelectedNodes: () => [],
        startEditingCell: vi.fn(),
      },
    }));
    return <div data-testid="ag-grid" />;
  }),
}));

vi.mock("ag-grid-community", () => ({
  ModuleRegistry: {},
}));

// ── Mock API client ───────────────────────────────────────────────────────

const mockGet = vi.fn();
vi.mock("../../../../../core/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
}));

// ── Mock cell renderers ───────────────────────────────────────────────────

vi.mock("../ReferenceBadgeCellRenderer", () => ({
  DisplayIdCellRenderer: (props: any) => (
    <span data-testid="display-id-cell">{props.value}</span>
  ),
  ReferenceCellRenderer: (props: any) => (
    <span data-testid="ref-cell">{props.value}</span>
  ),
}));

// ── Import LimsTableNode AFTER mocks ──────────────────────────────────────

import LimsTableNode from "../LimsTableNode";

// ── Fixtures ──────────────────────────────────────────────────────────────

const sampleColumns: GridColumn[] = [
  { name: "Notes", type: "Text" },
  { name: "Volume", type: "Number", units: "mL" },
  { name: "Collected", type: "Date" },
  { name: "Validated", type: "Boolean" },
  { name: "Source", type: "Reference" },
];

const sampleRows: GridRow[] = [
  {
    entityId: 1,
    displayId: "E1",
    values: {
      Notes: "Hello",
      Volume: 100,
      Collected: "2025-01-15",
      Validated: true,
      Source: "E0",
    },
  },
  {
    entityId: null,
    displayId: "#new-1",
    values: {
      Notes: "",
      Volume: 0,
      Collected: "",
      Validated: false,
      Source: "",
    },
  },
];

function makeNodeViewProps(overrides: Record<string, any> = {}): any {
  const defaults = {
    node: {
      attrs: {
        schemaId: 1,
        schemaName: "Samples",
        title: "Test Table",
        columns: sampleColumns,
        rows: sampleRows,
      },
    },
    updateAttributes: vi.fn(),
    selected: false,
    extension: {},
    getPos: () => 0,
    editor: { isEditable: true },
    deleteNode: vi.fn(),
  };
  // Deep merge for node.attrs
  if (overrides.node?.attrs) {
    defaults.node.attrs = { ...defaults.node.attrs, ...overrides.node.attrs };
    delete overrides.node;
  }
  return { ...defaults, ...overrides };
}

// ══════════════════════════════════════════════════════════════════════════
// Pure function tests
// ══════════════════════════════════════════════════════════════════════════

describe("headerWithSymbol", () => {
  it("Text → 'Aa Name'", () => {
    expect(headerWithSymbol({ name: "Notes", type: "Text" }))
      .toBe("Aa Notes");
  });

  it("Number → '# Value'", () => {
    expect(headerWithSymbol({ name: "Volume", type: "Number" }))
      .toBe("# Volume");
  });

  it("Date → '📅 Date'", () => {
    expect(headerWithSymbol({ name: "Collected", type: "Date" }))
      .toBe("📅 Collected");
  });

  it("Boolean → '☑ Flag'", () => {
    expect(headerWithSymbol({ name: "Validated", type: "Boolean" }))
      .toBe("☑ Validated");
  });

  it("Reference → '→ Ref'", () => {
    expect(headerWithSymbol({ name: "Source", type: "Reference" }))
      .toBe("→ Source");
  });

  it("unknown type → 'Aa Name' (fallback)", () => {
    expect(headerWithSymbol({ name: "Custom", type: "Unknown" as any }))
      .toBe("Aa Custom");
  });
});

describe("emptyValues", () => {
  it("returns empty object for empty columns", () => {
    expect(emptyValues([])).toEqual({});
  });

  it("returns 0 for Number columns", () => {
    const vals = emptyValues([{ name: "Count", type: "Number" }]);
    expect(vals.Count).toBe(0);
  });

  it("returns false for Boolean columns", () => {
    const vals = emptyValues([{ name: "Done", type: "Boolean" }]);
    expect(vals.Done).toBe(false);
  });

  it("returns empty string for Text columns", () => {
    const vals = emptyValues([{ name: "Notes", type: "Text" }]);
    expect(vals.Notes).toBe("");
  });

  it("returns empty string for Date columns", () => {
    const vals = emptyValues([{ name: "When", type: "Date" }]);
    expect(vals.When).toBe("");
  });

  it("returns empty string for Reference columns", () => {
    const vals = emptyValues([{ name: "Ref", type: "Reference" }]);
    expect(vals.Ref).toBe("");
  });

  it("returns correct defaults for mixed columns", () => {
    const vals = emptyValues(sampleColumns);
    expect(vals.Notes).toBe("");
    expect(vals.Volume).toBe(0);
    expect(vals.Collected).toBe("");
    expect(vals.Validated).toBe(false);
    expect(vals.Source).toBe("");
  });
});

describe("columnDefFor", () => {
  it("Text column has expected properties", () => {
    const col = { name: "Notes", type: "Text" as const };
    const def = columnDefFor(col, 0);
    expect(def.field).toBe("values.Notes");
    expect(def.headerName).toBe("Aa Notes");
    expect(def.sortable).toBe(true);
    expect(def.resizable).toBe(true);
    expect(def.editable).toBe(true);
  });

  it("Number column includes valueFormatter with units", () => {
    const col = { name: "Vol", type: "Number" as const, units: "mL" };
    const def = columnDefFor(col, 0);
    expect(def.type).toBe("numericColumn");
    // valueFormatter with value
    const fmt = def.valueFormatter as any;
    expect(fmt({ value: 42 })).toBe("42 mL");
    expect(fmt({ value: null })).toBe("");
    expect(fmt({ value: "" })).toBe("");
  });

  it("Number column without units formats plain number", () => {
    const col = { name: "Count", type: "Number" as const };
    const def = columnDefFor(col, 0);
    const fmt = def.valueFormatter as any;
    expect(fmt({ value: 5 })).toBe("5");
  });

  it("Date column includes valueFormatter", () => {
    const col = { name: "When", type: "Date" as const };
    const def = columnDefFor(col, 0);
    const fmt = def.valueFormatter as any;
    expect(fmt({ value: "" })).toBe("");
    // Valid date string should format to locale date
    const formatted = fmt({ value: "2025-03-15" });
    expect(formatted).toBeTruthy();
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("Boolean column uses checkbox editor and renderer", () => {
    const col = { name: "Done", type: "Boolean" as const };
    const def = columnDefFor(col, 0);
    expect(def.cellEditor).toBe("agCheckboxCellEditor");
    expect(def.cellRenderer).toBe("agCheckboxCellRenderer");
  });

  it("Reference column uses ReferenceCellRenderer", () => {
    const col = { name: "Source", type: "Reference" as const };
    const def = columnDefFor(col, 0);
    expect(def.cellRenderer).toBeTruthy();
    expect(def.cellEditor).toBe("agTextCellEditor");
  });

  it("falls back to textColumn for unrecognized type", () => {
    const col = { name: "Custom", type: "Unknown" as any };
    const def = columnDefFor(col, 0);
    expect(def.type).toBe("textColumn");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Component rendering tests
// ══════════════════════════════════════════════════════════════════════════

describe("LimsTableNode component", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  // ── Basic rendering ──────────────────────────────────────────────────

  it("renders the table title", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    expect(screen.getByText("Test Table")).toBeInTheDocument();
  });

  it("renders the schema badge when schemaId is set", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    expect(screen.getByText("Samples")).toBeInTheDocument();
  });

  it("renders the table icon (⊞)", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    expect(screen.getByText("⊞")).toBeInTheDocument();
  });

  it("renders the gear button", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    expect(
      screen.getByRole("button", { name: "Table settings" }),
    ).toBeInTheDocument();
  });

  it("renders the Add Row button (+)", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    expect(
      screen.getByRole("button", { name: "Add row" }),
    ).toBeInTheDocument();
  });

  it("renders the AG Grid", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    expect(screen.getByTestId("ag-grid")).toBeInTheDocument();
  });

  // ── Schema badge ─────────────────────────────────────────────────────

  it("shows schema badge with name when schemaId and schemaName are set", () => {
    render(
      <LimsTableNode
        {...makeNodeViewProps({
          node: {
            attrs: { schemaId: 42, schemaName: "Blood Samples" },
          },
        })}
      />,
    );
    expect(screen.getByText("Blood Samples")).toBeInTheDocument();
  });

  it("shows fallback schema label when schemaId is set but no schemaName", () => {
    // The component fetches schema name via API when schemaId is set but
    // schemaName is null — mock the API to return a resolved promise.
    mockGet.mockResolvedValue({ id: 42, name: "Blood Samples" });
    render(
      <LimsTableNode
        {...makeNodeViewProps({
          node: {
            attrs: { schemaId: 42, schemaName: null },
          },
        })}
      />,
    );
    // Initially shows fallback "Schema #42" before the fetch resolves
    expect(screen.getByText("Schema #42")).toBeInTheDocument();
  });

  it("does not show schema badge when schemaId is null", () => {
    render(
      <LimsTableNode
        {...makeNodeViewProps({
          node: {
            attrs: { schemaId: null, schemaName: null },
          },
        })}
      />,
    );
    expect(screen.queryByText("Schema #")).toBeNull();
    expect(screen.queryByText("Samples")).toBeNull();
  });

  // ── Gear menu toggle ─────────────────────────────────────────────────

  it("shows gear menu on gear button click", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    const gearBtn = screen.getByRole("button", { name: "Table settings" });
    fireEvent.click(gearBtn);
    expect(screen.getByText("+ Add Row")).toBeInTheDocument();
    expect(screen.getByText("− Delete Row")).toBeInTheDocument();
    expect(screen.getByText("Add Column…")).toBeInTheDocument();
    expect(screen.getByText("Load Schema…")).toBeInTheDocument();
  });

  it("hides gear menu on second gear button click", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    const gearBtn = screen.getByRole("button", { name: "Table settings" });
    fireEvent.click(gearBtn); // open
    expect(screen.getByText("+ Add Row")).toBeInTheDocument();
    fireEvent.click(gearBtn); // close
    expect(screen.queryByText("+ Add Row")).toBeNull();
  });

  it("Add Row from gear menu closes menu and calls updateAttributes", () => {
    const updateAttributes = vi.fn();
    render(
      <LimsTableNode
        {...makeNodeViewProps({ updateAttributes })}
      />,
    );
    // Open gear menu
    fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
    // Click "Add Row"
    fireEvent.click(screen.getByText("+ Add Row"));
    expect(updateAttributes).toHaveBeenCalled();
    // Menu should be closed
    expect(screen.queryByText("+ Add Row")).toBeNull();
  });

  // ── Add Column panel ─────────────────────────────────────────────────

  it("opens Add Column panel from gear menu", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
    fireEvent.click(screen.getByText("Add Column…"));
    expect(screen.getByPlaceholderText("Column name")).toBeInTheDocument();
  });

  it("Add Column back button returns to main menu", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
    fireEvent.click(screen.getByText("Add Column…"));
    fireEvent.click(screen.getByTitle("Back"));
    // Back at main menu
    expect(screen.getByText("+ Add Row")).toBeInTheDocument();
  });

  // ── Title editing ────────────────────────────────────────────────────

  it("title is editable via contentEditable", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    const title = screen.getByText("Test Table");
    // The title is in a contentEditable span; verify via attribute
    expect(title.getAttribute("contenteditable")).toBe("true");
  });

  it("title blur updates attributes", () => {
    const updateAttributes = vi.fn();
    render(
      <LimsTableNode
        {...makeNodeViewProps({ updateAttributes })}
      />,
    );
    const titleSpan = screen.getByText("Test Table");
    // Set textContent on the contentEditable span
    titleSpan.textContent = "New Title";
    fireEvent.blur(titleSpan);
    expect(updateAttributes).toHaveBeenCalledWith({ title: "New Title" });
  });

  it("title Enter key blurs the element", () => {
    render(<LimsTableNode {...makeNodeViewProps()} />);
    const titleSpan = screen.getByText("Test Table");
    fireEvent.focus(titleSpan);
    fireEvent.keyDown(titleSpan, { key: "Enter" });
    // The element should lose focus after Enter
    expect(document.activeElement).not.toBe(titleSpan);
  });

  // ── Load Schema ─────────────────────────────────────────────────────

  it("selecting a schema calls updateAttributes with schema data", async () => {
    const updateAttributes = vi.fn();
    mockGet.mockResolvedValue([
      {
        id: 42,
        name: "Blood Samples",
        prefix: "BS",
        is_active: true,
        columns: [
          { name: "Volume", type: "Number", required: false },
          { name: "Notes", type: "Text", required: false },
        ],
      },
    ]);

    render(
      <LimsTableNode {...makeNodeViewProps({ updateAttributes })} />,
    );

    // Open gear menu
    fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
    // Open Load Schema panel
    fireEvent.click(screen.getByText("Load Schema…"));

    // Wait for schema list to load
    const schemaBtn = await screen.findByText("Blood Samples");
    fireEvent.click(schemaBtn);

    // updateAttributes is deferred via queueMicrotask — wait for it
    await waitFor(() => {
      expect(updateAttributes).toHaveBeenCalledTimes(1);
    });
    expect(updateAttributes).toHaveBeenCalledWith({
      schemaId: 42,
      schemaName: "Blood Samples",
      columns: [
        { name: "Volume", type: "Number", required: false },
        { name: "Notes", type: "Text", required: false },
      ],
      rows: expect.any(Array),
    });

    // Rows should be remapped to the new schema columns
    const [[callArgs]] = updateAttributes.mock.calls;
    expect(callArgs.rows).toHaveLength(2);
    // "Volume" was in the original columns and its value 100 is preserved;
    // "Notes" was also in the original columns and "Hello" is preserved.
    expect(callArgs.rows[0].values).toEqual({
      Volume: 100,
      Notes: "Hello",
    });
  });

  it("selecting a schema closes the schema panel", async () => {
    // Use a schema name that does NOT match the existing badge ("Samples")
    mockGet.mockResolvedValue([
      {
        id: 1,
        name: "Blood Work",
        prefix: "BW",
        is_active: true,
        columns: [],
      },
    ]);

    render(<LimsTableNode {...makeNodeViewProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
    fireEvent.click(screen.getByText("Load Schema…"));
    const schemaBtn = await screen.findByText("Blood Work");
    fireEvent.click(schemaBtn);

    // Panel should close after selection — wait for the state update
    await waitFor(() => {
      expect(screen.queryByText("Load Schema")).toBeNull();
    });
  });

  // ── Add Column ──────────────────────────────────────────────────────

  it("adding a column calls updateAttributes with new column and updated rows", async () => {
    const updateAttributes = vi.fn();
    render(
      <LimsTableNode {...makeNodeViewProps({ updateAttributes })} />,
    );

    // Open gear menu → Add Column panel
    fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
    fireEvent.click(screen.getByText("Add Column…"));

    // Fill in column name — fireEvent.change triggers React's onChange
    const nameInput = screen.getByPlaceholderText("Column name");
    fireEvent.change(nameInput, { target: { value: "Temperature" } });

    // Click Add — should now be enabled
    fireEvent.click(screen.getByText("Add"));

    // updateAttributes is deferred via queueMicrotask — wait for it
    await waitFor(() => {
      expect(updateAttributes).toHaveBeenCalledTimes(1);
    });
    const [[callArgs]] = updateAttributes.mock.calls;
    expect(callArgs.columns).toHaveLength(6); // 5 existing + 1 new
    expect(callArgs.columns[5]).toMatchObject({
      name: "Temperature",
      type: "Text",
      isCustom: true,
    });
    // Rows should include the new column with default value
    expect(callArgs.rows[0].values).toHaveProperty("Temperature", "");
  });
});
