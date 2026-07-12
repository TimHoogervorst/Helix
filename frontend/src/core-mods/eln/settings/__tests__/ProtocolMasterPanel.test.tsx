import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Protocol } from "../../types";
import ProtocolMasterPanel from "../ProtocolMasterPanel";

const protocols: Protocol[] = [
  {
    id: 1,
    name: "CRISPR RNP Transfection",
    items: [
      { type: "step", text: "Prepare the reaction mix." },
      { type: "note", text: "Use fresh reagents." },
      { type: "step", text: "Incubate at 37°C for 30 min." },
    ],
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  },
  {
    id: 2,
    name: "qPCR Setup",
    items: [],
    is_active: false,
    created_at: "2025-01-02T00:00:00Z",
    updated_at: "2025-01-02T00:00:00Z",
  },
];

describe("ProtocolMasterPanel", () => {
  it("renders protocols heading", () => {
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    expect(screen.getByText("Protocols")).toBeInTheDocument();
  });

  it("renders protocol names and item counts", () => {
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    expect(screen.getByText("CRISPR RNP Transfection")).toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
    expect(screen.getByText("qPCR Setup")).toBeInTheDocument();
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });

  it("shows empty message when there are no protocols", () => {
    render(
      <ProtocolMasterPanel
        protocols={[]}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    expect(screen.getByText("No protocols found.")).toBeInTheDocument();
  });

  it("calls onSelect when a protocol card is clicked", () => {
    const onSelect = vi.fn();
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={onSelect}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    fireEvent.click(screen.getByText("CRISPR RNP Transfection"));
    expect(onSelect).toHaveBeenCalledWith(protocols[0]);
  });

  it("applies is-selected class to selected protocol", () => {
    const { container } = render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={1}
        onSelect={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    expect(
      container.querySelector(".schema-card.is-selected"),
    ).toBeInTheDocument();
  });

  it("shows inactive tag for inactive protocols", () => {
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows 'Edited' tag for dirty protocols", () => {
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set([1])}
      />,
    );
    expect(screen.getByText("Edited")).toBeInTheDocument();
  });

  it("shows new protocol form when showNew is true", () => {
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={true}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    expect(
      screen.getByPlaceholderText("e.g., CRISPR RNP Transfection"),
    ).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("does not show new protocol form when showNew is false", () => {
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={false}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    expect(
      screen.queryByPlaceholderText("e.g., CRISPR RNP Transfection"),
    ).not.toBeInTheDocument();
  });

  it("disables Create button when name is empty", () => {
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={true}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    expect(screen.getByText("Create")).toBeDisabled();
  });

  it("calls onCreate when Create button is clicked", () => {
    const onCreate = vi.fn();
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={true}
        onToggleNew={vi.fn()}
        newName="My Protocol"
        onNewNameChange={vi.fn()}
        onCreate={onCreate}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    fireEvent.click(screen.getByText("Create"));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("calls onToggleNew when '+' button is clicked", () => {
    const onToggleNew = vi.fn();
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={false}
        onToggleNew={onToggleNew}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    fireEvent.click(screen.getByText("+"));
    expect(onToggleNew).toHaveBeenCalledOnce();
  });

  it("shows 'Cancel' on toggle button when form is open", () => {
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={true}
        onToggleNew={vi.fn()}
        newName=""
        onNewNameChange={vi.fn()}
        onCreate={vi.fn()}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls onCreate when Enter is pressed in the name input", () => {
    const onCreate = vi.fn();
    render(
      <ProtocolMasterPanel
        protocols={protocols}
        selectedId={null}
        onSelect={vi.fn()}
        showNew={true}
        onToggleNew={vi.fn()}
        newName="My Protocol"
        onNewNameChange={vi.fn()}
        onCreate={onCreate}
        saving={false}
        dirtyIds={new Set()}
      />,
    );
    fireEvent.keyDown(
      screen.getByPlaceholderText("e.g., CRISPR RNP Transfection"),
      { key: "Enter" },
    );
    expect(onCreate).toHaveBeenCalledOnce();
  });
});
