import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ColumnEditor from "../ColumnEditor";
import { makeColumnDef } from "../../../test/factories";

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
    // ▲ for the second row (index 1) — the first row's ▲ is disabled
    const upButtons = screen.getAllByTitle("Move up");
    fireEvent.click(upButtons[1]); // second row
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
    fireEvent.click(downButtons[0]); // first row
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
    expect(downButtons[1]).toBeDisabled();
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
});
