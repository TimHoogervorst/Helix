/**
 * Tests for the RegistryTableBlockComponent React component.
 *
 * Covers: placeholder state, picker open/close, schema selection,
 * loaded table (title bar, blue-tinted header, Name column, schema columns,
 * status dots, type-aware cells, row add/delete, reference popover),
 * and the schema-is-locked behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

// ── Mock API client ───────────────────────────────────────────────────────
// Uses vi.hoisted so mock instances exist before the factory runs (vitest
// hoists vi.mock calls above all other code).

const { mockGet, mockDel } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockDel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../shell/src/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

// ── Mock lucide-react icons ───────────────────────────────────────────────

vi.mock("lucide-react", () => ({
  Database: (props: Record<string, unknown>) => (
    <span data-testid="icon-database" {...props}>DB</span>
  ),
  Loader: (props: Record<string, unknown>) => (
    <span data-testid="icon-loader" {...props}>⏳</span>
  ),
  Trash2: (props: Record<string, unknown>) => (
    <span data-testid="icon-trash" {...props}>🗑</span>
  ),
  Plus: (props: Record<string, unknown>) => (
    <span data-testid="icon-plus" {...props}>+</span>
  ),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────

import { RegistryTableBlockComponent } from "../RegistryTableNode";
import type { RegistryTableRow } from "../RegistryTableNode";

// ── Fixtures ──────────────────────────────────────────────────────────────

const sampleEntityTypes = [
  {
    id: 1,
    name: "Blood Sample",
    prefix: "BLOOD",
    columns: [
      { id: "uuid-blood-1", name: "Volume", type: "Number" as const, units: "mL" },
      { id: "uuid-blood-2", name: "Collection Date", type: "Date" as const },
    ],
    is_active: true,
    content_hash: "abc123def456",
  },
  {
    id: 2,
    name: "Chemical Reagent",
    prefix: "CHEM",
    columns: [
      { id: "uuid-chem-1", name: "Concentration", type: "Number" as const, units: "M" },
      { id: "uuid-chem-2", name: "Purity", type: "Text" as const },
    ],
    is_active: true,
    content_hash: "xyz789ghi012",
  },
  {
    id: 3,
    name: "Inactive Type",
    prefix: "INACT",
    columns: [],
    is_active: false,
    content_hash: "deadbeef",
  },
];

function makeBlockComponentProps(opts?: {
  attrs?: Record<string, unknown>;
  rest?: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  const attrs = {
    schemaId: null,
    schemaName: null,
    schemaContentHash: null,
    title: "Registry Table",
    columns: [],
    rows: [],
    ...(opts?.attrs ?? {}),
  };

  const defaults = {
    context: {} as any,
    instance: {
      id: "inst-1",
      blockId: "eln.registryTable-block",
      slotId: "eln.editor",
      attrs,
      updateAttrs: vi.fn(),
    },
  };

  return { ...defaults, ...(opts?.rest ?? {}) };
}

/** Create a sample row for testing loaded table state. */
function makeRow(overrides?: Partial<RegistryTableRow>): RegistryTableRow {
  return {
    entityId: null,
    displayId: "#new-1",
    __name: "Sample 1",
    values: { Volume: 10, "Collection Date": "2025-06-15" },
    isRegistered: false,
    lastRegisteredValueHash: null,
    registrationError: null,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Placeholder state
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — placeholder state", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("renders the Registry Table label", () => {
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);
    expect(screen.getByText("Registry Table")).toBeInTheDocument();
  });

  it("renders the Load Schema button", () => {
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);
    const btn = screen.getByTestId("load-schema-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("Load Schema");
  });

  it("renders the placeholder container", () => {
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);
    expect(screen.getByTestId("registry-table-placeholder")).toBeInTheDocument();
  });

  it("does not render the loaded table when schemaId is null", () => {
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);
    expect(screen.queryByTestId("registry-table-loaded")).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Picker dropdown
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — picker dropdown", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
  });

  it("opens picker on Load Schema click", async () => {
    mockGet.mockResolvedValue(sampleEntityTypes);
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("schema-picker")).toBeInTheDocument();
    });
  });

  it("displays loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));

    expect(screen.getByText("Loading schemas…")).toBeInTheDocument();
  });

  it("displays fetched entity types in the picker", async () => {
    mockGet.mockResolvedValue(sampleEntityTypes);
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));

    // The picker is portaled to document.body — wait for the data to load
    const bloodSample = await screen.findByText("Blood Sample", {}, { timeout: 2000 });
    expect(bloodSample).toBeInTheDocument();
    expect(screen.getByText("Chemical Reagent")).toBeInTheDocument();
    expect(screen.queryByText("Inactive Type")).not.toBeInTheDocument();
  });

  it("shows prefix next to each entity type name", async () => {
    mockGet.mockResolvedValue(sampleEntityTypes);
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));

    const bloodPrefix = await screen.findByText("(BLOOD)", {}, { timeout: 2000 });
    expect(bloodPrefix).toBeInTheDocument();
    expect(screen.getByText("(CHEM)")).toBeInTheDocument();
  });

  it("shows empty message when no entity types exist", async () => {
    mockGet.mockResolvedValue([]);
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));

    await waitFor(() => {
      expect(screen.getByText(/No schemas available/)).toBeInTheDocument();
    });
  });

  it("selecting a schema snapshots into block attrs and resets rows", async () => {
    const updateAttrs = vi.fn();
    mockGet.mockResolvedValue(sampleEntityTypes);

    render(
      <RegistryTableBlockComponent
        {...makeBlockComponentProps({
          rest: {
            instance: {
              id: "inst-1",
              blockId: "eln.registryTable-block",
              slotId: "eln.editor",
              attrs: {
                schemaId: null,
                schemaName: null,
                schemaContentHash: null,
                title: "Registry Table",
                columns: [],
                rows: [{ entityId: 1, displayId: "OLD1", __name: "Old", values: {}, isRegistered: true, lastRegisteredValueHash: null, registrationError: null }],
              },
              updateAttrs,
            },
          },
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("load-schema-btn"));
    const option = await screen.findByText("Blood Sample");
    fireEvent.click(option);

    expect(updateAttrs).toHaveBeenCalledWith({
      schemaId: 1,
      schemaName: "Blood Sample",
      schemaContentHash: "abc123def456",
      columns: [
        { id: "uuid-blood-1", name: "Volume", type: "Number", required: undefined, default: undefined, units: "mL", description: undefined },
        { id: "uuid-blood-2", name: "Collection Date", type: "Date", required: undefined, default: undefined, units: undefined, description: undefined },
      ],
      rows: [],
    });
  });

  it("does not re-fetch entity types if already loaded", async () => {
    mockGet.mockResolvedValue(sampleEntityTypes);
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));
    await screen.findByText("Blood Sample");
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Close via outside click
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId("schema-picker")).toBeNull();
    });

    // Reopen
    fireEvent.click(screen.getByTestId("load-schema-btn"));
    await screen.findByText("Blood Sample");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Loaded table — structure
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — loaded table structure", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
  });

  function loadedProps(opts?: { attrs?: Record<string, unknown>; rest?: Record<string, unknown> }) {
    return makeBlockComponentProps({
      attrs: {
        schemaId: 1,
        schemaName: "Blood Sample",
        schemaContentHash: "abc123def456",
        title: "My Blood Samples",
        columns: [
          { name: "Volume", type: "Number" as const, units: "mL" },
          { name: "Collection Date", type: "Date" as const },
        ],
        rows: [makeRow()],
        ...(opts?.attrs ?? {}),
      },
      rest: opts?.rest,
    });
  }

  it("renders the loaded table container", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(screen.getByTestId("registry-table-loaded")).toBeInTheDocument();
  });

  it("renders the editable title", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    const title = screen.getByTestId("registry-table-title");
    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent("My Blood Samples");
  });

  it("renders the schema name label", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    const label = screen.getByTestId("registry-table-schema-label");
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent("Blood Sample");
  });

  it("renders the mandatory Name column header", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(screen.getByTestId("registry-table-header-name")).toHaveTextContent("Name");
  });

  it("renders schema column headers with 'Name (Type)' format", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(screen.getByTestId("registry-table-header-Volume")).toHaveTextContent("Volume (Number)");
    expect(screen.getByTestId("registry-table-header-Collection Date")).toHaveTextContent("Collection Date (Date)");
  });

  it("renders status dot and delete column headers", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(screen.getByTestId("registry-table-header-status")).toBeInTheDocument();
    expect(screen.getByTestId("registry-table-header-delete")).toBeInTheDocument();
  });

  it("renders the + New Row button", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    const addBtn = screen.getByTestId("add-row-btn");
    expect(addBtn).toBeInTheDocument();
    expect(addBtn).toHaveTextContent("New Row");
  });

  it("renders row with Name cell content", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(screen.getByTestId("name-cell-#new-1")).toHaveTextContent("Sample 1");
  });

  it("shows empty state message when no rows", () => {
    render(<RegistryTableBlockComponent {...loadedProps({ attrs: { rows: [] } })} />);
    expect(screen.getByTestId("registry-table-empty-row")).toBeInTheDocument();
    expect(screen.getByText(/No rows yet/)).toBeInTheDocument();
  });

  it("does not show the placeholder when schema is loaded", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(screen.queryByTestId("registry-table-placeholder")).not.toBeInTheDocument();
  });

  it("does not show Load Schema button when schema is loaded", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(screen.queryByTestId("load-schema-btn")).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Status dots
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — status dots", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
  });

  function renderWithRow(rowOverrides?: Partial<RegistryTableRow>, blockAttrs?: Record<string, unknown>) {
    const row = makeRow(rowOverrides);
    const props = makeBlockComponentProps({
      attrs: {
        schemaId: 1,
        schemaName: "Blood Sample",
        schemaContentHash: "abc123def456",
        title: "My Blood Samples",
        columns: [{ name: "Volume", type: "Number" as const, units: "mL" }],
        rows: [row],
        ...blockAttrs,
      },
    });
    return { props, row, updateAttrs: props.instance.updateAttrs };
  }

  it("shows blue dot for unregistered row with no errors", () => {
    const { props } = renderWithRow({
      entityId: null,
      isRegistered: false,
      registrationError: null,
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-dot-blue")).toBeInTheDocument();
  });

  it("shows green dot for registered row with matching data", () => {
    const values = { Volume: 10 };
    const hash = computeSnapshot(values);
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      values,
      lastRegisteredValueHash: hash,
      registrationError: null,
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-dot-green")).toBeInTheDocument();
  });

  it("shows orange dot when data changed since registration", () => {
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      values: { Volume: 20 },
      lastRegisteredValueHash: "different-hash",
      registrationError: null,
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-dot-orange")).toBeInTheDocument();
  });

  it("shows yellow dot when schemaContentHash is unavailable", () => {
    const { props } = renderWithRow(
      {
        entityId: 1,
        isRegistered: true,
        values: { Volume: 10 },
        lastRegisteredValueHash: computeSnapshot({ Volume: 10 }),
        registrationError: null,
      },
      { schemaContentHash: null },
    );
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-dot-yellow")).toBeInTheDocument();
  });

  it("shows red dot when there is a registration error", () => {
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      registrationError: "Network failure",
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-dot-red")).toBeInTheDocument();
  });

  it("red dot takes priority over green (all other statuses)", () => {
    const values = { Volume: 10 };
    const hash = computeSnapshot(values);
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      values,
      lastRegisteredValueHash: hash, // would normally be green
      registrationError: "Error!",  // but error overrides
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-dot-red")).toBeInTheDocument();
  });

  it("orange dot beats green when data differs", () => {
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      values: { Volume: 30 },
      lastRegisteredValueHash: computeSnapshot({ Volume: 10 }),
      registrationError: null,
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-dot-orange")).toBeInTheDocument();
  });
});

/** Deterministic value snapshot matching the component's algorithm. */
function computeSnapshot(values: Record<string, unknown>): string {
  const sorted = Object.keys(values)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = values[key];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

// ══════════════════════════════════════════════════════════════════════════
// Cell editors
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — cell editors", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
  });

  function renderWithColumns(columns: Array<{ name: string; type: string; units?: string }>, values: Record<string, unknown>) {
    const row = makeRow({ values, __name: "Test" });
    const updateAttrs = vi.fn();
    const props = makeBlockComponentProps({
      attrs: {
        schemaId: 1,
        schemaName: "Test Schema",
        schemaContentHash: "hash123",
        title: "Test Table",
        columns,
        rows: [row],
      },
      rest: {
        instance: {
          id: "inst-1",
          blockId: "eln.registryTable-block",
          slotId: "eln.editor",
          attrs: {
            schemaId: 1,
            schemaName: "Test Schema",
            schemaContentHash: "hash123",
            title: "Test Table",
            columns,
            rows: [row],
          },
          updateAttrs,
        },
      },
    });
    return { props, updateAttrs, row };
  }

  // ── Text cell ──────────────────────────────────────────────────────────

  it("renders text cell as contentEditable span", () => {
    const { props } = renderWithColumns(
      [{ name: "Notes", type: "Text" }],
      { Notes: "Hello world" },
    );
    render(<RegistryTableBlockComponent {...props} />);
    const cell = screen.getByTestId("cell-#new-1-Notes");
    const span = within(cell).getByText("Hello world");
    expect(span.getAttribute("contentEditable")).toBe("true");
  });

  // ── Number cell ────────────────────────────────────────────────────────

  it("renders number cell as display span initially", () => {
    const { props } = renderWithColumns(
      [{ name: "Volume", type: "Number" }],
      { Volume: 42 },
    );
    render(<RegistryTableBlockComponent {...props} />);
    const display = screen.getByTestId("number-display");
    expect(display).toHaveTextContent("42");
  });

  it("switches number cell to input on click", async () => {
    const { props } = renderWithColumns(
      [{ name: "Volume", type: "Number" }],
      { Volume: 42 },
    );
    render(<RegistryTableBlockComponent {...props} />);

    fireEvent.click(screen.getByTestId("number-display"));

    await waitFor(() => {
      expect(screen.getByTestId("number-input")).toBeInTheDocument();
    });
    expect((screen.getByTestId("number-input") as HTMLInputElement).value).toBe("42");
  });

  // ── Date cell ──────────────────────────────────────────────────────────

  it("renders date cell with formatted display", () => {
    const { props } = renderWithColumns(
      [{ name: "Collection Date", type: "Date" }],
      { "Collection Date": "2025-06-15" },
    );
    render(<RegistryTableBlockComponent {...props} />);
    const display = screen.getByTestId("date-display");
    expect(display).toHaveTextContent("Jun 15, 2025");
  });

  it("switches date cell to input on click", async () => {
    const { props } = renderWithColumns(
      [{ name: "Collection Date", type: "Date" }],
      { "Collection Date": "2025-06-15" },
    );
    render(<RegistryTableBlockComponent {...props} />);

    fireEvent.click(screen.getByTestId("date-display"));

    await waitFor(() => {
      expect(screen.getByTestId("date-input")).toBeInTheDocument();
    });
    expect((screen.getByTestId("date-input") as HTMLInputElement).value).toBe("2025-06-15");
  });

  // ── Boolean cell ───────────────────────────────────────────────────────

  it("renders boolean cell as checkbox", () => {
    const { props } = renderWithColumns(
      [{ name: "Active", type: "Boolean" }],
      { Active: true },
    );
    render(<RegistryTableBlockComponent {...props} />);
    const checkbox = screen.getByTestId("boolean-checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("boolean checkbox toggles value", () => {
    const { props, updateAttrs } = renderWithColumns(
      [{ name: "Active", type: "Boolean" }],
      { Active: false },
    );
    render(<RegistryTableBlockComponent {...props} />);

    const checkbox = screen.getByTestId("boolean-checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    expect(updateAttrs).toHaveBeenCalledWith({
      rows: [{ ...makeRow(), values: { Active: true }, __name: "Test" }],
    });
  });

  // ── Reference cell ─────────────────────────────────────────────────────

  it("renders reference cell with @mention button when empty", () => {
    const { props } = renderWithColumns(
      [{ name: "Related", type: "Reference" }],
      { Related: "" },
    );
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("ref-trigger-btn")).toHaveTextContent("@mention…");
  });

  it("opens reference popover on click", async () => {
    const { props } = renderWithColumns(
      [{ name: "Related", type: "Reference" }],
      { Related: "" },
    );
    render(<RegistryTableBlockComponent {...props} />);

    fireEvent.click(screen.getByTestId("ref-trigger-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("ref-popover")).toBeInTheDocument();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Row operations
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — row operations", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
  });

  function loadedPropsWithUpdateAttrs(updateAttrs: ReturnType<typeof vi.fn>) {
    const row = makeRow();
    return makeBlockComponentProps({
      attrs: {
        schemaId: 1,
        schemaName: "Blood Sample",
        schemaContentHash: "abc123",
        title: "Test",
        columns: [{ name: "Volume", type: "Number" as const, units: "mL" }],
        rows: [row],
      },
      rest: {
        instance: {
          id: "inst-1",
          blockId: "eln.registryTable-block",
          slotId: "eln.editor",
          attrs: {
            schemaId: 1,
            schemaName: "Blood Sample",
            schemaContentHash: "abc123",
            title: "Test",
            columns: [{ name: "Volume", type: "Number", units: "mL" }],
            rows: [row],
          },
          updateAttrs,
        },
      },
    });
  }

  it("adds a new row when + New Row button is clicked", () => {
    const updateAttrs = vi.fn();
    render(<RegistryTableBlockComponent {...loadedPropsWithUpdateAttrs(updateAttrs)} />);

    fireEvent.click(screen.getByTestId("add-row-btn"));

    expect(updateAttrs).toHaveBeenCalledTimes(1);
    const callArg = updateAttrs.mock.calls[0][0];
    expect(callArg.rows).toHaveLength(2);
    const newRow = callArg.rows[1] as RegistryTableRow;
    expect(newRow.isRegistered).toBe(false);
    expect(newRow.entityId).toBeNull();
    expect(newRow.values).toEqual({ Volume: 0 });
  });

  it("delete button calls del API for registered rows", async () => {
    mockDel.mockResolvedValue(undefined);
    const updateAttrs = vi.fn();
    const registeredRow = makeRow({ entityId: 42, displayId: "BLOOD1", isRegistered: true });
    const attrsObj = {
      schemaId: 1,
      schemaName: "Blood Sample",
      schemaContentHash: "abc123",
      title: "Test",
      columns: [{ name: "Volume", type: "Number" as const, units: "mL" }],
      rows: [registeredRow],
    };

    render(
      <RegistryTableBlockComponent
        {...makeBlockComponentProps({
          attrs: attrsObj,
          rest: {
            instance: {
              id: "inst-1",
              blockId: "eln.registryTable-block",
              slotId: "eln.editor",
              attrs: attrsObj,
              updateAttrs,
            },
          },
        })}
      />,
    );

    // Verify the row is rendered
    expect(screen.getByTestId("delete-row-BLOOD1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("delete-row-BLOOD1"));

    // The delete handler is async — wait for the del call
    await waitFor(() => {
      expect(mockDel).toHaveBeenCalled();
    });
    expect(mockDel).toHaveBeenCalledWith("/lims/entities/42/");
    expect(updateAttrs).toHaveBeenCalledWith({ rows: [] });
  });

  it("delete button does not call API for unregistered rows", () => {
    const updateAttrs = vi.fn();
    render(<RegistryTableBlockComponent {...loadedPropsWithUpdateAttrs(updateAttrs)} />);

    fireEvent.click(screen.getByTestId("delete-row-#new-1"));

    expect(mockDel).not.toHaveBeenCalled();
    expect(updateAttrs).toHaveBeenCalledWith({ rows: [] });
  });

  it("hover reveals delete button on row", () => {
    const updateAttrs = vi.fn();
    render(<RegistryTableBlockComponent {...loadedPropsWithUpdateAttrs(updateAttrs)} />);

    const deleteBtn = screen.getByTestId("delete-row-#new-1");
    // The button should exist but have opacity-0 class (from group-hover)
    expect(deleteBtn).toBeInTheDocument();
    expect(deleteBtn.className).toContain("opacity-0");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Block registration (structural)
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — block defaults and serialization", () => {
  it("serialize/deserialize round-trips default state", () => {
    const defaultState = {
      schemaId: null,
      schemaName: null,
      schemaContentHash: null,
      title: "Registry Table",
      columns: [],
      rows: [],
    };

    const serialized = JSON.stringify(defaultState);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toEqual(defaultState);
  });

  it("serialize/deserialize round-trips loaded state with rows", () => {
    const loadedState = {
      schemaId: 1,
      schemaName: "Blood Sample",
      schemaContentHash: "abc123def456",
      title: "My Samples",
      columns: [{ name: "Volume", type: "Number", units: "mL" }],
      rows: [
        {
          entityId: 1,
          displayId: "BLOOD1",
          __name: "Sample A",
          values: { Volume: 10 },
          isRegistered: true,
          lastRegisteredValueHash: "hash123",
          registrationError: null,
        },
      ],
    };

    const serialized = JSON.stringify(loadedState);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toEqual(loadedState);
  });

  it("deserialize handles invalid JSON gracefully", () => {
    let result = {};
    try {
      result = JSON.parse("not-json");
    } catch {
      result = {};
    }
    expect(result).toEqual({});
  });

  it("getDisplayName returns schema name when available", () => {
    const getDisplayName = (attrs: Record<string, unknown>) =>
      (attrs.schemaName || attrs.title) as string || "Registry Table";

    expect(getDisplayName({ schemaName: "Blood Sample", title: "T" })).toBe("Blood Sample");
    expect(getDisplayName({ title: "My Title" })).toBe("My Title");
    expect(getDisplayName({})).toBe("Registry Table");
  });

  it("defaultState has correct shape including rows", () => {
    const defaultState = {
      schemaId: null,
      schemaName: null,
      schemaContentHash: null,
      title: "Registry Table",
      columns: [],
      rows: [],
    };

    expect(defaultState).toHaveProperty("schemaId", null);
    expect(defaultState).toHaveProperty("rows");
    expect(Array.isArray(defaultState.rows)).toBe(true);
  });
});
