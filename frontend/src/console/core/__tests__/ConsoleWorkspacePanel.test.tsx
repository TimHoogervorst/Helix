import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ConsoleWorkspacePanel from "../ConsoleWorkspacePanel";

function renderPanel(overrides: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <ConsoleWorkspacePanel {...overrides}>
        <div data-testid="child">Workspace content</div>
      </ConsoleWorkspacePanel>
    </MemoryRouter>,
  );
}

describe("ConsoleWorkspacePanel", () => {
  it("renders children", () => {
    renderPanel();
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("applies is-exiting class when isExiting is true", () => {
    renderPanel({ isExiting: true });
    const panel = document.querySelector(".console-workspace-panel");
    expect(panel?.classList.contains("is-exiting")).toBe(true);
  });

  it("does not apply is-exiting class by default", () => {
    renderPanel();
    const panel = document.querySelector(".console-workspace-panel");
    expect(panel?.classList.contains("is-exiting")).toBe(false);
  });

  // ── backUrl ─────────────────────────────────────────────────────────

  it("renders a fixed back button when backUrl is provided", () => {
    renderPanel({ backUrl: "/library?select=EP1" });
    const btn = screen.getByTitle("Back to master panel");
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("A");
    expect(btn.getAttribute("href")).toBe("/library?select=EP1");
  });

  it("renders the back divider when backUrl is provided", () => {
    renderPanel({ backUrl: "/library?select=EP1" });
    expect(
      document.querySelector(".console-workspace-back-divider"),
    ).toBeInTheDocument();
  });

  it("renders the back container as a fixed element", () => {
    renderPanel({ backUrl: "/library?select=EP1" });
    expect(
      document.querySelector(".console-workspace-back"),
    ).toBeInTheDocument();
  });

  it("does not render the back container when backUrl is not provided", () => {
    renderPanel();
    expect(
      document.querySelector(".console-workspace-back"),
    ).not.toBeInTheDocument();
  });
});
