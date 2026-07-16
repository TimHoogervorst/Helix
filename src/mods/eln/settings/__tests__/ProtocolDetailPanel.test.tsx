import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Protocol } from "../../types";
import ProtocolDetailPanel from "../ProtocolDetailPanel";

const liveProtocol: Protocol = {
  id: 1,
  name: "CRISPR RNP Transfection",
  items: [
    { type: "step", text: "Prepare the reaction mix." },
    { type: "note", text: "Use fresh reagents." },
  ],
  is_active: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-02T00:00:00Z",
};

const editingProtocol: Protocol = {
  ...liveProtocol,
  items: liveProtocol.items.map((item) => ({ ...item })),
};

describe("ProtocolDetailPanel", () => {
  it("renders the protocol name in the header", () => {
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(
      screen.getByText("CRISPR RNP Transfection"),
    ).toBeInTheDocument();
  });

  it("renders the status", () => {
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows item count", () => {
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    // There are 2 items — the individual "2" in detail-field + the items heading
    const itemsCount = screen.getAllByText("2");
    expect(itemsCount.length).toBeGreaterThan(0);
  });

  it("renders item type badges", () => {
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText("step")).toBeInTheDocument();
    expect(screen.getByText("note")).toBeInTheDocument();
  });

  it("renders item text inputs with correct values", () => {
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const inputs = screen.getAllByRole("textbox");
    // Name input + 2 item text inputs = 3
    expect(inputs).toHaveLength(3);
    expect(inputs[1]).toHaveValue("Prepare the reaction mix.");
    expect(inputs[2]).toHaveValue("Use fresh reagents.");
  });

  it("renders Add Step and Add Note buttons", () => {
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText("+ Step")).toBeInTheDocument();
    expect(screen.getByText("+ Note")).toBeInTheDocument();
  });

  it("calls onAddItem when Add Step is clicked", () => {
    const onAddItem = vi.fn();
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={onAddItem}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("+ Step"));
    expect(onAddItem).toHaveBeenCalledWith("step");
  });

  it("calls onAddItem when Add Note is clicked", () => {
    const onAddItem = vi.fn();
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={onAddItem}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("+ Note"));
    expect(onAddItem).toHaveBeenCalledWith("note");
  });

  it("calls onUpdateItem when item text changes", () => {
    const onUpdateItem = vi.fn();
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={onUpdateItem}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[1], {
      target: { value: "Updated step text" },
    });
    expect(onUpdateItem).toHaveBeenCalledWith(0, "text", "Updated step text");
  });

  it("calls onRemoveItem when delete button is clicked", () => {
    const onRemoveItem = vi.fn();
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={onRemoveItem}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const deleteBtns = screen.getAllByTitle("Remove item");
    fireEvent.click(deleteBtns[0]);
    expect(onRemoveItem).toHaveBeenCalledWith(0);
  });

  it("calls onMoveItem with correct direction", () => {
    const onMoveItem = vi.fn();
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={onMoveItem}
        onDiscard={vi.fn()}
      />,
    );
    const downButtons = screen.getAllByTitle("Move down");
    fireEvent.click(downButtons[0]);
    expect(onMoveItem).toHaveBeenCalledWith(0, "down");

    const upButtons = screen.getAllByTitle("Move up");
    fireEvent.click(upButtons[1]); // second item up
    expect(onMoveItem).toHaveBeenCalledWith(1, "up");
  });

  it("disables up button for the first item", () => {
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const upButtons = screen.getAllByTitle("Move up");
    expect(upButtons[0]).toBeDisabled();
  });

  it("disables down button for the last item", () => {
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const downButtons = screen.getAllByTitle("Move down");
    expect(downButtons[1]).toBeDisabled();
  });

  it("calls onDelete when trash button is clicked", () => {
    const onDelete = vi.fn();
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={onDelete}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTitle("Deactivate protocol"));
    expect(onDelete).toHaveBeenCalledWith(liveProtocol);
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={onClose}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    const closeBtn = container.querySelector(".type-detail-close")!;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows discard button when dirty", () => {
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={true}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.getByText("Discard changes")).toBeInTheDocument();
  });

  it("does not show discard button when clean", () => {
    render(
      <ProtocolDetailPanel
        liveProtocol={liveProtocol}
        editingProtocol={editingProtocol}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(screen.queryByText("Discard changes")).not.toBeInTheDocument();
  });

  it("shows empty state message when there are no items", () => {
    const emptyLive = { ...liveProtocol, items: [] };
    const emptyEditing = { ...editingProtocol, items: [] };
    render(
      <ProtocolDetailPanel
        liveProtocol={emptyLive}
        editingProtocol={emptyEditing}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "No items yet. Add a step or note to get started.",
      ),
    ).toBeInTheDocument();
  });

  it("hides delete button for inactive protocols", () => {
    const inactiveProtocol = { ...liveProtocol, is_active: false };
    const inactiveEditing = { ...editingProtocol, is_active: false };
    render(
      <ProtocolDetailPanel
        liveProtocol={inactiveProtocol}
        editingProtocol={inactiveEditing}
        isDirty={false}
        onClose={vi.fn()}
        onDelete={vi.fn()}
        onNameChange={vi.fn()}
        onAddItem={vi.fn()}
        onUpdateItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onMoveItem={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );
    expect(
      screen.queryByTitle("Deactivate protocol"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });
});
