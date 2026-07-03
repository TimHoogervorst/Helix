import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DangerZone from "../DangerZone";

describe("DangerZone", () => {
  it("renders danger zone heading", () => {
    render(
      <DangerZone
        dangerLoading={null}
        dangerResult={null}
        onDeleteAllElms={vi.fn()}
        onDeleteAllEntities={vi.fn()}
        onDeleteEverything={vi.fn()}
      />,
    );
    expect(screen.getByText("⚠️ Danger Zone")).toBeInTheDocument();
  });

  it("renders all three delete buttons", () => {
    render(
      <DangerZone
        dangerLoading={null}
        dangerResult={null}
        onDeleteAllElms={vi.fn()}
        onDeleteAllEntities={vi.fn()}
        onDeleteEverything={vi.fn()}
      />,
    );
    expect(screen.getByText("🗑️ DELETE ALL ELNs")).toBeInTheDocument();
    expect(screen.getByText("🗑️ DELETE ALL ENTITIES")).toBeInTheDocument();
    expect(screen.getByText("💀 DELETE EVERYTHING")).toBeInTheDocument();
  });

  it("disables all buttons when a delete is in flight", () => {
    render(
      <DangerZone
        dangerLoading="elns"
        dangerResult={null}
        onDeleteAllElms={vi.fn()}
        onDeleteAllEntities={vi.fn()}
        onDeleteEverything={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }
  });

  it("shows 'Deleting…' text for active operation", () => {
    render(
      <DangerZone
        dangerLoading="elns"
        dangerResult={null}
        onDeleteAllElms={vi.fn()}
        onDeleteAllEntities={vi.fn()}
        onDeleteEverything={vi.fn()}
      />,
    );
    expect(screen.getByText("Deleting…")).toBeInTheDocument();
  });

  it("shows danger result message when present", () => {
    render(
      <DangerZone
        dangerLoading={null}
        dangerResult="All ELN entries deleted."
        onDeleteAllElms={vi.fn()}
        onDeleteAllEntities={vi.fn()}
        onDeleteEverything={vi.fn()}
      />,
    );
    expect(screen.getByText("All ELN entries deleted.")).toBeInTheDocument();
  });

  it("uses error class for failed results", () => {
    const { container } = render(
      <DangerZone
        dangerLoading={null}
        dangerResult="Failed: something went wrong"
        onDeleteAllElms={vi.fn()}
        onDeleteAllEntities={vi.fn()}
        onDeleteEverything={vi.fn()}
      />,
    );
    expect(container.querySelector(".error")).toBeInTheDocument();
  });

  it("uses success class for non-failed results", () => {
    const { container } = render(
      <DangerZone
        dangerLoading={null}
        dangerResult="All entities deleted."
        onDeleteAllElms={vi.fn()}
        onDeleteAllEntities={vi.fn()}
        onDeleteEverything={vi.fn()}
      />,
    );
    expect(container.querySelector(".danger-success")).toBeInTheDocument();
  });

  it("calls the correct handler on button click", () => {
    const onDeleteElms = vi.fn();
    const onDeleteEntities = vi.fn();
    const onDeleteEverything = vi.fn();

    render(
      <DangerZone
        dangerLoading={null}
        dangerResult={null}
        onDeleteAllElms={onDeleteElms}
        onDeleteAllEntities={onDeleteEntities}
        onDeleteEverything={onDeleteEverything}
      />,
    );

    fireEvent.click(screen.getByText("🗑️ DELETE ALL ELNs"));
    expect(onDeleteElms).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("🗑️ DELETE ALL ENTITIES"));
    expect(onDeleteEntities).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("💀 DELETE EVERYTHING"));
    expect(onDeleteEverything).toHaveBeenCalledOnce();
  });
});
