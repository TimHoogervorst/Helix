import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { mockGet, mockPost, mockDel, mockGetColumnType } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDel: vi.fn(),
  mockGetColumnType: vi.fn(),
}));

vi.mock("../../../../shell/src/api/client", () => ({ get: mockGet, post: mockPost, del: mockDel }));
vi.mock("../../../../shell/src/mod-system/ModRegistry", () => ({
  ModRegistry: { getInstance: () => ({ getColumnType: mockGetColumnType }) },
}));

import { ResultTableContent } from "../ResultTableNode";

const schema = {
  id: 7,
  name: "Assay Result",
  prefix: "ASSAY",
  is_active: true,
  is_default: false,
  content_hash: "hash-1",
  tags: ["ResultTable"],
  columns: [
    { id: "entity", name: "Entity", type: "reference", referenceSchemaTypeId: 3 },
    { id: "amount", name: "Amount", type: "number" },
    { id: "total", name: "Total", type: "formula", expression: "[Amount] * 2", resultType: "number" },
  ],
};

const props = (attrs: Record<string, unknown> = {}) => ({
  schemaId: null,
  schemaName: null,
  schemaContentHash: null,
  title: "Result Table",
  columns: [],
  rows: [],
  updateAttrs: vi.fn(),
  ...attrs,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetColumnType.mockImplementation((type: string) => ({
    operandShape: type === "number" ? "number" : type === "reference" ? "entity-picker" : "text",
    defaultValue: type === "number" ? 0 : "",
  }));
});

describe("ResultTableContent", () => {
  it("offers only ResultTable-tagged schemas", async () => {
    mockGet.mockResolvedValue([schema, { ...schema, id: 8, name: "Entity", tags: ["RegistrationTable"] }]);
    render(<ResultTableContent {...props()} />);
    fireEvent.click(screen.getByTestId("result-load-schema-btn"));
    await waitFor(() => expect(screen.getByTestId("result-schema-option-7")).toBeInTheDocument());
    expect(screen.queryByTestId("result-schema-option-8")).not.toBeInTheDocument();
  });

  it("computes formula columns and locks the source after registration", async () => {
    const updateAttrs = vi.fn();
    const row = { entityId: 10, displayId: "ASSAY1", sourceEntityId: "BLOOD1", values: { Amount: 5 }, isRegistered: true, lastRegisteredValueHash: null, registrationError: null };
    render(<ResultTableContent {...props({ schemaId: 7, schemaName: "Assay Result", schemaContentHash: "hash-1", columns: schema.columns, rows: [row], updateAttrs })} />);
    expect(screen.getByTestId("result-cell-ASSAY1-Total")).toHaveTextContent("10");
    expect(screen.getByTestId("result-entity-cell-ASSAY1")).toBeDisabled();
  });

  it("constrains the Entity picker to the configured schema type", async () => {
    const updateAttrs = vi.fn();
    mockGet.mockResolvedValue({ results: [{ display_id: "BLOOD1", name: "Sample", icon: "", color: "", schema_name: "Blood", workspace_id: "lims" }] });
    const row = { entityId: null, displayId: "#new-1", sourceEntityId: "", values: { Amount: 5 }, isRegistered: false, lastRegisteredValueHash: null, registrationError: null };
    render(<ResultTableContent {...props({ schemaId: 7, schemaName: "Assay Result", schemaContentHash: "hash-1", columns: schema.columns, rows: [row], updateAttrs })} />);
    fireEvent.click(screen.getByTestId("result-entity-cell-#new-1"));
    fireEvent.change(screen.getByTestId("ref-search-input"), { target: { value: "BLOOD" } });
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith(expect.stringContaining("schema_type=3")));
    fireEvent.click(await screen.findByTestId("ref-result-BLOOD1"));
    expect(updateAttrs).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ sourceEntityId: "BLOOD1" })] }));
  });

  it("batch-registers results with a derived name and formula values", async () => {
    const updateAttrs = vi.fn();
    mockPost.mockResolvedValue({ results: [{ row_index: 0, entity_id: 22, display_id: "ASSAY1" }], errors: [] });
    const row = { entityId: null, displayId: "#new-1", sourceEntityId: "BLOOD1", values: { Amount: 5 }, isRegistered: false, lastRegisteredValueHash: null, registrationError: null };
    render(<ResultTableContent {...props({ schemaId: 7, schemaName: "Assay Result", schemaContentHash: "hash-1", columns: schema.columns, rows: [row], updateAttrs })} />);
    fireEvent.click(screen.getByTestId("result-register-btn"));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/lims/entities/batch-register/", expect.objectContaining({
      rows: [expect.objectContaining({ name: "BLOOD1 — Assay Result", values: { Entity: "BLOOD1", Amount: 5, Total: 10 } })],
    })));
    expect(updateAttrs).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ entityId: 22, displayId: "ASSAY1", isRegistered: true })] }));
  });
});
