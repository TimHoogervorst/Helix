import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DangerZone from "../DangerZone";

const noop = vi.fn();

const defaultProps = {
  dangerLoading: null as string | null,
  dangerResult: null as string | null,
  onDeleteAllElms: vi.fn(),
  onDeleteAllEntities: vi.fn(),
  onDeleteAllSchemas: vi.fn(),
  onDeleteEverything: vi.fn(),
};

describe("DangerZone", () => {
  it("renders danger zone heading", () => {
    render(<DangerZone {...defaultProps} />);
    expect(screen.getByText("⚠️ Danger Zone")).toBeInTheDocument();
  });

  it("renders all four delete buttons", () => {
    render(<DangerZone {...defaultProps} />);
    expect(screen.getByText("🗑️ DELETE ALL ELNs")).toBeInTheDocument();
    expect(screen.getByText("🗑️ DELETE ALL ENTITIES")).toBeInTheDocument();
    expect(screen.getByText("🗑️ DELETE ALL SCHEMAS")).toBeInTheDocument();
    expect(screen.getByText("💀 DELETE EVERYTHING")).toBeInTheDocument();
  });

  it("disables all buttons when a delete is in flight", () => {
    render(<DangerZone {...defaultProps} dangerLoading="elns" />);
    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  it("shows 'Deleting…' text for active operation", () => {
    render(<DangerZone {...defaultProps} dangerLoading="elns" />);
    expect(screen.getByText("Deleting…")).toBeInTheDocument();
  });

  it("shows danger result message when present", () => {
    render(
      <DangerZone
        {...defaultProps}
        dangerResult="All ELN entries deleted."
      />,
    );
    expect(screen.getByText("All ELN entries deleted.")).toBeInTheDocument();
  });

  it("uses error class for failed results", () => {
    const { container } = render(
      <DangerZone
        {...defaultProps}
        dangerResult="Failed: something went wrong"
      />,
    );
    expect(container.querySelector(".error")).toBeInTheDocument();
  });

  it("uses success class for non-failed results", () => {
    const { container } = render(
      <DangerZone {...defaultProps} dangerResult="All entities deleted." />,
    );
    expect(container.querySelector(".danger-success")).toBeInTheDocument();
  });

  it("calls the correct handler on button click", () => {
    const onDeleteElms = vi.fn();
    const onDeleteEntities = vi.fn();
    const onDeleteSchemas = vi.fn();
    const onDeleteEverything = vi.fn();

    render(
      <DangerZone
        {...defaultProps}
        onDeleteAllElms={onDeleteElms}
        onDeleteAllEntities={onDeleteEntities}
        onDeleteAllSchemas={onDeleteSchemas}
        onDeleteEverything={onDeleteEverything}
      />,
    );

    fireEvent.click(screen.getByText("🗑️ DELETE ALL ELNs"));
    expect(onDeleteElms).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("🗑️ DELETE ALL ENTITIES"));
    expect(onDeleteEntities).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("🗑️ DELETE ALL SCHEMAS"));
    expect(onDeleteSchemas).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("💀 DELETE EVERYTHING"));
    expect(onDeleteEverything).toHaveBeenCalledOnce();
  });
});
