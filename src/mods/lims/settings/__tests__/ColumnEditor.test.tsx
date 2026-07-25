import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ColumnEditor from "../ColumnEditor";
import { makeColumnDef } from "../../../../shell/src/test/factories";
import { ModRegistry } from "../../../../shell/src/mod-system/ModRegistry";
import type { BackendColumnType } from "../../../../shell/src/mod-system/ModRegistry";

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
    operators: [],
  },
  {
    id: "number",
    displayName: "Number",
    icon: "Hash",
    operandShape: "number",
    defaultValue: 0,
    operators: [],
  },
  {
    id: "date",
    displayName: "Date",
    icon: "Calendar",
    operandShape: "date",
    defaultValue: null,
    operators: [],
  },
  {
    id: "boolean",
    displayName: "Boolean",
    icon: "ToggleLeft",
    operandShape: "boolean",
    defaultValue: false,
    operators: [],
  },
  {
    id: "reference",
    displayName: "Reference",
    icon: "Link",
    operandShape: "entity-picker",
    defaultValue: null,
    operators: [],
  },
];

const columns = [
  makeColumnDef({ required: true }),
  makeColumnDef({ name: "notes", type: "text", required: false }),
];

describe("ColumnEditor", () => {
  beforeEach(() => {
    const registry = resetRegistry();
    // Hydrate column types into the registry
    for (const ct of MOCK_COLUMN_TYPES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registry as any).columnTypes.set(ct.id, ct);
    }
  });

  it("renders column rows", () => {
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue("volume")).toBeInTheDocument();
    expect(screen.getByDisplayValue("notes")).toBeInTheDocument();
  });

  it("shows column heading", () => {
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText("Columns")).toBeInTheDocument();
  });

  it("calls onAdd when '+ Add Column' is clicked", () => {
    const onAdd = vi.fn();
    render(
      <ColumnEditor
        columns={columns}
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("+ Add Column"));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("calls onDiscard when 'Discard Changes' is clicked", () => {
    const onDiscard = vi.fn();
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={onDiscard}
      />,
    );
    fireEvent.click(screen.getByText("Discard Changes"));
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("calls onUpdate when column name is changed", () => {
    const onUpdate = vi.fn();
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const input = screen.getByDisplayValue("volume");
    fireEvent.change(input, { target: { value: "new_name" } });
    expect(onUpdate).toHaveBeenCalledWith(0, "name", "new_name");
  });

  it("calls onRemove when '×' button is clicked", () => {
    const onRemove = vi.fn();
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={onRemove}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const removeButtons = screen.getAllByText("×");
    fireEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it("calls onMove with 'up' when ▲ is clicked", () => {
    const onMove = vi.fn();
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={onMove}
        onDiscard={vi.fn()}
      />,
    );
    // ▲ for the second user row — buttons order: [Name pseudo, user-0, user-1]
    const upButtons = screen.getAllByTitle("Move up");
    fireEvent.click(upButtons[2]); // second user row
    expect(onMove).toHaveBeenCalledWith(1, "up");
  });

  it("calls onMove with 'down' when ▼ is clicked", () => {
    const onMove = vi.fn();
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={onMove}
        onDiscard={vi.fn()}
      />,
    );
    const downButtons = screen.getAllByTitle("Move down");
    fireEvent.click(downButtons[1]); // first user row (index 0 is Name pseudo-column)
    expect(onMove).toHaveBeenCalledWith(0, "down");
  });

  it("disables ▲ for first row", () => {
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const upButtons = screen.getAllByTitle("Move up");
    expect(upButtons[0]).toBeDisabled();
  });

  it("disables ▼ for last row", () => {
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const downButtons = screen.getAllByTitle("Move down");
    expect(downButtons[2]).toBeDisabled(); // second user row is last (index 2), index 0 is Name pseudo-column
  });

  it("renders empty column list without errors", () => {
    render(
      <ColumnEditor
        columns={[]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText("Columns")).toBeInTheDocument();
    expect(screen.getByText("+ Add Column")).toBeInTheDocument();
  });

  // ── Name pseudo-column ──────────────────────────────────────────

  it("renders a gray Name pseudo-column row at the top", () => {
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const nameRow = screen.getByTestId("name-pseudo-column");
    expect(nameRow).toBeInTheDocument();
    // The Name input should be disabled
    const nameInput = nameRow.querySelector("input");
    expect(nameInput).toBeDisabled();
    expect(nameInput).toHaveValue("Name");
  });

  it("shows Name pseudo-column even when columns list is empty", () => {
    render(
      <ColumnEditor
        columns={[]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByTestId("name-pseudo-column")).toBeInTheDocument();
  });

  // ── Name collision blocking ─────────────────────────────────────

  it("shows alert and aborts when typing 'Name' into a user column", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const onUpdate = vi.fn();

    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const input = screen.getByDisplayValue("volume");
    fireEvent.change(input, { target: { value: "Name" } });

    expect(alertSpy).toHaveBeenCalledWith("Name is already a default column.");
    expect(onUpdate).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("shows alert when typing 'NAME' (uppercase)", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const onUpdate = vi.fn();

    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const input = screen.getByDisplayValue("volume");
    fireEvent.change(input, { target: { value: "NAME" } });

    expect(alertSpy).toHaveBeenCalledWith("Name is already a default column.");
    expect(onUpdate).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("shows alert when typing ' Name ' (with whitespace)", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const onUpdate = vi.fn();

    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const input = screen.getByDisplayValue("volume");
    fireEvent.change(input, { target: { value: " Name " } });

    expect(alertSpy).toHaveBeenCalledWith("Name is already a default column.");
    expect(onUpdate).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("allows valid column names that are not 'Name'", () => {
    const onUpdate = vi.fn();

    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const input = screen.getByDisplayValue("volume");
    fireEvent.change(input, { target: { value: "description" } });

    expect(onUpdate).toHaveBeenCalledWith(0, "name", "description");
  });

  // ── Registry-driven type dropdown ───────────────────────────────

  it("renders type options from the column type registry", () => {
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    // Each registry type's displayName appears in every user column
    // dropdown (2 rows × 5 types = 10 options). The Name pseudo-column
    // adds one extra "Text". Use getAllByText for types that appear
    // multiple times.
    expect(screen.getAllByText("Text").length).toBe(3); // pseudo + 2 rows
    expect(screen.getAllByText("Number").length).toBe(2); // 2 user rows
    expect(screen.getAllByText("Date").length).toBe(2);
    expect(screen.getAllByText("Boolean").length).toBe(2);
    expect(screen.getAllByText("Reference").length).toBe(2);
  });

  it("renders Name pseudo-column with 'text' type from registry", () => {
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const nameRow = screen.getByTestId("name-pseudo-column");
    const typeSelect = nameRow.querySelector("select");
    expect(typeSelect).toBeDisabled();
    expect(typeSelect).toHaveValue("text");
  });

  it("selects the correct type for a user-defined column", () => {
    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    // The "notes" column (index 1) has type "text"
    const typeSelects = screen.getAllByRole("combobox");
    // typeSelects[0] = Name pseudo-column (disabled, "text")
    // typeSelects[1] = column 0 ("volume" → "number" from factory default)
    // typeSelects[2] = column 1 ("notes" → "text")
    expect(typeSelects[1]).toHaveValue("number");
    expect(typeSelects[2]).toHaveValue("text");
  });

  it("allows changing a column's type via the dropdown", () => {
    const onUpdate = vi.fn();

    render(
      <ColumnEditor
        columns={columns}
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        onMove={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    const typeSelects = screen.getAllByRole("combobox");
    // Change column 0 from "number" to "boolean"
    fireEvent.change(typeSelects[1], { target: { value: "boolean" } });
    expect(onUpdate).toHaveBeenCalledWith(0, "type", "boolean");
  });
});
