import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Schema } from "../../types";
import { makeSchema, makeColumnDef, makeMockMentionBadge } from "../../../../shell/src/test/factories";
import TypeDetailPanel from "../TypeDetailPanel";

// Mock MentionBadge
vi.mock("../../../../shared/components/MentionBadge", () => ({
  default: makeMockMentionBadge(),
}));

const liveSchema: Schema = makeSchema({
  schema_type_display: "Entity",
  columns: [
    makeColumnDef({ required: true }),
    makeColumnDef({ name: "hemolyzed", type: "Boolean" }),
  ],
});

const editingSchema: Schema = {
  ...liveSchema,
  columns: liveSchema.columns.map((c) => ({ ...c })),
};

const noop = vi.fn();

const columnProps = {
  columns: editingSchema.columns,
  onAdd: vi.fn(),
  onUpdate: vi.fn(),
  onRemove: vi.fn(),
  onMove: vi.fn(),
  onDiscard: vi.fn(),
};

const defaultProps = {
  liveSchema,
  editingSchema,
  isDirty: false,
  onClose: vi.fn(),
  onDeactivate: vi.fn(),
  onReactivate: vi.fn(),
  columnProps,
};

describe("TypeDetailPanel", () => {
  it("renders the schema name", () => {
    render(<TypeDetailPanel {...defaultProps} />);
    expect(screen.getByText("Blood Sample")).toBeInTheDocument();
  });

  it("renders schema type display", () => {
    render(<TypeDetailPanel {...defaultProps} />);
    expect(screen.getByText("Entity")).toBeInTheDocument();
  });

  it("renders status field", () => {
    render(<TypeDetailPanel {...defaultProps} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders column count", () => {
    render(<TypeDetailPanel {...defaultProps} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the column editor with column names", () => {
    render(<TypeDetailPanel {...defaultProps} />);
    expect(screen.getByDisplayValue("volume")).toBeInTheDocument();
    expect(screen.getByDisplayValue("hemolyzed")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <TypeDetailPanel {...defaultProps} onClose={onClose} />,
    );
    const closeBtn = container.querySelector(".type-detail-close")!;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows deactivate button for active schemas (including default schemas)", () => {
    render(<TypeDetailPanel {...defaultProps} />);
    expect(screen.getByTitle("Deactivate schema")).toBeInTheDocument();
  });

  it("shows reactivate button for inactive schemas", () => {
    const inactiveSchema = { ...liveSchema, is_active: false };
    const inactiveEditing = { ...editingSchema, is_active: false };
    render(
      <TypeDetailPanel
        {...defaultProps}
        liveSchema={inactiveSchema}
        editingSchema={inactiveEditing}
        columnProps={{ ...columnProps, columns: inactiveEditing.columns }}
      />,
    );
    expect(screen.getByTitle("Reactivate schema")).toBeInTheDocument();
    expect(screen.queryByTitle("Deactivate schema")).not.toBeInTheDocument();
  });

  it("calls onDeactivate when deactivate button is clicked", () => {
    const onDeactivate = vi.fn();
    render(
      <TypeDetailPanel {...defaultProps} onDeactivate={onDeactivate} />,
    );
    fireEvent.click(screen.getByTitle("Deactivate schema"));
    expect(onDeactivate).toHaveBeenCalledWith(liveSchema);
  });

  it("calls onReactivate when reactivate button is clicked", () => {
    const onReactivate = vi.fn();
    const inactiveSchema = { ...liveSchema, is_active: false };
    const inactiveEditing = { ...editingSchema, is_active: false };
    render(
      <TypeDetailPanel
        {...defaultProps}
        liveSchema={inactiveSchema}
        editingSchema={inactiveEditing}
        onReactivate={onReactivate}
        columnProps={{ ...columnProps, columns: inactiveEditing.columns }}
      />,
    );
    fireEvent.click(screen.getByTitle("Reactivate schema"));
    expect(onReactivate).toHaveBeenCalledWith(inactiveSchema);
  });

  it("shows system badge for default schemas", () => {
    const defaultSchema = { ...liveSchema, is_default: true };
    const defaultEditing = { ...editingSchema, is_default: true };
    render(
      <TypeDetailPanel
        {...defaultProps}
        liveSchema={defaultSchema}
        editingSchema={defaultEditing}
        columnProps={{ ...columnProps, columns: defaultEditing.columns }}
      />,
    );
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("shows system note for default schema prefix", () => {
    const defaultSchema = { ...liveSchema, is_default: true };
    const defaultEditing = { ...editingSchema, is_default: true };
    render(
      <TypeDetailPanel
        {...defaultProps}
        liveSchema={defaultSchema}
        editingSchema={defaultEditing}
        columnProps={{ ...columnProps, columns: defaultEditing.columns }}
      />,
    );
    expect(screen.getByText("Auto-generated (system default)")).toBeInTheDocument();
  });
});
