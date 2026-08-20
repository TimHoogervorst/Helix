/**
 * Tests for the RegistryTableBlockComponent React component.
 *
 * Covers: placeholder state, picker open/close, schema selection,
 * loaded table (title bar, header row, Name column, schema columns,
 * status bars, type-aware cells, row add/delete, reference popover),
 * and the schema-is-locked behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
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

const { mockGet, mockDel, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockDel: vi.fn().mockResolvedValue(undefined),
  mockPost: vi.fn(),
}));

vi.mock("../../../../shell/src/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  del: (...args: unknown[]) => mockDel(...args),
  post: (...args: unknown[]) => mockPost(...args),
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
  RefreshCw: (props: Record<string, unknown>) => (
    <span data-testid="icon-refresh" {...props}>🔄</span>
  ),
  EllipsisVertical: (props: Record<string, unknown>) => (
    <span data-testid="icon-ellipsis-vertical" {...props}>⋮</span>
  ),
  Upload: (props: Record<string, unknown>) => (
    <span data-testid="icon-upload" {...props}>↑</span>
  ),
  Check: (props: Record<string, unknown>) => (
    <span data-testid="icon-check" {...props}>✓</span>
  ),
  Calendar: (props: Record<string, unknown>) => (
    <span data-testid="icon-calendar" {...props}>📅</span>
  ),
  ArrowLeftRight: (props: Record<string, unknown>) => (
    <span data-testid="icon-arrow-left-right" {...props}>↔</span>
  ),
  Circle: (props: Record<string, unknown>) => (
    <span data-testid="icon-circle" {...props}>○</span>
  ),
  // Icons used by CellEditors.tsx COLUMN_TYPE_ICON_MAP
  Type: (props: Record<string, unknown>) => (
    <span data-testid="icon-type" {...props}>Aa</span>
  ),
  Hash: (props: Record<string, unknown>) => (
    <span data-testid="icon-hash" {...props}>#</span>
  ),
  Sigma: (props: Record<string, unknown>) => (
    <span data-testid="icon-sigma" {...props}>sum</span>
  ),
  Clock: (props: Record<string, unknown>) => (
    <span data-testid="icon-clock" {...props}>🕐</span>
  ),
  ToggleLeft: (props: Record<string, unknown>) => (
    <span data-testid="icon-toggle-left" {...props}>◉</span>
  ),
  List: (props: Record<string, unknown>) => (
    <span data-testid="icon-list" {...props}>☰</span>
  ),
  Link: (props: Record<string, unknown>) => (
    <span data-testid="icon-link" {...props}>🔗</span>
  ),
  User: (props: Record<string, unknown>) => (
    <span data-testid="icon-user" {...props}>👤</span>
  ),
  FileText: (props: Record<string, unknown>) => (
    <span data-testid="icon-file-text" {...props}>📄</span>
  ),
  Dna: (props: Record<string, unknown>) => (
    <span data-testid="icon-dna" {...props}>🧬</span>
  ),
  Rat: (props: Record<string, unknown>) => (
    <span data-testid="icon-rat" {...props}>🐀</span>
  ),
  Leaf: (props: Record<string, unknown>) => (
    <span data-testid="icon-leaf" {...props}>🌿</span>
  ),
  Cog: (props: Record<string, unknown>) => (
    <span data-testid="icon-cog" {...props}>⚙</span>
  ),
  NotebookText: (props: Record<string, unknown>) => (
    <span data-testid="icon-notebook-text" {...props}>📓</span>
  ),
  Folder: (props: Record<string, unknown>) => (
    <span data-testid="icon-folder" {...props}>📁</span>
  ),
  FlaskConical: (props: Record<string, unknown>) => (
    <span data-testid="icon-flask-conical" {...props}>🧪</span>
  ),
  ScrollText: (props: Record<string, unknown>) => (
    <span data-testid="icon-scroll-text" {...props}>📜</span>
  ),
  TestTubes: (props: Record<string, unknown>) => (
    <span data-testid="icon-test-tubes" {...props}>🧪🧪</span>
  ),
  AlertTriangle: (props: Record<string, unknown>) => (
    <span data-testid="icon-alert-triangle" {...props}>⚠</span>
  ),
  Activity: (props: Record<string, unknown>) => (
    <span data-testid="icon-activity" {...props}>📊</span>
  ),
  BarChart3: (props: Record<string, unknown>) => (
    <span data-testid="icon-bar-chart-3" {...props}>📊</span>
  ),
  Beaker: (props: Record<string, unknown>) => (
    <span data-testid="icon-beaker" {...props}>🧪</span>
  ),
  CircleDollarSign: (props: Record<string, unknown>) => (
    <span data-testid="icon-circle-dollar-sign" {...props}>💲</span>
  ),
  Thermometer: (props: Record<string, unknown>) => (
    <span data-testid="icon-thermometer" {...props}>🌡</span>
  ),
  TrendingUp: (props: Record<string, unknown>) => (
    <span data-testid="icon-trending-up" {...props}>📈</span>
  ),
  CheckCircle: (props: Record<string, unknown>) => (
    <span data-testid="icon-check-circle" {...props}>✅</span>
  ),
  ChevronDown: (props: Record<string, unknown>) => (
    <span data-testid="icon-chevron-down" {...props}>▼</span>
  ),
}));

// ── Mock ModRegistry column type lookups ───────────────────────────────────
// Column types used by RegistryTableNode's EditableCell and header rendering.

const { mockGetColumnType } = vi.hoisted(() => ({
  mockGetColumnType: vi.fn(),
}));

vi.mock("../../../../shell/src/mod-system/ModRegistry", () => ({
  ModRegistry: {
    getInstance: () => ({
      getColumnType: mockGetColumnType,
      getColumnTypes: () => new Map(),
    }),
    _reset: () => {},
    resolveActionLabel: (actionType: string) => actionType,
  },
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
      { id: "uuid-blood-1", name: "Volume", type: "number" as const, units: "mL" },
      { id: "uuid-blood-2", name: "Collection Date", type: "date" as const },
    ],
    is_active: true,
    is_default: false,
    content_hash: "abc123def456",
    tags: ["RegistrationTable"],
  },
  {
    id: 2,
    name: "Chemical Reagent",
    prefix: "CHEM",
    columns: [
      { id: "uuid-chem-1", name: "Concentration", type: "number" as const, units: "M" },
      { id: "uuid-chem-2", name: "Purity", type: "text" as const },
    ],
    is_active: true,
    is_default: false,
    content_hash: "xyz789ghi012",
    tags: ["RegistrationTable"],
  },
  {
    id: 3,
    name: "Inactive Type",
    prefix: "INACT",
    columns: [],
    is_active: false,
    is_default: false,
    content_hash: "deadbeef",
    tags: ["RegistrationTable"],
  },
  {
    id: 4,
    name: "System Default",
    prefix: "E",
    columns: [],
    is_active: true,
    is_default: true,
    content_hash: "sysdefault",
    tags: ["RegistrationTable"],
  },
  {
    id: 5,
    name: "ELN Entry",
    prefix: "ELN",
    columns: [],
    is_active: true,
    is_default: false,
    content_hash: "eln-entry",
    tags: [],
  },
];

function makeBlockComponentProps(opts?: {
  attrs?: Record<string, unknown>;
  rest?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
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
      blockId: "eln.registry-table",
      slotId: "eln.editor",
      attrs,
      updateAttrs: vi.fn(),
    },
    overrides: opts?.overrides ?? {},
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
    lastRegisteredSchemaContentHash: null,
    registrationError: null,
    ...overrides,
  };
}

/** Pre-seed the ModRegistry mock with built-in column types used in tests. */
function seedColumnTypes() {
  const types: Record<string, {
    id: string;
    displayName: string;
    icon: string;
    operandShape: string;
    operators: Array<{
      id: string;
      label: string;
      operandShape: string;
      djangoLookupName: string;
    }>;
  }> = {
    text: {
      id: "text",
      displayName: "Text",
      icon: "type",
      operandShape: "text",
      defaultValue: "",
      operators: [
        { id: "contains", label: "Contains", operandShape: "text", djangoLookupName: "icontains" },
      ],
    },
    number: {
      id: "number",
      displayName: "Number",
      icon: "hash",
      operandShape: "number",
      defaultValue: 0,
      operators: [
        { id: "eq", label: "Equals", operandShape: "number", djangoLookupName: "exact" },
      ],
    },
    date: {
      id: "date",
      displayName: "Date",
      icon: "calendar",
      operandShape: "date",
      defaultValue: null,
      operators: [
        { id: "eq", label: "Equals", operandShape: "date", djangoLookupName: "exact" },
      ],
    },
    boolean: {
      id: "boolean",
      displayName: "Boolean",
      icon: "toggle-left",
      operandShape: "boolean",
      defaultValue: false,
      operators: [
        { id: "eq", label: "Equals", operandShape: "boolean", djangoLookupName: "exact" },
      ],
    },
    reference: {
      id: "reference",
      displayName: "Reference",
      icon: "link",
      operandShape: "entity-picker",
      defaultValue: "",
      operators: [
        { id: "eq", label: "Equals", operandShape: "entity-picker", djangoLookupName: "exact" },
      ],
    },
  };

  mockGetColumnType.mockImplementation(
    (typeId: string) => types[typeId],
  );
}

// Top-level beforeEach: seed column types for every test so that
// EditableCell and header rendering can look them up via the registry.
beforeEach(() => {
  seedColumnTypes();
});

// ══════════════════════════════════════════════════════════════════════════
// Placeholder state
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — placeholder state", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
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
    mockPost.mockReset();
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
    expect(screen.queryByText("System Default")).not.toBeInTheDocument();
  });

  it("only displays schemas tagged for registration tables", async () => {
    mockGet.mockResolvedValue(sampleEntityTypes);
    render(<RegistryTableBlockComponent {...makeBlockComponentProps()} />);

    fireEvent.click(screen.getByTestId("load-schema-btn"));

    await screen.findByText("Blood Sample");
    expect(screen.queryByText("ELN Entry")).not.toBeInTheDocument();
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
              blockId: "eln.registry-table",
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
        { id: "uuid-blood-1", name: "Volume", type: "number", required: undefined, default: undefined, units: "mL", description: undefined },
        { id: "uuid-blood-2", name: "Collection Date", type: "date", required: undefined, default: undefined, units: undefined, description: undefined },
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
    mockPost.mockReset();
  });

  function loadedProps(opts?: { attrs?: Record<string, unknown>; rest?: Record<string, unknown> }) {
    return makeBlockComponentProps({
      attrs: {
        schemaId: 1,
        schemaName: "Blood Sample",
        schemaContentHash: "abc123def456",
        title: "My Blood Samples",
        columns: [
          { name: "Volume", type: "number" as const, units: "mL" },
          { name: "Collection Date", type: "date" as const },
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

  it("consumes the shared Table Kit chrome and layout", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    const table = screen.getByTestId("registry-table-loaded");
    expect(table).toHaveClass("table-layout-chrome", "table-layout-chrome--compact", "w-full");
    expect(table.querySelector(".table-layout-chrome__toolbar")).toBeInTheDocument();
    expect(
      table.parentElement?.querySelector(".table-layout-chrome__add-row"),
    ).toBeInTheDocument();
    expect(table.querySelector(".table-layout-chrome__add-row")).not.toBeInTheDocument();
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

  it("renders schema column headers with compact type labels", () => {
    render(<RegistryTableBlockComponent {...loadedProps()} />);
    expect(screen.getByTestId("registry-table-header-Volume")).toHaveTextContent("Volume#");
    // Date columns show Calendar icon instead of text label
    const dateHeader = screen.getByTestId("registry-table-header-Collection Date");
    expect(dateHeader).toHaveTextContent("Collection Date");
    expect(within(dateHeader).getByTestId("icon-calendar")).toBeInTheDocument();
  });

  it("renders Boolean column header with icon from registry", () => {
    render(
      <RegistryTableBlockComponent
        {...loadedProps({
          attrs: {
            columns: [
              { name: "Volume", type: "number" as const, units: "mL" },
              { name: "Active", type: "boolean" as const },
            ],
          },
        })}
      />,
    );
    const boolHeader = screen.getByTestId("registry-table-header-Active");
    expect(boolHeader).toHaveTextContent("Active");
    // Boolean type icon is "toggle-left" — the registry-driven renderColumnTypeBadge
    // renders the ToggleLeft Lucide component.
    expect(within(boolHeader).getByTestId("icon-toggle-left")).toBeInTheDocument();
  });

  it("renders status bar and delete column headers", () => {
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
// Status bars
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — status bars", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    mockPost.mockReset();
  });

  function renderWithRow(rowOverrides?: Partial<RegistryTableRow>, blockAttrs?: Record<string, unknown>) {
    const row = makeRow(rowOverrides);
    const props = makeBlockComponentProps({
      attrs: {
        schemaId: 1,
        schemaName: "Blood Sample",
        schemaContentHash: "abc123def456",
        title: "My Blood Samples",
        columns: [{ name: "Volume", type: "number" as const, units: "mL" }],
        rows: [row],
        ...blockAttrs,
      },
    });
    return { props, row, updateAttrs: props.instance.updateAttrs };
  }

  it("shows blue bar for unregistered row with no errors", () => {
    const { props } = renderWithRow({
      entityId: null,
      isRegistered: false,
      registrationError: null,
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-bar-blue")).toBeInTheDocument();
  });

  it("shows green bar for registered row with matching data", () => {
    const values = { Volume: 10 };
    const hash = computeSnapshot(values, "Sample 1");
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      values,
      lastRegisteredValueHash: hash,
      lastRegisteredSchemaContentHash: "abc123def456",
      registrationError: null,
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-bar-green")).toBeInTheDocument();
  });

  it("shows orange bar when data changed since registration", () => {
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      values: { Volume: 20 },
      lastRegisteredValueHash: "different-hash",
      lastRegisteredSchemaContentHash: "abc123def456",
      registrationError: null,
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-bar-orange")).toBeInTheDocument();
  });

  it("shows yellow bar when schemaContentHash is unavailable", () => {
    const { props } = renderWithRow(
      {
        entityId: 1,
        isRegistered: true,
        values: { Volume: 10 },
        lastRegisteredValueHash: computeSnapshot({ Volume: 10 }, "Sample 1"),
        registrationError: null,
      },
      { schemaContentHash: null },
    );
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-bar-yellow")).toBeInTheDocument();
  });

  it("shows yellow bar when the registered schema hash is stale", () => {
    const values = { Volume: 10 };
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      values,
      lastRegisteredValueHash: computeSnapshot(values, "Sample 1"),
      lastRegisteredSchemaContentHash: "old-hash",
      registrationError: null,
    }, { schemaContentHash: "new-hash" });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-bar-yellow")).toBeInTheDocument();
  });

  it("shows red bar when there is a registration error", () => {
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      registrationError: "Network failure",
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-bar-red")).toBeInTheDocument();
  });

  it("red bar takes priority over green (all other statuses)", () => {
    const values = { Volume: 10 };
    const hash = computeSnapshot(values, "Sample 1");
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      values,
      lastRegisteredValueHash: hash, // would normally be green
      registrationError: "Error!",  // but error overrides
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-bar-red")).toBeInTheDocument();
  });

  it("orange bar beats green when data differs", () => {
    const { props } = renderWithRow({
      entityId: 1,
      isRegistered: true,
      values: { Volume: 30 },
      lastRegisteredValueHash: computeSnapshot({ Volume: 10 }, "Sample 1"),
      lastRegisteredSchemaContentHash: "abc123def456",
      registrationError: null,
    });
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("status-bar-orange")).toBeInTheDocument();
  });
});

/** Deterministic row snapshot matching the component's computeRowSnapshot algorithm. */
function computeSnapshot(values: Record<string, unknown>, name: string): string {
  const data = { ...values, __name: name };
  const sorted = Object.keys(data)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = data[key];
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
    mockPost.mockReset();
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
          blockId: "eln.registry-table",
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
      [{ name: "Notes", type: "text" }],
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
      [{ name: "Volume", type: "number" }],
      { Volume: 42 },
    );
    render(<RegistryTableBlockComponent {...props} />);
    const display = screen.getByTestId("number-display");
    expect(display).toHaveTextContent("42");
  });

  it("switches number cell to input on double-click", async () => {
    const { props } = renderWithColumns(
      [{ name: "Volume", type: "number" }],
      { Volume: 42 },
    );
    render(<RegistryTableBlockComponent {...props} />);

    fireEvent.doubleClick(screen.getByTestId("number-display"));

    await waitFor(() => {
      expect(screen.getByTestId("number-input")).toBeInTheDocument();
    });
    expect((screen.getByTestId("number-input") as HTMLInputElement).value).toBe("42");
  });

  // ── Date cell ──────────────────────────────────────────────────────────

  it("renders date cell with formatted display", () => {
    const { props } = renderWithColumns(
      [{ name: "Collection Date", type: "date" }],
      { "Collection Date": "2025-06-15" },
    );
    render(<RegistryTableBlockComponent {...props} />);
    const display = screen.getByTestId("date-display");
    expect(display).toHaveTextContent("Jun 15, 2025");
  });

  it("switches date cell to input on double-click", async () => {
    const { props } = renderWithColumns(
      [{ name: "Collection Date", type: "date" }],
      { "Collection Date": "2025-06-15" },
    );
    render(<RegistryTableBlockComponent {...props} />);

    fireEvent.doubleClick(screen.getByTestId("date-display"));

    await waitFor(() => {
      expect(screen.getByTestId("date-input")).toBeInTheDocument();
    });
    expect((screen.getByTestId("date-input") as HTMLInputElement).value).toBe("2025-06-15");
  });

  // ── Boolean cell ───────────────────────────────────────────────────────

  it("renders boolean cell as checkbox", () => {
    const { props } = renderWithColumns(
      [{ name: "Active", type: "boolean" }],
      { Active: true },
    );
    render(<RegistryTableBlockComponent {...props} />);
    const checkbox = screen.getByTestId("boolean-checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it("boolean checkbox toggles value", () => {
    const { props, updateAttrs } = renderWithColumns(
      [{ name: "Active", type: "boolean" }],
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
      [{ name: "Related", type: "reference" }],
      { Related: "" },
    );
    render(<RegistryTableBlockComponent {...props} />);
    expect(screen.getByTestId("ref-trigger-btn")).toHaveTextContent("@mention…");
  });

  it("opens reference popover on click", async () => {
    const { props } = renderWithColumns(
      [{ name: "Related", type: "reference" }],
      { Related: "" },
    );
    render(<RegistryTableBlockComponent {...props} />);

    fireEvent.doubleClick(screen.getByTestId("ref-trigger-btn"));

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
    mockPost.mockReset();
  });

  function loadedPropsWithUpdateAttrs(updateAttrs: ReturnType<typeof vi.fn>) {
    const row = makeRow();
    return makeBlockComponentProps({
      attrs: {
        schemaId: 1,
        schemaName: "Blood Sample",
        schemaContentHash: "abc123",
        title: "Test",
        columns: [{ name: "Volume", type: "number" as const, units: "mL" }],
        rows: [row],
      },
      rest: {
        instance: {
          id: "inst-1",
          blockId: "eln.registry-table",
          slotId: "eln.editor",
          attrs: {
            schemaId: 1,
            schemaName: "Blood Sample",
            schemaContentHash: "abc123",
            title: "Test",
            columns: [{ name: "Volume", type: "number", units: "mL" }],
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

  it("three-dot menu calls del API for registered rows", async () => {
    mockDel.mockResolvedValue(undefined);
    const updateAttrs = vi.fn();
    const registeredRow = makeRow({ entityId: 42, displayId: "BLOOD1", isRegistered: true });
    const attrsObj = {
      schemaId: 1,
      schemaName: "Blood Sample",
      schemaContentHash: "abc123",
      title: "Test",
      columns: [{ name: "Volume", type: "number" as const, units: "mL" }],
      rows: [registeredRow],
    };

    render(
      <RegistryTableBlockComponent
        {...makeBlockComponentProps({
          attrs: attrsObj,
          rest: {
            instance: {
              id: "inst-1",
              blockId: "eln.registry-table",
              slotId: "eln.editor",
              attrs: attrsObj,
              updateAttrs,
            },
          },
        })}
      />,
    );

    // Open the three-dot menu on the row
    const row = screen.getByTestId("registry-table-row-BLOOD1");
    const moreActionsBtn = within(row).getByLabelText("More actions");
    fireEvent.click(moreActionsBtn);

    // Click "Delete" in the popover
    fireEvent.click(screen.getByText("Delete"));

    // The delete handler is async — wait for the del call
    await waitFor(() => {
      expect(mockDel).toHaveBeenCalled();
    });
    expect(mockDel).toHaveBeenCalledWith("/lims/entities/42/");
    expect(updateAttrs).toHaveBeenCalledWith({ rows: [] });
  });

  it("three-dot menu does not call API for unregistered rows", () => {
    const updateAttrs = vi.fn();
    render(<RegistryTableBlockComponent {...loadedPropsWithUpdateAttrs(updateAttrs)} />);

    // Open the three-dot menu on the row
    const row = screen.getByTestId("registry-table-row-#new-1");
    const moreActionsBtn = within(row).getByLabelText("More actions");
    fireEvent.click(moreActionsBtn);

    // Click "Delete" in the popover
    fireEvent.click(screen.getByText("Delete"));

    expect(mockDel).not.toHaveBeenCalled();
    expect(updateAttrs).toHaveBeenCalledWith({ rows: [] });
  });

  it("hover reveals three-dot menu on row", () => {
    const updateAttrs = vi.fn();
    render(<RegistryTableBlockComponent {...loadedPropsWithUpdateAttrs(updateAttrs)} />);

    // The MoreActions trigger should exist within the row
    const row = screen.getByTestId("registry-table-row-#new-1");
    const moreActionsBtn = within(row).getByLabelText("More actions");
    expect(moreActionsBtn).toBeInTheDocument();
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
      columns: [{ name: "Volume", type: "number", units: "mL" }],
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

// ══════════════════════════════════════════════════════════════════════════
// Import RegistryTableContent for direct testing (bypasses BlockComponent)
// ══════════════════════════════════════════════════════════════════════════

import { RegistryTableContent } from "../RegistryTableNode";

// ══════════════════════════════════════════════════════════════════════════
// Refresh schema ghost button on the title bar
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableContent — refresh schema button", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    mockPost.mockReset();
  });

  function contentProps(opts?: {
    schemaId?: number | null;
    columns?: Array<{ name: string; type: string; id?: string }>;
    rows?: RegistryTableRow[];
    readOnly?: boolean;
  }) {
    return {
      schemaId: opts?.schemaId ?? 1,
      schemaName: "Blood Sample",
      schemaContentHash: "abc123",
      title: "Test Table",
      columns: opts?.columns ?? [
        { name: "Volume", type: "number" as const, units: "mL", id: "uuid-1" },
      ],
      rows: opts?.rows ?? [makeRow()],
      updateAttrs: vi.fn(),
      readOnly: opts?.readOnly ?? false,
    };
  }

  it("renders the Refresh Schema ghost button", () => {
    render(<RegistryTableContent {...contentProps()} />);
    const btn = screen.getByTestId("refresh-schema-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label", "Refresh schema");
  });

  it("hides the Refresh Schema button when readOnly is true", () => {
    render(<RegistryTableContent {...contentProps({ readOnly: true })} />);
    expect(screen.queryByTestId("refresh-schema-btn")).not.toBeInTheDocument();
  });

  it("renders an inert registration control in preview mode", async () => {
    const props = contentProps();
    render(<RegistryTableContent {...props} previewMode readOnly />);

    const registerButton = screen.getByTestId("register-entities-btn");
    expect(registerButton).toBeDisabled();

    fireEvent.click(registerButton);
    await waitFor(() => {
      expect(mockPost).not.toHaveBeenCalled();
      expect(props.updateAttrs).not.toHaveBeenCalled();
    });
  });
});

describe("RegistryTableBlockComponent — Table Kit interaction", () => {
  function interactionProps(updateAttrs = vi.fn()) {
    const first = makeRow({ __name: "First", values: { Volume: 10 } });
    const second = makeRow({ displayId: "#new-2", __name: "Second", values: { Volume: 20 } });
    const attrs = {
      schemaId: 1,
      schemaName: "Blood Sample",
      schemaContentHash: "hash123",
      title: "Test Table",
      columns: [{ name: "Volume", type: "number" as const }],
      rows: [first, second],
    };
    return makeBlockComponentProps({
      attrs,
      rest: {
        instance: {
          id: "inst-1",
          blockId: "eln.registry-table",
          slotId: "eln.editor",
          attrs,
          updateAttrs,
        },
      },
    });
  }

  it("navigates Registry Table cells with arrows and Tab", () => {
    render(<RegistryTableBlockComponent {...interactionProps()} />);
    const firstCell = document.querySelector('[data-table-cell="registry-table:0:0"]') as HTMLElement;
    firstCell.focus();
    fireEvent.keyDown(firstCell, { key: "ArrowRight" });
    expect(document.activeElement).toBe(
      document.querySelector('[data-table-cell="registry-table:0:1"]'),
    );
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(
      document.querySelector('[data-table-cell="registry-table:1:1"]'),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(
      document.querySelector('[data-table-cell="registry-table:1:0"]'),
    );
  });

  it("commits with Enter, cancels with Escape, and moves down", () => {
    const updateAttrs = vi.fn();
    render(<RegistryTableBlockComponent {...interactionProps(updateAttrs)} />);
    const firstCell = document.querySelector('[data-table-cell="registry-table:0:0"]') as HTMLElement;
    fireEvent.doubleClick(screen.getByTestId("name-cell-#new-1"));
    const input = screen.getByTestId("name-cell-#new-1-input");
    fireEvent.change(input, { target: { value: "Changed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByTestId("name-cell-#new-1")).toHaveTextContent("First");
    firstCell.focus();
    fireEvent.doubleClick(screen.getByTestId("name-cell-#new-1"));
    const committedInput = screen.getByTestId("name-cell-#new-1-input");
    fireEvent.change(committedInput, { target: { value: "Changed" } });
    fireEvent.keyDown(committedInput, { key: "Enter" });
    expect(updateAttrs).toHaveBeenCalledWith({
      rows: expect.arrayContaining([
        expect.objectContaining({ __name: "Changed" }),
      ]),
    });
    expect(document.activeElement).toBe(
      document.querySelector('[data-table-cell="registry-table:1:0"]'),
    );
  });

  it("copies and pastes Registry Table values as TSV", () => {
    const updateAttrs = vi.fn();
    render(<RegistryTableBlockComponent {...interactionProps(updateAttrs)} />);
    const grid = screen.getByTestId("registry-table-grid");
    const firstCell = document.querySelector('[data-table-cell="registry-table:0:0"]') as HTMLElement;
    fireEvent.click(firstCell);
    fireEvent.keyDown(firstCell, { key: "ArrowRight", shiftKey: true });
    const setData = vi.fn();
    fireEvent.copy(grid, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "First\t10");

    fireEvent.click(firstCell);
    fireEvent.paste(grid, {
      clipboardData: { getData: () => "Updated\t12.5" },
    });
    expect(updateAttrs).toHaveBeenCalledWith({
      rows: expect.arrayContaining([
        expect.objectContaining({ __name: "Updated", values: { Volume: 12.5 } }),
      ]),
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Refresh schema
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableContent — refresh schema", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    mockPost.mockReset();
  });

  const existingColumns = [
    { name: "Volume", type: "number" as const, units: "mL", id: "uuid-vol" },
    { name: "Collection Date", type: "date" as const, id: "uuid-date" },
  ];

  const existingRows: RegistryTableRow[] = [
    {
      entityId: 1,
      displayId: "BLOOD1",
      __name: "Sample A",
      values: { Volume: 10, "Collection Date": "2025-06-15" },
      isRegistered: true,
      lastRegisteredValueHash: "hash1",
      registrationError: null,
    },
    {
      entityId: null,
      displayId: "#new-1",
      __name: "Sample B",
      values: { Volume: 5, "Collection Date": "2025-07-01" },
      isRegistered: false,
      lastRegisteredValueHash: null,
      registrationError: null,
    },
  ];

  function contentProps(overrides?: {
    schemaId?: number | null;
    columns?: Array<{ name: string; type: string; id?: string }>;
    rows?: RegistryTableRow[];
    schemaContentHash?: string;
    schemaName?: string;
  }) {
    const updateAttrs = vi.fn();
    return {
      schemaId: overrides && "schemaId" in overrides ? overrides.schemaId! : 1,
      schemaName: overrides?.schemaName ?? "Blood Sample",
      schemaContentHash: overrides?.schemaContentHash ?? "abc123",
      title: "Test Table",
      columns: overrides?.columns ?? existingColumns,
      rows: overrides?.rows ?? existingRows,
      updateAttrs,
      readOnly: false,
    };
  }

  it("calls GET /schemas/{schemaId}/ with the current schemaId", async () => {
    mockGet.mockResolvedValue({
      id: 1,
      name: "Blood Sample",
      prefix: "BLOOD",
      columns: [
        { id: "uuid-vol", name: "Volume", type: "number", units: "mL" },
        { id: "uuid-date", name: "Collection Date", type: "date" },
      ],
      is_active: true,
      content_hash: "abc123",
    });

    render(<RegistryTableContent {...contentProps()} />);

    fireEvent.click(screen.getByTestId("refresh-schema-btn"));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/schemas/1/");
    });
  });

  it("updates schemaContentHash and schemaName on refresh", async () => {
    const updateAttrs = vi.fn();
    mockGet.mockResolvedValue({
      id: 1,
      name: "Blood Sample (updated)",
      prefix: "BLOOD",
      columns: [
        { id: "uuid-vol", name: "Volume", type: "number", units: "mL" },
      ],
      is_active: true,
      content_hash: "new-hash-789",
    });

    render(
      <RegistryTableContent
        {...contentProps({ schemaName: "Blood Sample", schemaContentHash: "abc123" })}
        updateAttrs={updateAttrs}
      />,
    );

    fireEvent.click(screen.getByTestId("refresh-schema-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalledTimes(1);
    });

    const callArg = updateAttrs.mock.calls[0][0];
    expect(callArg.schemaContentHash).toBe("new-hash-789");
    expect(callArg.schemaName).toBe("Blood Sample (updated)");
  });

  it("adds new columns with default values to all rows", async () => {
    const updateAttrs = vi.fn();
    mockGet.mockResolvedValue({
      id: 1,
      name: "Blood Sample",
      prefix: "BLOOD",
      columns: [
        { id: "uuid-vol", name: "Volume", type: "number", units: "mL" },
        { id: "uuid-date", name: "Collection Date", type: "date" },
        { id: "uuid-new", name: "Temperature", type: "number", units: "°C" },
      ],
      is_active: true,
      content_hash: "hash-expanded",
    });

    render(
      <RegistryTableContent
        {...contentProps()}
        updateAttrs={updateAttrs}
      />,
    );

    fireEvent.click(screen.getByTestId("refresh-schema-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    const callArg = updateAttrs.mock.calls[0][0];
    expect(callArg.columns).toHaveLength(3);

    // Existing row: preserved values for surviving columns, default for new
    const blood1Row = (callArg.rows as RegistryTableRow[])[0];
    expect(blood1Row.values["Volume"]).toBe(10);
    expect(blood1Row.values["Collection Date"]).toBe("2025-06-15");
    expect(blood1Row.values["Temperature"]).toBe(0); // Number default

    const newRow = (callArg.rows as RegistryTableRow[])[1];
    expect(newRow.values["Volume"]).toBe(5);
    expect(newRow.values["Temperature"]).toBe(0);
  });

  it("removes deleted columns from all rows", async () => {
    const updateAttrs = vi.fn();
    mockGet.mockResolvedValue({
      id: 1,
      name: "Blood Sample",
      prefix: "BLOOD",
      columns: [
        { id: "uuid-vol", name: "Volume", type: "number", units: "mL" },
        // Collection Date removed
      ],
      is_active: true,
      content_hash: "hash-reduced",
    });

    render(
      <RegistryTableContent
        {...contentProps()}
        updateAttrs={updateAttrs}
      />,
    );

    fireEvent.click(screen.getByTestId("refresh-schema-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    const callArg = updateAttrs.mock.calls[0][0];
    expect(callArg.columns).toHaveLength(1);

    const blood1Row = (callArg.rows as RegistryTableRow[])[0];
    expect(blood1Row.values["Volume"]).toBe(10);
    expect(blood1Row.values).not.toHaveProperty("Collection Date");
  });

  it("preserves values for surviving columns matched by UUID even when renamed", async () => {
    const updateAttrs = vi.fn();
    mockGet.mockResolvedValue({
      id: 1,
      name: "Blood Sample",
      prefix: "BLOOD",
      columns: [
        { id: "uuid-vol", name: "Volume (mL)", type: "number", units: "mL" }, // renamed
        { id: "uuid-date", name: "Collected On", type: "date" }, // renamed
      ],
      is_active: true,
      content_hash: "hash-renamed",
    });

    render(
      <RegistryTableContent
        {...contentProps()}
        updateAttrs={updateAttrs}
      />,
    );

    fireEvent.click(screen.getByTestId("refresh-schema-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    const callArg = updateAttrs.mock.calls[0][0];
    const blood1Row = (callArg.rows as RegistryTableRow[])[0];
    // Values preserved under new names
    expect(blood1Row.values["Volume (mL)"]).toBe(10);
    expect(blood1Row.values["Collected On"]).toBe("2025-06-15");
    // Old keys gone
    expect(blood1Row.values).not.toHaveProperty("Volume");
    expect(blood1Row.values).not.toHaveProperty("Collection Date");
  });

  it("handles API error gracefully by leaving state unchanged", async () => {
    const updateAttrs = vi.fn();
    mockGet.mockRejectedValue(new Error("Network error"));

    render(
      <RegistryTableContent
        {...contentProps()}
        updateAttrs={updateAttrs}
      />,
    );

    fireEvent.click(screen.getByTestId("refresh-schema-btn"));

    // Wait a tick for the async handler
    await waitFor(() => {
      // updateAttrs should NOT have been called
      expect(updateAttrs).not.toHaveBeenCalled();
    });
  });

  it("does not call API when schemaId is null", async () => {
    const updateAttrs = vi.fn();

    // Refresh is not available when schemaId is null (placeholder state has no three-dot menu)
    render(
      <RegistryTableContent
        {...contentProps({ schemaId: null })}
        updateAttrs={updateAttrs}
      />,
    );

    // Placeholder has no refresh button
    expect(screen.queryByTestId("refresh-schema-btn")).not.toBeInTheDocument();
  });

  it("disables Refresh schema button while refreshing", async () => {
    // Don't resolve the promise so we stay in "refreshing" state
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockGet.mockReturnValue(pendingPromise);

    render(<RegistryTableContent {...contentProps()} />);

    fireEvent.click(screen.getByTestId("refresh-schema-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("refresh-schema-btn")).toBeDisabled();
    });

    // Cleanup: resolve the promise
    resolvePromise!({
      id: 1,
      name: "Blood Sample",
      prefix: "BLOOD",
      columns: [{ id: "uuid-vol", name: "Volume", type: "number", units: "mL" }],
      is_active: true,
      content_hash: "abc",
    });
  });

  it("registered rows preserve their entityId, displayId, and registration metadata after refresh", async () => {
    const updateAttrs = vi.fn();
    mockGet.mockResolvedValue({
      id: 1,
      name: "Blood Sample",
      prefix: "BLOOD",
      columns: [
        { id: "uuid-vol", name: "Volume", type: "number", units: "mL" },
        { id: "uuid-new", name: "Temp", type: "number" },
      ],
      is_active: true,
      content_hash: "new-hash",
    });

    render(
      <RegistryTableContent
        {...contentProps()}
        updateAttrs={updateAttrs}
      />,
    );

    fireEvent.click(screen.getByTestId("refresh-schema-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    const callArg = updateAttrs.mock.calls[0][0];
    const registeredRow = (callArg.rows as RegistryTableRow[])[0];
    expect(registeredRow.entityId).toBe(1);
    expect(registeredRow.displayId).toBe("BLOOD1");
    expect(registeredRow.isRegistered).toBe(true);
    expect(registeredRow.lastRegisteredValueHash).toBe("hash1");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// View mode (readOnly)
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableContent — view mode (readOnly)", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    mockPost.mockReset();
  });

  const columns = [
    { name: "Volume", type: "number" as const, units: "mL", id: "uuid-1" },
    { name: "Notes", type: "text" as const, id: "uuid-2" },
    { name: "Active", type: "boolean" as const, id: "uuid-3" },
    { name: "Collected", type: "date" as const, id: "uuid-4" },
    { name: "Related", type: "reference" as const, id: "uuid-5" },
  ];

  const row: RegistryTableRow = {
    entityId: 1,
    displayId: "BLOOD1",
    __name: "Sample A",
    values: {
      Volume: 10,
      Notes: "Test note",
      Active: true,
      Collected: "2025-06-15",
      Related: "E1",
    },
    isRegistered: true,
    lastRegisteredValueHash: "hash1",
    registrationError: null,
  };

  function contentProps(overrides?: { readOnly?: boolean; rows?: RegistryTableRow[] }) {
    return {
      schemaId: 1 as number | null,
      schemaName: "Blood Sample",
      schemaContentHash: "abc123",
      title: "Test Table",
      columns,
      rows: overrides?.rows ?? [row],
      updateAttrs: vi.fn(),
      readOnly: overrides?.readOnly ?? true,
    };
  }

  it("title is not editable when readOnly (no contentEditable attribute)", () => {
    render(<RegistryTableContent {...contentProps()} />);
    const title = screen.getByTestId("registry-table-title");
    expect(title).toHaveTextContent("Test Table");
    expect(title.getAttribute("contentEditable")).toBeNull();
  });

  it("three-dot menu is hidden when readOnly", () => {
    render(<RegistryTableContent {...contentProps()} />);
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  it("+ New Row button is hidden when readOnly", () => {
    render(<RegistryTableContent {...contentProps()} />);
    expect(screen.queryByTestId("add-row-btn")).not.toBeInTheDocument();
  });

  it("delete column header is hidden when readOnly", () => {
    render(<RegistryTableContent {...contentProps()} />);
    expect(screen.queryByTestId("registry-table-header-delete")).not.toBeInTheDocument();
  });

  it("delete buttons are not rendered for rows when readOnly", () => {
    render(<RegistryTableContent {...contentProps()} />);
    // The MoreActions trigger should not exist within the row
    const row = screen.getByTestId("registry-table-row-BLOOD1");
    expect(within(row).queryByLabelText("More actions")).not.toBeInTheDocument();
  });

  it("name cell is rendered as plain text (not contentEditable) when readOnly", () => {
    render(<RegistryTableContent {...contentProps()} />);
    const nameCell = screen.getByTestId("name-cell-BLOOD1");
    expect(nameCell).toHaveTextContent("Sample A");
    expect(nameCell.getAttribute("contentEditable")).toBeNull();
  });

  it("text column renders as plain text when readOnly", () => {
    render(<RegistryTableContent {...contentProps()} />);
    const cell = screen.getByTestId("cell-BLOOD1-Notes");
    expect(cell.querySelector('[data-testid="readonly-cell"]')).toHaveTextContent("Test note");
  });

  it("number column renders as plain text when readOnly", () => {
    render(<RegistryTableContent {...contentProps()} />);
    const cell = screen.getByTestId("cell-BLOOD1-Volume");
    expect(cell.querySelector('[data-testid="readonly-cell"]')).toHaveTextContent("10");
  });

  it("boolean column renders as Yes/No text when readOnly", () => {
    render(<RegistryTableContent {...contentProps()} />);
    const cell = screen.getByTestId("cell-BLOOD1-Active");
    expect(cell.querySelector('[data-testid="boolean-display"]')).toHaveTextContent("Yes");
  });

  it("boolean column shows No for false values when readOnly", () => {
    const falseRow = { ...row, values: { ...row.values, Active: false } };
    render(<RegistryTableContent {...contentProps({ rows: [falseRow] })} />);
    const cell = screen.getByTestId("cell-BLOOD1-Active");
    expect(cell.querySelector('[data-testid="boolean-display"]')).toHaveTextContent("No");
  });

  it("reference cell shows MentionBadge but no clear button when readOnly", () => {
    render(<RegistryTableContent {...contentProps()} />);
    // The clear button should not be present
    expect(screen.queryByTestId("ref-clear-btn")).not.toBeInTheDocument();
  });

  it("reference cell does not show @mention trigger for empty values when readOnly", () => {
    const emptyRefRow = { ...row, values: { ...row.values, Related: "" } };
    render(<RegistryTableContent {...contentProps({ rows: [emptyRefRow] })} />);
    expect(screen.queryByTestId("ref-trigger-btn")).not.toBeInTheDocument();
  });

  it("empty state message changes in readOnly mode", () => {
    render(<RegistryTableContent {...contentProps({ rows: [] })} />);
    expect(screen.getByText("No rows.")).toBeInTheDocument();
    expect(screen.queryByText(/No rows yet/)).not.toBeInTheDocument();
  });

  it("shows all action buttons and editors when readOnly is false", () => {
    render(<RegistryTableContent {...contentProps({ readOnly: false })} />);
    // All interactive elements should be present
    expect(screen.getByTestId("add-row-btn")).toBeInTheDocument();
    expect(screen.getByTestId("registry-table-header-delete")).toBeInTheDocument();
    // The MoreActions three-dot trigger should exist within the row
    const row = screen.getByTestId("registry-table-row-BLOOD1");
    expect(within(row).getByLabelText("More actions")).toBeInTheDocument();
    expect(screen.getByTestId("refresh-schema-btn")).toBeInTheDocument();
    // Title should be editable
    expect(screen.getByTestId("registry-table-title").getAttribute("contentEditable")).toBe("true");
    // Name cell should be editable
    expect(screen.getByTestId("name-cell-BLOOD1").getAttribute("contentEditable")).toBe("true");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// RegistryTableBlockComponent — viewMode integration
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — viewMode integration", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    mockPost.mockReset();
  });

  it("passes readOnly=false when context.viewMode is 'edit'", () => {
    render(
      <RegistryTableBlockComponent
        {...makeBlockComponentProps({
          attrs: {
            schemaId: 1,
            schemaName: "Blood Sample",
            schemaContentHash: "abc123",
            title: "Test",
            columns: [{ name: "Volume", type: "number", id: "uuid-1" }],
            rows: [makeRow()],
          },
          rest: {
            context: { viewMode: "edit" },
          },
        })}
      />,
    );

    // "+ New Row" button should be visible
    expect(screen.getByTestId("add-row-btn")).toBeInTheDocument();
    // Three-dot menu should be visible
    expect(screen.getByTestId("refresh-schema-btn")).toBeInTheDocument();
  });

  it("passes readOnly=true when context.viewMode is 'view'", () => {
    render(
      <RegistryTableBlockComponent
        {...makeBlockComponentProps({
          attrs: {
            schemaId: 1,
            schemaName: "Blood Sample",
            schemaContentHash: "abc123",
            title: "Test",
            columns: [{ name: "Volume", type: "number", id: "uuid-1" }],
            rows: [makeRow()],
          },
          rest: {
            context: { viewMode: "view" },
          },
        })}
      />,
    );

    // "+ New Row" button should be hidden
    expect(screen.queryByTestId("add-row-btn")).not.toBeInTheDocument();
    // Three-dot menu should be hidden
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  it("passes readOnly=false when context.viewMode is undefined", () => {
    render(
      <RegistryTableBlockComponent
        {...makeBlockComponentProps({
          attrs: {
            schemaId: 1,
            schemaName: "Blood Sample",
            schemaContentHash: "abc123",
            title: "Test",
            columns: [{ name: "Volume", type: "number", id: "uuid-1" }],
            rows: [makeRow()],
          },
          rest: {
            context: {} as any,
          },
        })}
      />,
    );

    // "+ New Row" button should be visible (defaults to edit mode)
    expect(screen.getByTestId("add-row-btn")).toBeInTheDocument();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Register Entities button
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableContent — Register Entities button", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    mockPost.mockReset();
  });

  const baseColumns = [
    { name: "Volume", type: "number" as const, units: "mL", id: "uuid-1" },
  ];

  function contentProps(
    opts?: {
      schemaId?: number | null;
      rows?: RegistryTableRow[];
      projectId?: number | null;
      folderId?: number | null;
      readOnly?: boolean;
      schemaContentHash?: string | null;
    },
  ) {
    return {
      schemaId: opts?.schemaId ?? 1,
      schemaName: "Blood Sample",
      schemaContentHash:
        "schemaContentHash" in (opts ?? {})
          ? (opts!.schemaContentHash as string | null)
          : "abc123",
      title: "Test Table",
      columns: baseColumns,
      rows: opts?.rows ?? [makeRow()],
      projectId: opts?.projectId,
      folderId: opts?.folderId,
      updateAttrs: vi.fn(),
      readOnly: opts?.readOnly ?? false,
    };
  }

  it("renders the Register button (icon-only) when schema is loaded and editable", () => {
    render(<RegistryTableContent {...contentProps()} />);
    const btn = screen.getByTestId("register-entities-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label", "Register entities");
  });

  it("does not render Register Entities button when readOnly", () => {
    render(<RegistryTableContent {...contentProps({ readOnly: true })} />);
    expect(
      screen.queryByTestId("register-entities-btn"),
    ).not.toBeInTheDocument();
  });

  it("Register Entities button sends POST with non-green rows only", async () => {
    const updateAttrs = vi.fn();
    const greenHash = computeSnapshot({ Volume: 10 }, "Green Sample");

    // Green row — should be skipped
    const greenRow: RegistryTableRow = {
      entityId: 1,
      displayId: "BLOOD1",
      __name: "Green Sample",
      values: { Volume: 10 },
      isRegistered: true,
      lastRegisteredValueHash: greenHash,
      lastRegisteredSchemaContentHash: "abc123",
      registrationError: null,
    };

    // Blue row — unregistered, should be included
    const blueRow = makeRow({
      displayId: "#new-1",
      __name: "New Sample",
      values: { Volume: 5 },
    });

    // Orange row — data changed, should be included
    const orangeRow: RegistryTableRow = {
      entityId: 2,
      displayId: "BLOOD2",
      __name: "Changed Sample",
      values: { Volume: 99 },
      isRegistered: true,
      lastRegisteredValueHash: "old-different-hash",
      lastRegisteredSchemaContentHash: "abc123",
      registrationError: null,
    };

    // Red row — has error, should be included (re-register to clear error)
    const redRow: RegistryTableRow = {
      entityId: 3,
      displayId: "BLOOD3",
      __name: "Error Sample",
      values: { Volume: 7 },
      isRegistered: true,
      lastRegisteredValueHash: computeSnapshot({ Volume: 7 }, "Error Sample"),
      lastRegisteredSchemaContentHash: "abc123",
      registrationError: "Previous error",
    };

    mockPost.mockResolvedValue({
      results: [
        { row_index: 0, entity_id: 10, display_id: "BLOOD10", status: "created" },
        { row_index: 1, entity_id: 2, display_id: "BLOOD2", status: "updated" },
        { row_index: 2, entity_id: 3, display_id: "BLOOD3", status: "updated" },
      ],
      errors: [],
    });

    render(
      <RegistryTableContent
        {...contentProps({
          rows: [greenRow, blueRow, orangeRow, redRow],
          projectId: 7,
          folderId: 42,
          schemaContentHash: "abc123",
        })}
        updateAttrs={updateAttrs}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });

    // Green row should be skipped — only 3 rows sent
    const postCall = mockPost.mock.calls[0];
    expect(postCall[0]).toBe("/lims/entities/batch-register/");
    expect(postCall[1].schema_id).toBe(1);
    expect(postCall[1].project_id).toBe(7);
    expect(postCall[1].rows).toHaveLength(3);
    // Verify sent rows (in order: blue, orange, red)
    expect(postCall[1].rows[0]).toEqual({
      entity_id: null,
      name: "New Sample",
      values: { Volume: 5 },
      folder_id: 42,
    });
    expect(postCall[1].rows[1]).toEqual({
      entity_id: 2,
      name: "Changed Sample",
      values: { Volume: 99 },
      folder_id: 42,
    });
    expect(postCall[1].rows[2]).toEqual({
      entity_id: 3,
      name: "Error Sample",
      values: { Volume: 7 },
      folder_id: 42,
    });
  });

  it("skips rows with empty names and adds local error", async () => {
    const updateAttrs = vi.fn();
    const emptyNameRow = makeRow({
      displayId: "#new-1",
      __name: "",
      values: { Volume: 5 },
    });

    mockPost.mockResolvedValue({
      results: [],
      errors: [],
    });

    render(
      <RegistryTableContent
        {...contentProps({ rows: [emptyNameRow] })}
        updateAttrs={updateAttrs}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    // Empty name row should not be sent to the API
    expect(mockPost).not.toHaveBeenCalled();

    // Instead, it should get a local error
    const callArg = updateAttrs.mock.calls[0][0];
    const updatedRows = callArg.rows as RegistryTableRow[];
    expect(updatedRows[0].registrationError).toBe("Name is required.");
  });

  it("trims whitespace to detect empty names", async () => {
    const updateAttrs = vi.fn();
    const whitespaceRow = makeRow({
      displayId: "#new-1",
      __name: "   ",
      values: { Volume: 5 },
    });

    render(
      <RegistryTableContent
        {...contentProps({ rows: [whitespaceRow] })}
        updateAttrs={updateAttrs}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    expect(mockPost).not.toHaveBeenCalled();
    const callArg = updateAttrs.mock.calls[0][0];
    const updatedRows = callArg.rows as RegistryTableRow[];
    expect(updatedRows[0].registrationError).toBe("Name is required.");
  });

  it("empty name and non-empty name rows: valid row is sent, invalid gets local error", async () => {
    const updateAttrs = vi.fn();
    const emptyNameRow = makeRow({
      displayId: "#new-empty",
      __name: "",
      values: { Volume: 5 },
    });
    const validRow = makeRow({
      displayId: "#new-valid",
      __name: "Valid Sample",
      values: { Volume: 10 },
    });

    mockPost.mockResolvedValue({
      results: [
        { row_index: 0, entity_id: 42, display_id: "BLOOD42", status: "created" },
      ],
      errors: [],
    });

    render(
      <RegistryTableContent
        {...contentProps({ rows: [emptyNameRow, validRow] })}
        updateAttrs={updateAttrs}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });

    // Only the valid row should be sent
    expect(mockPost.mock.calls[0][1].rows).toHaveLength(1);
    expect(mockPost.mock.calls[0][1].rows[0]).toEqual({
      entity_id: null,
      name: "Valid Sample",
      values: { Volume: 10 },
    });

    // Both rows should be updated
    const callArg = updateAttrs.mock.calls[0][0];
    const updatedRows = callArg.rows as RegistryTableRow[];
    expect(updatedRows[0].registrationError).toBe("Name is required.");
    expect(updatedRows[1].registrationError).toBeNull();
    expect(updatedRows[1].isRegistered).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Register Entities — success path
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableContent — Register Entities success path", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    mockPost.mockReset();
  });

  const baseColumns = [
    { name: "Volume", type: "number" as const, units: "mL", id: "uuid-1" },
  ];

  function contentProps(rows: RegistryTableRow[], updateAttrs?: ReturnType<typeof vi.fn>) {
    return {
      schemaId: 1 as number | null,
      schemaName: "Blood Sample",
      schemaContentHash: "abc123",
      title: "Test Table",
      columns: baseColumns,
      rows,
      updateAttrs: updateAttrs ?? vi.fn(),
      readOnly: false,
    };
  }

  it("updates row with entityId, displayId, isRegistered, and value hash on success", async () => {
    const updateAttrs = vi.fn();
    const newRow = makeRow({
      displayId: "#new-1",
      __name: "New Sample",
      values: { Volume: 42 },
    });

    const newEntityId = 100;
    const newDisplayId = "BLOOD100";

    mockPost.mockResolvedValue({
      results: [
        {
          row_index: 0,
          entity_id: newEntityId,
          display_id: newDisplayId,
          status: "created",
        },
      ],
      errors: [],
    });

    render(
      <RegistryTableContent
        {...contentProps([newRow], updateAttrs)}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    const callArg = updateAttrs.mock.calls[0][0];
    const updatedRows = callArg.rows as RegistryTableRow[];
    const updated = updatedRows[0];

    expect(updated.entityId).toBe(newEntityId);
    expect(updated.displayId).toBe(newDisplayId);
    expect(updated.isRegistered).toBe(true);
    expect(updated.lastRegisteredValueHash).toBe(computeSnapshot({ Volume: 42 }, "New Sample"));
    expect(updated.registrationError).toBeNull();
  });

  it("entity pill (MentionBadge) appears for registered rows", () => {
    const registeredRow: RegistryTableRow = {
      entityId: 42,
      displayId: "BLOOD42",
      __name: "Sample",
      values: { Volume: 10 },
      isRegistered: true,
      lastRegisteredValueHash: computeSnapshot({ Volume: 10 }, "Sample"),
      registrationError: null,
    };

    render(<RegistryTableContent {...contentProps([registeredRow])} />);

    // The MentionBadge should render with the displayId text
    const badge = screen.getByText("BLOOD42");
    expect(badge).toBeInTheDocument();
  });

  it("does not show entity pill for unregistered rows", () => {
    const unregisteredRow = makeRow({
      displayId: "#new-1",
      __name: "Sample",
      values: { Volume: 10 },
    });

    render(<RegistryTableContent {...contentProps([unregisteredRow])} />);

    // The displayId "#new-1" should not appear as an entity pill
    // (it only appears as the row key, not as a MentionBadge)
    // Registered rows show clickable MentionBadge; unregistered show only status bar
    expect(screen.queryByText("#new-1")).not.toBeInTheDocument();
  });

  it("partial success: successful rows updated, failed rows get error", async () => {
    const updateAttrs = vi.fn();
    const row1 = makeRow({ displayId: "#new-1", __name: "Good Sample", values: { Volume: 10 } });
    const row2 = makeRow({ displayId: "#new-2", __name: "Bad Sample", values: { Volume: 20 } });

    mockPost.mockResolvedValue({
      results: [
        { row_index: 0, entity_id: 1, display_id: "BLOOD1", status: "created" },
      ],
      errors: [
        { row_index: 1, field: "name", message: "Name already exists." },
      ],
    });

    render(
      <RegistryTableContent
        {...contentProps([row1, row2], updateAttrs)}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    const callArg = updateAttrs.mock.calls[0][0];
    const updatedRows = callArg.rows as RegistryTableRow[];

    // Row 1: success
    expect(updatedRows[0].isRegistered).toBe(true);
    expect(updatedRows[0].entityId).toBe(1);
    expect(updatedRows[0].displayId).toBe("BLOOD1");
    expect(updatedRows[0].registrationError).toBeNull();

    // Row 2: error
    expect(updatedRows[1].isRegistered).toBe(false);
    expect(updatedRows[1].registrationError).toBe("Name already exists.");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Register Entities — error path
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableContent — Register Entities error path", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    mockPost.mockReset();
  });

  const baseColumns = [
    { name: "Volume", type: "number" as const, units: "mL", id: "uuid-1" },
  ];

  function contentProps(rows: RegistryTableRow[], updateAttrs: ReturnType<typeof vi.fn>) {
    return {
      schemaId: 1 as number | null,
      schemaName: "Blood Sample",
      schemaContentHash: "abc123",
      title: "Test Table",
      columns: baseColumns,
      rows,
      updateAttrs,
      readOnly: false,
    };
  }

  it("shows red status bar for rows with registration error", async () => {
    const updateAttrs = vi.fn();
    const row = makeRow({ displayId: "#new-1", __name: "Sample", values: { Volume: 10 } });

    mockPost.mockRejectedValue(new Error("Network failure"));

    render(
      <RegistryTableContent
        {...contentProps([row], updateAttrs)}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    const callArg = updateAttrs.mock.calls[0][0];
    const updatedRows = callArg.rows as RegistryTableRow[];
    expect(updatedRows[0].registrationError).toBe("Network failure");
  });

  it("API error per-row: red bar appears, other rows unaffected", async () => {
    const updateAttrs = vi.fn();
    const row1 = makeRow({ displayId: "#new-1", __name: "OK", values: { Volume: 1 } });
    const row2 = makeRow({ displayId: "#new-2", __name: "Fail", values: { Volume: 2 } });

    mockPost.mockResolvedValue({
      results: [
        { row_index: 0, entity_id: 10, display_id: "BLOOD10", status: "created" },
      ],
      errors: [
        { row_index: 1, field: "entity_id", message: "Entity not found." },
      ],
    });

    render(
      <RegistryTableContent
        {...contentProps([row1, row2], updateAttrs)}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    const callArg = updateAttrs.mock.calls[0][0];
    const updatedRows = callArg.rows as RegistryTableRow[];

    // Row 1: OK
    expect(updatedRows[0].isRegistered).toBe(true);
    expect(updatedRows[0].entityId).toBe(10);
    expect(updatedRows[0].registrationError).toBeNull();

    // Row 2: error
    expect(updatedRows[1].registrationError).toBe("Entity not found.");
  });

  it("network error marks all sent rows with error", async () => {
    const updateAttrs = vi.fn();
    const rows = [
      makeRow({ displayId: "#new-1", __name: "A", values: { Volume: 1 } }),
      makeRow({ displayId: "#new-2", __name: "B", values: { Volume: 2 } }),
    ];

    mockPost.mockRejectedValue(new Error("Network failure"));

    render(
      <RegistryTableContent
        {...contentProps(rows, updateAttrs)}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    const callArg = updateAttrs.mock.calls[0][0];
    const updatedRows = callArg.rows as RegistryTableRow[];
    expect(updatedRows[0].registrationError).toBe("Network failure");
    expect(updatedRows[1].registrationError).toBe("Network failure");
  });

  it("green rows are NOT affected by network error", async () => {
    const updateAttrs = vi.fn();
    const greenHash = computeSnapshot({ Volume: 5 }, "Green");
    const greenRow: RegistryTableRow = {
      entityId: 1,
      displayId: "BLOOD1",
      __name: "Green",
      values: { Volume: 5 },
      isRegistered: true,
      lastRegisteredValueHash: greenHash,
      lastRegisteredSchemaContentHash: "abc123",
      registrationError: null,
    };
    const blueRow = makeRow({ displayId: "#new-1", __name: "Blue", values: { Volume: 10 } });

    mockPost.mockRejectedValue(new Error("Network failure"));

    render(
      <RegistryTableContent
        {...contentProps([greenRow, blueRow], updateAttrs)}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(updateAttrs).toHaveBeenCalled();
    });

    const callArg = updateAttrs.mock.calls[0][0];
    const updatedRows = callArg.rows as RegistryTableRow[];

    // Green row unchanged
    expect(updatedRows[0].entityId).toBe(1);
    expect(updatedRows[0].isRegistered).toBe(true);
    expect(updatedRows[0].registrationError).toBeNull();

    // Blue row got error
    expect(updatedRows[1].registrationError).toBe("Network failure");
  });

  it("button shows loading state while registering", async () => {
    // Don't resolve the promise so we stay in "registering" state
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockPost.mockReturnValue(pendingPromise);

    const updateAttrs = vi.fn();
    const row = makeRow({ displayId: "#new-1", __name: "Sample", values: { Volume: 10 } });

    render(
      <RegistryTableContent
        {...contentProps([row], updateAttrs)}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("register-entities-btn")).toBeDisabled();
    });

    // Cleanup
    resolvePromise!({
      results: [
        { row_index: 0, entity_id: 1, display_id: "BLOOD1", status: "created" },
      ],
      errors: [],
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Register Entities — green row detection
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableContent — green row detection", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    mockPost.mockReset();
  });

  const baseColumns = [
    { name: "Volume", type: "number" as const, units: "mL", id: "uuid-1" },
  ];

  it("skips green rows (no non-green → no API call, no updateAttrs)", () => {
    const updateAttrs = vi.fn();
    const hash = computeSnapshot({ Volume: 10 }, "Green");
    const greenRow: RegistryTableRow = {
      entityId: 1,
      displayId: "BLOOD1",
      __name: "Green",
       values: { Volume: 10 },
       isRegistered: true,
       lastRegisteredValueHash: hash,
       lastRegisteredSchemaContentHash: "abc123",
       registrationError: null,
    };

    render(
      <RegistryTableContent
        schemaId={1}
        schemaName="Blood Sample"
        schemaContentHash="abc123"
        title="Test"
        columns={baseColumns}
        rows={[greenRow]}
        updateAttrs={updateAttrs}
        readOnly={false}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    // No API call should be made (all rows are green)
    expect(mockPost).not.toHaveBeenCalled();
    // No updateAttrs should be called (nothing changed)
    expect(updateAttrs).not.toHaveBeenCalled();
  });

  it("does not skip blue (unregistered) rows", async () => {
    const updateAttrs = vi.fn();
    const blueRow = makeRow({
      displayId: "#new-1",
      __name: "Blue",
      values: { Volume: 10 },
    });

    mockPost.mockResolvedValue({
      results: [
        { row_index: 0, entity_id: 1, display_id: "BLOOD1", status: "created" },
      ],
      errors: [],
    });

    render(
      <RegistryTableContent
        schemaId={1}
        schemaName="Blood Sample"
        schemaContentHash="abc123"
        title="Test"
        columns={baseColumns}
        rows={[blueRow]}
        updateAttrs={updateAttrs}
        readOnly={false}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });
  });

  it("does not skip orange (data changed) rows", async () => {
    const updateAttrs = vi.fn();
    const orangeRow: RegistryTableRow = {
      entityId: 2,
      displayId: "BLOOD2",
      __name: "Changed",
      values: { Volume: 99 },
      isRegistered: true,
      lastRegisteredValueHash: "different-hash",
      registrationError: null,
    };

    mockPost.mockResolvedValue({
      results: [
        { row_index: 0, entity_id: 2, display_id: "BLOOD2", status: "updated" },
      ],
      errors: [],
    });

    render(
      <RegistryTableContent
        schemaId={1}
        schemaName="Blood Sample"
        schemaContentHash="abc123"
        title="Test"
        columns={baseColumns}
        rows={[orangeRow]}
        updateAttrs={updateAttrs}
        readOnly={false}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });
  });

  it("does not skip red (error) rows (re-register to clear error)", async () => {
    const updateAttrs = vi.fn();
    const hash = computeSnapshot({ Volume: 7 }, "Fix Me");
    const redRow: RegistryTableRow = {
      entityId: 3,
      displayId: "BLOOD3",
      __name: "Fix Me",
      values: { Volume: 7 },
      isRegistered: true,
      lastRegisteredValueHash: hash,
      registrationError: "Previous failure",
    };

    mockPost.mockResolvedValue({
      results: [
        { row_index: 0, entity_id: 3, display_id: "BLOOD3", status: "updated" },
      ],
      errors: [],
    });

    render(
      <RegistryTableContent
        schemaId={1}
        schemaName="Blood Sample"
        schemaContentHash="abc123"
        title="Test"
        columns={baseColumns}
        rows={[redRow]}
        updateAttrs={updateAttrs}
        readOnly={false}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });
  });

  it("does not skip yellow rows (missing schemaContentHash)", async () => {
    const updateAttrs = vi.fn();
    const hash = computeSnapshot({ Volume: 10 }, "Stale Schema");
    const yellowRow: RegistryTableRow = {
      entityId: 4,
      displayId: "BLOOD4",
      __name: "Stale Schema",
      values: { Volume: 10 },
      isRegistered: true,
      lastRegisteredValueHash: hash,
      registrationError: null,
    };

    mockPost.mockResolvedValue({
      results: [
        { row_index: 0, entity_id: 4, display_id: "BLOOD4", status: "updated" },
      ],
      errors: [],
    });

    render(
      <RegistryTableContent
        schemaId={1}
        schemaName="Blood Sample"
        schemaContentHash={null} // yellow condition
        title="Test"
        columns={baseColumns}
        rows={[yellowRow]}
        updateAttrs={updateAttrs}
        readOnly={false}
      />,
    );

    fireEvent.click(screen.getByTestId("register-entities-btn"));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Stretch toggle (#282)
// ══════════════════════════════════════════════════════════════════════════

describe("RegistryTableBlockComponent — stretch toggle", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDel.mockReset();
    mockPost.mockReset();
  });

  function loadedStretchProps(opts?: {
    attrs?: Record<string, unknown>;
    overrides?: Record<string, unknown>;
    rest?: Record<string, unknown>;
  }) {
    return makeBlockComponentProps({
      attrs: {
        schemaId: 1,
        schemaName: "Blood Sample",
        schemaContentHash: "abc123",
        title: "Test Table",
        columns: [{ name: "Volume", type: "number" as const, units: "mL" }],
        rows: [makeRow()],
        ...(opts?.attrs ?? {}),
      },
      overrides: opts?.overrides ?? {},
      rest: opts?.rest,
    });
  }

  it("renders stretch toggle button when overrides.stretch is true", () => {
    render(
      <RegistryTableBlockComponent
        {...loadedStretchProps({ overrides: { stretch: true } })}
      />,
    );
    const btn = screen.getByTestId("stretch-toggle-btn");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label", "Stretch table to full width");
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("does NOT render stretch toggle when overrides.stretch is absent", () => {
    render(
      <RegistryTableBlockComponent
        {...loadedStretchProps({ overrides: {} })}
      />,
    );
    expect(screen.queryByTestId("stretch-toggle-btn")).not.toBeInTheDocument();
  });

  it("does NOT render stretch toggle when overrides.stretch is false", () => {
    render(
      <RegistryTableBlockComponent
        {...loadedStretchProps({ overrides: { stretch: false } })}
      />,
    );
    expect(screen.queryByTestId("stretch-toggle-btn")).not.toBeInTheDocument();
  });

  it("does NOT render stretch toggle in placeholder state even with stretch override", () => {
    render(
      <RegistryTableBlockComponent
        {...makeBlockComponentProps({ overrides: { stretch: true } })}
      />,
    );
    // Placeholder state (schemaId is null) — no toggle shown
    expect(screen.queryByTestId("stretch-toggle-btn")).not.toBeInTheDocument();
  });

  it("default stretchMode uses the shared auto layout primitive", () => {
    render(
      <RegistryTableBlockComponent
        {...loadedStretchProps({ overrides: { stretch: true } })}
      />,
    );
    const wrapper = screen.getByTestId("registry-table-stretch-wrapper");
    expect(wrapper.className).toContain("table-layout-stretch--auto");
    // Auto mode: card is capped at 48rem, table scrolls within it.
    // No mx-auto centering — left-aligned in the centre gutter.
    expect(wrapper.className).not.toContain("mx-auto");
  });

  it("toggle click switches to full-width mode", () => {
    const updateAttrs = vi.fn();
    render(
      <RegistryTableBlockComponent
        {...loadedStretchProps({
          overrides: { stretch: true },
          rest: {
            instance: {
              id: "inst-1",
              blockId: "eln.registry-table",
              slotId: "eln.editor",
              attrs: {
                schemaId: 1,
                schemaName: "Blood Sample",
                schemaContentHash: "abc123",
                title: "Test Table",
                columns: [{ name: "Volume", type: "number", units: "mL" }],
                rows: [makeRow()],
              },
              updateAttrs,
            },
          },
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("stretch-toggle-btn"));

    expect(updateAttrs).toHaveBeenCalledWith({ stretchMode: "full" });
  });

  it("toggle click switches back to auto-fit mode", () => {
    const updateAttrs = vi.fn();
    render(
      <RegistryTableBlockComponent
        {...loadedStretchProps({
          attrs: { stretchMode: "full" },
          overrides: { stretch: true },
          rest: {
            instance: {
              id: "inst-1",
              blockId: "eln.registry-table",
              slotId: "eln.editor",
              attrs: {
                schemaId: 1,
                schemaName: "Blood Sample",
                schemaContentHash: "abc123",
                title: "Test Table",
                columns: [{ name: "Volume", type: "number", units: "mL" }],
                rows: [makeRow()],
                stretchMode: "full",
              },
              updateAttrs,
            },
          },
        })}
      />,
    );

    fireEvent.click(screen.getByTestId("stretch-toggle-btn"));

    expect(updateAttrs).toHaveBeenCalledWith({ stretchMode: "auto" });
  });

  it("full-width mode uses w-full class", () => {
    render(
      <RegistryTableBlockComponent
        {...loadedStretchProps({
          attrs: { stretchMode: "full" },
          overrides: { stretch: true },
        })}
      />,
    );
    const container = screen.getByTestId("registry-table-loaded");
    expect(container.className).toContain("w-full");
  });

  it("toggle has correct aria-label and aria-pressed in full mode", () => {
    render(
      <RegistryTableBlockComponent
        {...loadedStretchProps({
          attrs: { stretchMode: "full" },
          overrides: { stretch: true },
        })}
      />,
    );
    const btn = screen.getByTestId("stretch-toggle-btn");
    expect(btn).toHaveAttribute("aria-label", "Auto-fit table to content");
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("stretchMode defaults to 'auto' when not in attrs", () => {
    render(
      <RegistryTableBlockComponent
        {...loadedStretchProps({ overrides: { stretch: true } })}
      />,
    );
    const wrapper = screen.getByTestId("registry-table-stretch-wrapper");
    expect(wrapper.className).toContain("table-layout-stretch--auto");
    // Auto mode: left-aligned, not centred
    expect(wrapper.className).not.toContain("mx-auto");
  });
});
