import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TypeDetailPanel from "../TypeDetailPanel";
import type { EntityType } from "../../../types/lims";

// Mock ReferenceBadge
vi.mock("../../../components/ReferenceBadge", () => ({
  default: ({ displayId }: { displayId: string }) => (
    <span data-testid="ref-badge">{displayId}</span>
  ),
}));

const liveEntity: EntityType = {
  id: 1,
  name: "Blood Sample",
  prefix: "BLOOD",
  icon: "🩸",
  is_active: true,
  columns: [
    { name: "volume", type: "Number", required: true },
    { name: "hemolyzed", type: "Boolean" },
  ],
};

const editingEntity: EntityType = {
  ...liveEntity,
  columns: liveEntity.columns.map((c) => ({ ...c })),
};

const columnProps = {
  columns: editingEntity.columns,
  onAdd: vi.fn(),
  onUpdate: vi.fn(),
  onRemove: vi.fn(),
  onMove: vi.fn(),
  onDiscard: vi.fn(),
};

describe("TypeDetailPanel", () => {
  it("renders the schema name", () => {
    render(
      <TypeDetailPanel
        liveEntity={liveEntity}
        editingEntity={editingEntity}
        isDirty={false}
        onClose={vi.fn()}
        onDeactivate={vi.fn()}
        onSetEmoji={vi.fn()}
        columnProps={columnProps}
      />,
    );
    expect(screen.getByText("Blood Sample")).toBeInTheDocument();
  });

  it("renders status field", () => {
    render(
      <TypeDetailPanel
        liveEntity={liveEntity}
        editingEntity={editingEntity}
        isDirty={false}
        onClose={vi.fn()}
        onDeactivate={vi.fn()}
        onSetEmoji={vi.fn()}
        columnProps={columnProps}
      />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders column count", () => {
    render(
      <TypeDetailPanel
        liveEntity={liveEntity}
        editingEntity={editingEntity}
        isDirty={false}
        onClose={vi.fn()}
        onDeactivate={vi.fn()}
        onSetEmoji={vi.fn()}
        columnProps={columnProps}
      />,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the column editor with column names", () => {
    render(
      <TypeDetailPanel
        liveEntity={liveEntity}
        editingEntity={editingEntity}
        isDirty={false}
        onClose={vi.fn()}
        onDeactivate={vi.fn()}
        onSetEmoji={vi.fn()}
        columnProps={columnProps}
      />,
    );
    expect(screen.getByDisplayValue("volume")).toBeInTheDocument();
    expect(screen.getByDisplayValue("hemolyzed")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <TypeDetailPanel
        liveEntity={liveEntity}
        editingEntity={editingEntity}
        isDirty={false}
        onClose={onClose}
        onDeactivate={vi.fn()}
        onSetEmoji={vi.fn()}
        columnProps={columnProps}
      />,
    );
    const closeBtn = container.querySelector(".console-detail-close")!;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows deactivate button for active entities", () => {
    render(
      <TypeDetailPanel
        liveEntity={liveEntity}
        editingEntity={editingEntity}
        isDirty={false}
        onClose={vi.fn()}
        onDeactivate={vi.fn()}
        onSetEmoji={vi.fn()}
        columnProps={columnProps}
      />,
    );
    expect(screen.getByTitle("Deactivate schema")).toBeInTheDocument();
  });

  it("hides deactivate button for inactive entities", () => {
    const inactiveEntity = { ...liveEntity, is_active: false };
    const inactiveEditing = { ...editingEntity, is_active: false };
    render(
      <TypeDetailPanel
        liveEntity={inactiveEntity}
        editingEntity={inactiveEditing}
        isDirty={false}
        onClose={vi.fn()}
        onDeactivate={vi.fn()}
        onSetEmoji={vi.fn()}
        columnProps={{ ...columnProps, columns: inactiveEditing.columns }}
      />,
    );
    expect(screen.queryByTitle("Deactivate schema")).not.toBeInTheDocument();
  });

  it("calls onDeactivate when deactivate button is clicked", () => {
    const onDeactivate = vi.fn();
    render(
      <TypeDetailPanel
        liveEntity={liveEntity}
        editingEntity={editingEntity}
        isDirty={false}
        onClose={vi.fn()}
        onDeactivate={onDeactivate}
        onSetEmoji={vi.fn()}
        columnProps={columnProps}
      />,
    );
    fireEvent.click(screen.getByTitle("Deactivate schema"));
    expect(onDeactivate).toHaveBeenCalledWith(liveEntity);
  });
});
