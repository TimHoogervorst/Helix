import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConsoleCollapsedStrip from "../ConsoleCollapsedStrip";

describe("ConsoleCollapsedStrip", () => {
  it("renders a button with the given title", () => {
    render(<ConsoleCollapsedStrip onExpand={vi.fn()} title="Back to detail" />);
    expect(screen.getByTitle("Back to detail")).toBeInTheDocument();
  });

  it("calls onExpand when button is clicked", () => {
    const handleExpand = vi.fn();
    render(<ConsoleCollapsedStrip onExpand={handleExpand} title="Expand" />);
    fireEvent.click(screen.getByTitle("Expand"));
    expect(handleExpand).toHaveBeenCalled();
  });

  it("renders different titles via prop", () => {
    render(<ConsoleCollapsedStrip onExpand={vi.fn()} title="Expand entity list" />);
    expect(screen.getByTitle("Expand entity list")).toBeInTheDocument();
  });
});
