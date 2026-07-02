import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { EntityType } from "../../types";
import { makeEntityType, makeColumnDef, makeMockReferenceBadge } from "../../../../test/factories";
import TypeMasterPanel from "../TypeMasterPanel";

// Mock ReferenceBadge
vi.mock("../../../../components/ReferenceBadge", () => ({
  default: makeMockReferenceBadge(),
}));

const types = [
  makeEntityType({
    columns: [
      makeColumnDef(),
      makeColumnDef({ name: "hemolyzed", type: "Boolean" }),
    ],
  }),
  makeEntityType({
    id: 2,
    name: "Mice",
    prefix: "MICE",
    icon: "🐁",
    is_active: false,
    columns: [makeColumnDef({ name: "strain", type: "Text" })],
  }),
];

const dirtyEdits = new Map<number, EntityType>();

describe("TypeMasterPanel", () => {
  it("renders schemas heading", () => {
    render(
      <TypeMasterPanel
        types={types}
        selectedId={null}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.getByText("Schemas")).toBeInTheDocument();
  });

  it("renders active types by default", () => {
    render(
      <TypeMasterPanel
        types={types}
        selectedId={null}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    // Both should appear since we pass all types
    expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    expect(screen.getByText("Mice")).toBeInTheDocument();
  });

  it("shows empty message when there are no types", () => {
    render(
      <TypeMasterPanel
        types={[]}
        selectedId={null}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.getByText("No schemas found.")).toBeInTheDocument();
  });

  it("calls onSelect when a schema card is clicked", () => {
    const onSelect = vi.fn();
    render(
      <TypeMasterPanel
        types={types}
        selectedId={null}
        onSelect={onSelect}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    fireEvent.click(screen.getByText("Blood Sample"));
    expect(onSelect).toHaveBeenCalledWith(types[0]);
  });

  it("applies is-selected class to selected type", () => {
    const { container } = render(
      <TypeMasterPanel
        types={types}
        selectedId={1}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(container.querySelector(".schema-card.is-selected")).toBeInTheDocument();
  });

  it("shows inactive tag for inactive types", () => {
    render(
      <TypeMasterPanel
        types={types}
        selectedId={null}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows 'Edited' tag for dirty types", () => {
    const dirty = new Map<number, EntityType>();
    dirty.set(1, { ...types[0] });
    render(
      <TypeMasterPanel
        types={types}
        selectedId={null}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirty}
      />,
    );
    expect(screen.getByText("Edited")).toBeInTheDocument();
  });

  it("shows new schema form when showNew is true", () => {
    render(
      <TypeMasterPanel
        types={types}
        selectedId={null}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={true}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.getByPlaceholderText("e.g., Blood Sample")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g., BLOOD")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("does not show new schema form when showNew is false", () => {
    render(
      <TypeMasterPanel
        types={types}
        selectedId={null}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.queryByPlaceholderText("e.g., Blood Sample")).not.toBeInTheDocument();
  });

  it("disables Create button when name or prefix is empty", () => {
    render(
      <TypeMasterPanel
        types={types}
        selectedId={null}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={true}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.getByText("Create")).toBeDisabled();
  });

  it("calls onCreate when Create button is clicked", () => {
    const onCreate = vi.fn();
    render(
      <TypeMasterPanel
        types={types}
        selectedId={null}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={true}
        onToggleNew={vi.fn()}
        newName="Test"
        onNewNameChange={vi.fn()}
        newPrefix="TS"
        onNewPrefixChange={vi.fn()}
        onCreate={onCreate}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    fireEvent.click(screen.getByText("Create"));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("calls onToggleNew when '+' button is clicked", () => {
    const onToggleNew = vi.fn();
    render(
      <TypeMasterPanel
        types={types}
        selectedId={null}
        onSelect={vi.fn()}
        showArchived={false}
        onToggleArchived={vi.fn()}
        showNew={false}
        onToggleNew={onToggleNew}
        newName=""
        onNewNameChange={vi.fn()}
        newPrefix=""
        onNewPrefixChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    fireEvent.click(screen.getByText("+"));
    expect(onToggleNew).toHaveBeenCalledOnce();
  });
});
