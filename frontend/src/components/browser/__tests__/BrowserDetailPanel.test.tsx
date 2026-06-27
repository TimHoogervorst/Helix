import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BrowserDetailPanel from "../BrowserDetailPanel";

function renderPanel(overrides: Record<string, unknown> = {}) {
  const defaults = {
    viewState: "detail" as const,
    onClose: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return render(
    <MemoryRouter>
      <BrowserDetailPanel {...props}>
        <div data-testid="child">Content</div>
      </BrowserDetailPanel>
    </MemoryRouter>,
  );
}

describe("BrowserDetailPanel", () => {
  it("renders children", () => {
    renderPanel();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders close button and fires onClose", () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByTitle("Close detail"));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders expand link when expandUrl is provided and viewState is detail", () => {
    renderPanel({ expandUrl: "/lims/TEST1" });
    const link = screen.getByTitle("Open in workspace");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/lims/TEST1");
  });

  it("renders expand button when onExpand is provided (no expandUrl)", () => {
    const onExpand = vi.fn();
    renderPanel({ onExpand });
    fireEvent.click(screen.getByTitle("Expand to full detail"));
    expect(onExpand).toHaveBeenCalled();
  });

  it("does not render expand action in expanded state", () => {
    renderPanel({ viewState: "expanded", expandUrl: "/lims/TEST1" });
    expect(screen.queryByTitle("Open in workspace")).not.toBeInTheDocument();
  });

  it("renders collapse button in expanded state", () => {
    const onCollapse = vi.fn();
    renderPanel({ viewState: "expanded", onCollapse });
    fireEvent.click(screen.getByTitle("Collapse to summary"));
    expect(onCollapse).toHaveBeenCalled();
  });

  it("does not render collapse button in detail state without onCollapse", () => {
    renderPanel({ viewState: "detail" });
    expect(screen.queryByTitle("Collapse to summary")).not.toBeInTheDocument();
  });

  it("applies is-exiting class when isExiting is true", () => {
    renderPanel({ isExiting: true });
    const panel = document.querySelector(".browser-detail-panel");
    expect(panel?.classList.contains("is-exiting")).toBe(true);
  });
});
