import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ConsoleWorkspacePanel from "../ConsoleWorkspacePanel";

describe("ConsoleWorkspacePanel", () => {
  it("renders children", () => {
    render(
      <ConsoleWorkspacePanel>
        <div data-testid="child">Workspace content</div>
      </ConsoleWorkspacePanel>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("applies is-exiting class when isExiting is true", () => {
    render(
      <ConsoleWorkspacePanel isExiting>
        <div>Content</div>
      </ConsoleWorkspacePanel>,
    );
    const panel = document.querySelector(".console-workspace-panel");
    expect(panel?.classList.contains("is-exiting")).toBe(true);
  });

  it("does not apply is-exiting class by default", () => {
    render(
      <ConsoleWorkspacePanel>
        <div>Content</div>
      </ConsoleWorkspacePanel>,
    );
    const panel = document.querySelector(".console-workspace-panel");
    expect(panel?.classList.contains("is-exiting")).toBe(false);
  });
});
