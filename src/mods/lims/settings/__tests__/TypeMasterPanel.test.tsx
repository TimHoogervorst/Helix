import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Schema } from "../../types";
import { makeSchema, makeColumnDef, makeSchemaType, makeMockMentionBadge } from "../../../../shell/src/test/factories";
import TypeMasterPanel from "../TypeMasterPanel";

// Mock MentionBadge
vi.mock("../../../../shared/components/MentionBadge", () => ({
  default: makeMockMentionBadge(),
}));

const schemaTypes = [
  makeSchemaType(),
  makeSchemaType({ id: 2, display_name: "ELN Entry", workspace_id: "eln" }),
];

const schemas: Schema[] = [
  makeSchema({
    columns: [
      makeColumnDef(),
      makeColumnDef({ name: "hemolyzed", type: "boolean" }),
    ],
  }),
  makeSchema({
    id: 2,
    name: "Mice",
    prefix: "MICE",
    is_active: false,
    columns: [makeColumnDef({ name: "strain", type: "text" })],
  }),
  makeSchema({
    id: 3,
    name: "Default",
    prefix: "E",
    is_default: true,
    columns: [],
  }),
];

const dirtyEdits = new Map<number, Schema>();

describe("TypeMasterPanel", () => {
  it("renders schemas heading", () => {
    render(
      <TypeMasterPanel
        schemas={schemas}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
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
        schemas={schemas}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.getByText("Blood Sample")).toBeInTheDocument();
    expect(screen.getByText("Mice")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("shows empty message when there are no types", () => {
    render(
      <TypeMasterPanel
        schemas={[]}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={[]}
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
        schemas={schemas}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    fireEvent.click(screen.getByText("Blood Sample"));
    expect(onSelect).toHaveBeenCalledWith(schemas[0]);
  });

  it("applies is-selected class to selected type", () => {
    const { container } = render(
      <TypeMasterPanel
        schemas={schemas}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
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
        schemas={schemas}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows 'Edited' tag for dirty types", () => {
    const dirty = new Map<number, Schema>();
    dirty.set(1, { ...schemas[0] });
    render(
      <TypeMasterPanel
        schemas={schemas}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirty}
      />,
    );
    expect(screen.getByText("Edited")).toBeInTheDocument();
  });

  it("shows System badge for default schemas", () => {
    render(
      <TypeMasterPanel
        schemas={schemas}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    // The default schema (id=3) should show a "System" badge
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("shows new schema form with schema type dropdown", () => {
    render(
      <TypeMasterPanel
        schemas={schemas}
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
        newSchemaType={1}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.getByPlaceholderText("e.g., Blood Sample")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g., BLOOD")).toBeInTheDocument();
    expect(screen.getByText("Schema Type")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("disables Create button when schema type is not selected", () => {
    render(
      <TypeMasterPanel
        schemas={schemas}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.getByText("Create")).toBeDisabled();
  });

  it("does not show new schema form when showNew is false", () => {
    render(
      <TypeMasterPanel
        schemas={schemas}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    expect(screen.queryByPlaceholderText("e.g., Blood Sample")).not.toBeInTheDocument();
  });

  it("calls onCreate when Create button is clicked", () => {
    const onCreate = vi.fn();
    render(
      <TypeMasterPanel
        schemas={schemas}
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
        newSchemaType={1}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
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
        schemas={schemas}
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
        newSchemaType={null}
        onNewSchemaTypeChange={vi.fn()}
        schemaTypes={schemaTypes}
        onCreate={vi.fn()}
        saving={false}
        dirtyEdits={dirtyEdits}
      />,
    );
    fireEvent.click(screen.getByText("+"));
    expect(onToggleNew).toHaveBeenCalledOnce();
  });
});
