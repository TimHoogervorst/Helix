import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SchemaSettings from "../SchemaSettings";
import { ModRegistry } from "../../../../shell/src/mod-system/ModRegistry";
import type { BackendColumnType } from "../../../../shell/src/mod-system/ModRegistry";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();

vi.mock("../../../../shell/src/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
  patch: vi.fn(),
  del: (...args: unknown[]) => mockDel(...args),
}));

vi.mock("../../../dropdowns/api", () => ({
  listDropdowns: vi.fn().mockResolvedValue([]),
}));

const STANDARD_COLORS = [
  { key: "enzyme", label: "Enzyme", hex: "#d9b3e6" },
  { key: "flask", label: "Flask", hex: "#b3d9e6" },
  { key: "solvent", label: "Solvent", hex: "#b3e6c8" },
  { key: "warn", label: "Warn", hex: "#e6d9b3" },
  { key: "primary", label: "Primary", hex: "#7fb3d9" },
  { key: "success", label: "Success", hex: "#b3e6b3" },
  { key: "destructive", label: "Destructive", hex: "#e6b3b3" },
  { key: "muted", label: "Muted", hex: "#d9d9d9" },
];

const STANDARD_ICONS = [
  { key: "type", label: "Type", kind: "lucide" as const, token: "type", svg: "" },
  { key: "hash", label: "Hash", kind: "lucide" as const, token: "hash", svg: "" },
  { key: "calendar", label: "Calendar", kind: "lucide" as const, token: "calendar", svg: "" },
  { key: "toggle-left", label: "Toggle Left", kind: "lucide" as const, token: "toggle-left", svg: "" },
  { key: "list", label: "List", kind: "lucide" as const, token: "list", svg: "" },
  { key: "link", label: "Link", kind: "lucide" as const, token: "link", svg: "" },
  { key: "circle", label: "Circle", kind: "lucide" as const, token: "circle", svg: "" },
];

const MOCK_COLUMN_TYPES: BackendColumnType[] = [
  {
    id: "text",
    displayName: "Text",
    icon: "type",
    color: "flask",
    operandShape: "text",
    defaultValue: "",
    operators: [],
    aggregates: [],
  },
  {
    id: "number",
    displayName: "Number",
    icon: "hash",
    color: "solvent",
    operandShape: "number",
    defaultValue: 0,
    operators: [],
    aggregates: [],
  },
  {
    id: "boolean",
    displayName: "Boolean",
    icon: "toggle-left",
    color: "success",
    operandShape: "boolean",
    defaultValue: false,
    operators: [],
    aggregates: [],
  },
  {
    id: "dropdown",
    displayName: "Dropdown",
    icon: "list",
    color: "enzyme",
    operandShape: "text",
    defaultValue: "",
    operators: [],
    aggregates: [],
  },
  {
    id: "reference",
    displayName: "Reference",
    icon: "link",
    color: "primary",
    operandShape: "entity-picker",
    defaultValue: null,
    operators: [],
    aggregates: [],
  },
];

function resetRegistry(): ModRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
  return ModRegistry.getInstance();
}

function makeSchema(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Blood Sample",
    prefix: "BLOOD",
    schema_type: 1,
    schema_type_display: "Entity",
    columns: [],
    is_default: false,
    is_active: true,
    content_hash: "abc123",
    icon: "",
    color: "",
    ...overrides,
  };
}

describe("SchemaSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const registry = resetRegistry();
    registry.hydrateFromBackend(
      { colorPalette: STANDARD_COLORS, iconLibrary: STANDARD_ICONS },
      new Map(),
    );
    for (const ct of MOCK_COLUMN_TYPES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registry as any).columnTypes.set(ct.id, ct);
    }
  });

  // ── Loading & empty states ──────────────────────────────────────────

  it("shows loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<SchemaSettings />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders empty state when no schemas exist", async () => {
    mockGet.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("No schemas found.")).toBeInTheDocument();
    });
  });

  it("shows error state on API failure", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("hides default schemas from the list", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({ id: 1, name: "Default", is_default: true }),
      ])
      .mockResolvedValueOnce([]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("No schemas found.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
  });

  // ── Hero header ─────────────────────────────────────────────────────

  it("renders hero header with eyebrow, title, and description", async () => {
    mockGet.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("schema directory")).toBeInTheDocument();
    });
    expect(screen.getByText("Registry schemas")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Define the schemas that structure your entity data/,
      ),
    ).toBeInTheDocument();
  });

  it("renders '+ New schema' button in header actions", async () => {
    mockGet.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("+ New schema")).toBeInTheDocument();
    });
  });

  it("toggles new schema create form when '+ New schema' is clicked", async () => {
    mockGet.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("+ New schema")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("+ New schema"));
    expect(screen.getByPlaceholderText("e.g., Blood Sample")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(
      screen.queryByPlaceholderText("e.g., Blood Sample"),
    ).not.toBeInTheDocument();
  });

  // ── Master list ─────────────────────────────────────────────────────

  it("renders schemas in the master list", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({ id: 1, name: "Blood Sample", prefix: "BLOOD" }),
        makeSchema({ id: 2, name: "Patient", prefix: "PAT" }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    expect(screen.getByText("Patient")).toBeInTheDocument();
    expect(screen.getByText("BLOOD")).toBeInTheDocument();
    expect(screen.getByText("PAT")).toBeInTheDocument();
  });

  it("filters schemas by search", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({ id: 1, name: "Blood Sample", prefix: "BLOOD" }),
        makeSchema({ id: 2, name: "Patient", prefix: "PAT" }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    const searchInput = screen.getByPlaceholderText("Filter schemas");
    fireEvent.change(searchInput, { target: { value: "PAT" } });
    expect(screen.queryByText("Blood Sample")).not.toBeInTheDocument();
    expect(screen.getByText("Patient")).toBeInTheDocument();
  });

  it("toggles archived visibility", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({ id: 1, name: "Active Schema", is_active: true }),
        makeSchema({ id: 2, name: "Archived Schema", is_active: false }),
      ])
      .mockResolvedValueOnce([]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Active Schema")).toBeInTheDocument();
    });
    expect(screen.queryByText("Archived Schema")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("All"));
    expect(screen.getByText("Archived Schema")).toBeInTheDocument();
  });

  it("shows dirty indicator on rows with pending edits", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({
          id: 1,
          name: "Blood Sample",
          prefix: "BLOOD",
          columns: [{ name: "Volume", type: "number" }],
        }),
        makeSchema({ id: 2, name: "Patient", prefix: "PAT" }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Blood Sample"));
    await waitFor(() => {
      expect(screen.getByText("Schema definition")).toBeInTheDocument();
    });
    const dirtyRow = screen.getByText("Blood Sample").closest("button");
    const dot = dirtyRow?.querySelector(".bg-primary");
    expect(dot).not.toBeNull();
  });

  // ── Schema selection & detail cards ────────────────────────────────

  it("shows schema definition card when a schema is selected", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({
          id: 1,
          name: "Blood Sample",
          prefix: "BLOOD",
          columns: [{ name: "Volume", type: "number" }],
        }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Blood Sample"));
    await waitFor(() => {
      expect(screen.getByText("Schema definition")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Columns").length).toBeGreaterThanOrEqual(1);
    const nameInput = screen.getByDisplayValue("Blood Sample");
    expect(nameInput).toBeInTheDocument();
  });

  it("edits schema name, prefix, and description in definition card", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({
          id: 1,
          name: "Blood Sample",
          prefix: "BLOOD",
          columns: [],
        }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Blood Sample"));
    await waitFor(() => {
      expect(screen.getByText("Schema definition")).toBeInTheDocument();
    });
    const nameInput = screen.getByDisplayValue("Blood Sample");
    fireEvent.change(nameInput, { target: { value: "Updated Sample" } });
    expect(screen.getByDisplayValue("Updated Sample")).toBeInTheDocument();
    const descTextarea = screen.getByPlaceholderText(
      "Optional description of this schema…",
    );
    fireEvent.change(descTextarea, {
      target: { value: "A new description" },
    });
    expect(screen.getByDisplayValue("A new description")).toBeInTheDocument();
  });

  // ── Batch save ──────────────────────────────────────────────────────

  it("shows save bar when there are dirty edits", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({
          id: 1,
          name: "Blood Sample",
          prefix: "BLOOD",
          columns: [{ name: "Volume", type: "number" }],
        }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Blood Sample"));
    await waitFor(() => {
      expect(screen.getByText("Save Changes (1)")).toBeInTheDocument();
    });
  });

  it("commits all dirty edits on save", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({
          id: 1,
          name: "Blood Sample",
          prefix: "BLOOD",
          schema_type: 1,
          columns: [{ name: "Volume", type: "number" }],
        }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    mockPut.mockResolvedValue({});
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Blood Sample"));
    await waitFor(() => {
      expect(screen.getByText("Save Changes (1)")).toBeInTheDocument();
    });
    // Edit the name to make it dirty
    const nameInput = screen.getByDisplayValue("Blood Sample");
    fireEvent.change(nameInput, { target: { value: "Updated" } });

    fireEvent.click(screen.getByText("Save Changes (1)"));

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith("/schemas/1/", {
        name: "Updated",
        description: undefined,
        prefix: "BLOOD",
        schema_type: 1,
        columns: [{ name: "Volume", type: "number" }],
        icon: "",
        color: "",
      });
    });
  });

  it("shows dirty count for multiple schemas", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({
          id: 1,
          name: "Schema A",
          prefix: "A",
          columns: [{ name: "Col", type: "text" }],
        }),
        makeSchema({
          id: 2,
          name: "Schema B",
          prefix: "B",
          columns: [],
        }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Schema A")).toBeInTheDocument();
      expect(screen.getByText("Schema B")).toBeInTheDocument();
    });
    // Select first schema (marks it dirty)
    fireEvent.click(screen.getByText("Schema A"));
    // Select second schema (marks it dirty)
    fireEvent.click(screen.getByText("Schema B"));
    await waitFor(() => {
      expect(screen.getByText("Save Changes (2)")).toBeInTheDocument();
    });
  });

  // ── Columns card ────────────────────────────────────────────────────

  it("shows the implicit Name field as a read-only system row", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({
          id: 1,
          name: "Blood Sample",
          prefix: "BLOOD",
          columns: [{ name: "Volume", type: "number" }],
        }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Blood Sample"));
    await waitFor(() => {
      expect(screen.getByTestId("name-pseudo-column")).toBeInTheDocument();
    });
    const nameRow = screen.getByTestId("name-pseudo-column");
    expect(nameRow).toBeInTheDocument();
    const nameInput = nameRow.querySelector("input");
    expect(nameInput).toBeDisabled();
    expect(nameInput).toHaveValue("Name");
  });

  it("shows column type options from the registry", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({
          id: 1,
          name: "Blood Sample",
          prefix: "BLOOD",
          columns: [{ name: "Volume", type: "number" }],
        }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Blood Sample"));
    await waitFor(() => {
      expect(screen.getByTestId("name-pseudo-column")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Text").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Number").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Boolean").length).toBeGreaterThanOrEqual(1);
  });

  // ── Error & edge cases ──────────────────────────────────────────────

  it("shows placeholder when no schema is selected", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({ id: 1, name: "Blood Sample", prefix: "BLOOD" }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Select a schema from the list/),
    ).toBeInTheDocument();
  });

  it("deselects schema when clicked again", async () => {
    mockGet
      .mockResolvedValueOnce([
        makeSchema({
          id: 1,
          name: "Blood Sample",
          prefix: "BLOOD",
          columns: [],
        }),
      ])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Blood Sample"));
    await waitFor(() => {
      expect(screen.getByText("Schema definition")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Blood Sample"));
    await waitFor(() => {
      expect(
        screen.getByText(/Select a schema from the list/),
      ).toBeInTheDocument();
    });
  });

  it("does not render DangerZone elements", async () => {
    mockGet
      .mockResolvedValueOnce([makeSchema()])
      .mockResolvedValueOnce([]);
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    });
    expect(screen.queryByText("Danger Zone")).not.toBeInTheDocument();
    expect(screen.queryByText("DELETE ALL")).not.toBeInTheDocument();
  });

  it("creates a schema via the new schema form", async () => {
    mockGet
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 1, display_name: "Entity", workspace_id: "lims", is_active: true, schema_type_id: "lims.entity" },
      ]);
    mockPost.mockResolvedValue({});
    render(<SchemaSettings />);
    await waitFor(() => {
      expect(screen.getByText("+ New schema")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("+ New schema"));
    fireEvent.change(screen.getByPlaceholderText("e.g., Blood Sample"), {
      target: { value: "Test Schema" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g., BLOOD"), {
      target: { value: "TS" },
    });
    fireEvent.click(screen.getByText("Create"));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/schemas/", {
        name: "Test Schema",
        prefix: "TS",
        schema_type: 1,
        columns: [],
        icon: "circle",
        color: "muted",
      });
    });
  });
});
