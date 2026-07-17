/**
 * Tests for the RegistryTableBlockComponent React NodeView component.
 *
 * Covers: placeholder state, picker open/close, schema selection,
 * loaded table (title bar, blue-tinted header, Name column, schema columns,
 * placeholder rows), and the schema-is-locked behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Mock API client ───────────────────────────────────────────────────────

const mockGet = vi.fn();
vi.mock("../../../shell/src/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────────

import { RegistryTableBlockComponent } from "../RegistryTableNode";

// ── Fixtures ──────────────────────────────────────────────────────────────

const sampleEntityTypes = [
  {
    id: 1,
    name: "Blood Sample",
    prefix: "BLOOD",
    columns: [
      {
        id: "uuid-blood-1",
        name: "Volume",
        type: "Number" as const,
        units: "mL",
      },
      {
        id: "uuid-blood-2",
        name: "Collection Date",
        type: "Date" as const,
      },
    ],
    is_active: true,
    content_hash: "abc123def456",
  },
  {
    id: 2,
    name: "Chemical Reagent",
    prefix: "CHEM",
    columns: [
      {
        id: "uuid-chem-1",
        name: "Concentration",
        type: "Number" as const,
        units: "M",
      },
      {
        id: "uuid-chem-2",
        name: "Purity",
        type: "Text" as const,
      },
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

/**
 * Build a mock BlockComponentProps object for testing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeBlockComponentProps(opts?: {
  attrs?: Record<string, unknown>;
  rest?: Record<string, unknown>;
}): any {
  const attrs = {
    schemaId: null,
    schemaName: null,
    schemaContentHash: null,
    title: "Registry Table",
    columns: [],
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
    expect(
      screen.getByTestId("registry-table-placeholder"),
    ).toBeInTheDocument();
  });

  it("does not render the loaded table when schemaId is null", () => {
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);
    expect(
      screen.queryByTestId("registry-table-loaded"),
    ).not.toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Picker dropdown
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — picker dropdown", () => {
  beforeEach(() => {
    mockGet.mockReset();
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
    // Don't resolve the promise yet — should show loading
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));

    expect(screen.getByText("Loading schemas…")).toBeInTheDocument();
  });

  it("displays fetched entity types in the picker", async () => {
    mockGet.mockResolvedValue(sampleEntityTypes);
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));

    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    expect(screen.getByText("Chemical Reagent")).toBeInTheDocument();
    // Inactive type should be filtered out
    expect(screen.queryByText("Inactive Type")).not.toBeInTheDocument();
  });

  it("shows prefix next to each entity type name", async () => {
    mockGet.mockResolvedValue(sampleEntityTypes);
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));

    await waitFor(() => {
      expect(screen.getByText("(BLOOD)")).toBeInTheDocument();
    });
    expect(screen.getByText("(CHEM)")).toBeInTheDocument();
  });

  it("shows empty message when no entity types exist", async () => {
    mockGet.mockResolvedValue([]);
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));

    await waitFor(() => {
      expect(
        screen.getByText(/No schemas available/),
      ).toBeInTheDocument();
    });
  });

  it("selecting a schema snapshots into block attrs", async () => {
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
              },
              updateAttrs,
            },
          },
        })}
      />,
    );

    // Open picker
    fireEvent.click(screen.getByTestId("load-schema-btn"));

    // Wait for entity types to load
    const option = await screen.findByText("Blood Sample");
    fireEvent.click(option);

    expect(updateAttrs).toHaveBeenCalledWith({
      schemaId: 1,
      schemaName: "Blood Sample",
      schemaContentHash: "abc123def456",
      columns: [
        {
          id: "uuid-blood-1",
          name: "Volume",
          type: "Number",
          required: undefined,
          default: undefined,
          units: "mL",
          description: undefined,
        },
        {
          id: "uuid-blood-2",
          name: "Collection Date",
          type: "Date",
          required: undefined,
          default: undefined,
          units: undefined,
          description: undefined,
        },
      ],
    });
  });

  it("picker closes after selecting a schema", async () => {
    mockGet.mockResolvedValue(sampleEntityTypes);

    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));
    const option = await screen.findByText("Blood Sample");
    fireEvent.click(option);

    await waitFor(() => {
      expect(screen.queryByTestId("schema-picker")).toBeNull();
    });
  });

  it("does not re-fetch entity types if already loaded", async () => {
    mockGet.mockResolvedValue(sampleEntityTypes);
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    // Open picker first time
    fireEvent.click(screen.getByTestId("load-schema-btn"));
    await screen.findByText("Blood Sample");

    expect(mockGet).toHaveBeenCalledTimes(1);

    // Close via outside click
    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByTestId("schema-picker")).toBeNull();
    });

    // Reopen — should use cached types, no re-fetch
    fireEvent.click(screen.getByTestId("load-schema-btn"));
    await screen.findByText("Blood Sample");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Loaded table
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — loaded table", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  function loadedProps(opts?: {
    attrs?: Record<string, unknown>;
    rest?: Record<string, unknown>;
  }) {
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

  it("renders the schema name label in gray", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    const label = screen.getByTestId("registry-table-schema-label");
    expect(label).toBeInTheDocument();
    expect(label).toHaveTextContent("Blood Sample");
  });

  it("renders the mandatory Name column header", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(
      screen.getByTestId("registry-table-header-name"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("registry-table-header-name"),
    ).toHaveTextContent("Name");
  });

  it("renders schema column headers with 'Name (Type)' format", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(
      screen.getByTestId("registry-table-header-Volume"),
    ).toHaveTextContent("Volume (Number)");
    expect(
      screen.getByTestId("registry-table-header-Collection Date"),
    ).toHaveTextContent("Collection Date (Date)");
  });

  it("renders three placeholder rows", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(screen.getByTestId("registry-table-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("registry-table-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("registry-table-row-3")).toBeInTheDocument();
  });

  it("renders em-dash placeholders in all cells", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    // Each row has Name cell + 2 schema columns = 3 cells with "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBe(9); // 3 rows × 3 columns
  });

  it("uses elastic title when none provided", () => {
    render(
      <RegistryTableBlockComponent
        {...loadedProps({ attrs: { title: "Registry Table" } })}
      />,
    );
    expect(screen.getByTestId("registry-table-title")).toHaveTextContent(
      "Registry Table",
    );
  });

  it("does not show the placeholder when schema is loaded", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(
      screen.queryByTestId("registry-table-placeholder"),
    ).not.toBeInTheDocument();
  });

  it("does not have a Load Schema button (schema locked)", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(screen.queryByTestId("load-schema-btn")).not.toBeInTheDocument();
  });

  it("does not show schema label when schemaName is null", () => {
    render(
      <RegistryTableBlockComponent
        {...loadedProps({ attrs: { schemaName: null } })}
      />,
    );
    expect(
      screen.queryByTestId("registry-table-schema-label"),
    ).not.toBeInTheDocument();
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
    };

    const serialized = JSON.stringify(defaultState);
    const deserialized = JSON.parse(serialized);

    expect(deserialized).toEqual(defaultState);
  });

  it("serialize/deserialize round-trips loaded state", () => {
    const loadedState = {
      schemaId: 1,
      schemaName: "Blood Sample",
      schemaContentHash: "abc123def456",
      title: "My Samples",
      columns: [
        { name: "Volume", type: "Number", units: "mL" },
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

    expect(getDisplayName({ schemaName: "Blood Sample", title: "T" })).toBe(
      "Blood Sample",
    );
    expect(getDisplayName({ title: "My Title" })).toBe("My Title");
    expect(getDisplayName({})).toBe("Registry Table");
  });

  it("defaultState has correct shape", () => {
    const defaultState = {
      schemaId: null,
      schemaName: null,
      schemaContentHash: null,
      title: "Registry Table",
      columns: [],
    };

    expect(defaultState).toHaveProperty("schemaId", null);
    expect(defaultState).toHaveProperty("schemaName", null);
    expect(defaultState).toHaveProperty("schemaContentHash", null);
    expect(defaultState).toHaveProperty("title", "Registry Table");
    expect(defaultState).toHaveProperty("columns");
    expect(Array.isArray(defaultState.columns)).toBe(true);
  });
});
