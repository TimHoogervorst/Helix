import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConsoleCollapsedStrip from "../ConsoleCollapsedStrip";

describe("ConsoleCollapsedStrip", () => {
  it("renders a button with the given title and aria-label", () => {
    render(<ConsoleCollapsedStrip onExpand={vi.fn()} title="Back to detail" />);
    const btn = screen.getByRole("button", { name: "Back to detail" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label", "Back to detail");
  });

  it("calls onExpand when button is clicked", () => {
    const handleExpand = vi.fn();
    render(<ConsoleCollapsedStrip onExpand={handleExpand} title="Expand" />);
    const btn = screen.getByRole("button", { name: "Expand" });
    expect(btn).toHaveAttribute("aria-label", "Expand");
    fireEvent.click(btn);
    expect(handleExpand).toHaveBeenCalled();
  });

  it("renders different titles via prop", () => {
    render(<ConsoleCollapsedStrip onExpand={vi.fn()} title="Expand entity list" />);
    const btn = screen.getByRole("button", { name: "Expand entity list" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label", "Expand entity list");
  });
});
