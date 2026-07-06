import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ColumnEditor from "../ColumnEditor";
import { makeColumnDef } from "../../../../test/factories";

const columns = [
  makeColumnDef({ required: true }),
  makeColumnDef({ name: "notes", type: "Text", required: false }),
];

describe("ColumnEditor", () => {
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
});
