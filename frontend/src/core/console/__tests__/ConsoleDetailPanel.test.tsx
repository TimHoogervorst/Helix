import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ConsoleDetailPanel from "../ConsoleDetailPanel";

function renderPanel(overrides: Record<string, unknown> = {}) {
  const defaults = {
    viewState: "detail" as const,
    onClose: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return render(
    <MemoryRouter>
      <ConsoleDetailPanel {...props}>
        <div data-testid="child">Content</div>
      </ConsoleDetailPanel>
    </MemoryRouter>,
  );
}

describe("ConsoleDetailPanel", () => {
  it("renders children", () => {
    renderPanel();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders close button and fires onClose", () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    const btn = screen.getByRole("button", { name: "Close detail" });
    expect(btn).toHaveAttribute("aria-label", "Close detail");
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders expand link when expandUrl is provided and viewState is detail", () => {
    renderPanel({ expandUrl: "/lims/TEST1" });
    const link = screen.getByRole("link", { name: "Open in workspace" });
    expect(link).toHaveAttribute("aria-label", "Open in workspace");
    expect(link.getAttribute("href")).toBe("/lims/TEST1");
  });

  it("renders expand button when onExpand is provided (no expandUrl)", () => {
    const onExpand = vi.fn();
    renderPanel({ onExpand });
    const btn = screen.getByRole("button", { name: "Expand to full detail" });
    expect(btn).toHaveAttribute("aria-label", "Expand to full detail");
    fireEvent.click(btn);
    expect(onExpand).toHaveBeenCalled();
  });

  it("does not render expand action in expanded state", () => {
    renderPanel({ viewState: "expanded", expandUrl: "/lims/TEST1" });
    expect(screen.queryByTitle("Open in workspace")).not.toBeInTheDocument();
  });

  it("renders collapse button in expanded state", () => {
    const onCollapse = vi.fn();
    renderPanel({ viewState: "expanded", onCollapse });
    const btn = screen.getByRole("button", { name: "Collapse to summary" });
    expect(btn).toHaveAttribute("aria-label", "Collapse to summary");
    fireEvent.click(btn);
    expect(onCollapse).toHaveBeenCalled();
  });

  it("does not render collapse button in detail state without onCollapse", () => {
    renderPanel({ viewState: "detail" });
    expect(screen.queryByTitle("Collapse to summary")).not.toBeInTheDocument();
  });

  it("applies is-exiting class when isExiting is true", () => {
    renderPanel({ isExiting: true });
    const panel = document.querySelector(".console-detail-panel");
    expect(panel?.classList.contains("is-exiting")).toBe(true);
  });
});
