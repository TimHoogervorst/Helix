import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BrowserWorkspacePanel from "../BrowserWorkspacePanel";

describe("BrowserWorkspacePanel", () => {
  it("renders children", () => {
    render(
      <BrowserWorkspacePanel>
        <div data-testid="child">Workspace content</div>
      </BrowserWorkspacePanel>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("applies is-exiting class when isExiting is true", () => {
    render(
      <BrowserWorkspacePanel isExiting>
        <div>Content</div>
      </BrowserWorkspacePanel>,
    );
    const panel = document.querySelector(".browser-workspace-panel");
    expect(panel?.classList.contains("is-exiting")).toBe(true);
  });

  it("does not apply is-exiting class by default", () => {
    render(
      <BrowserWorkspacePanel>
        <div>Content</div>
      </BrowserWorkspacePanel>,
    );
    const panel = document.querySelector(".browser-workspace-panel");
    expect(panel?.classList.contains("is-exiting")).toBe(false);
  });
});
