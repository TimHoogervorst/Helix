import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LibraryCollapsedStrip from "../LibraryCollapsedStrip";

describe("LibraryCollapsedStrip", () => {
  it("renders a button to expand back", () => {
    render(<LibraryCollapsedStrip onExpand={vi.fn()} />);
    expect(screen.getByTitle("Back to detail")).toBeInTheDocument();
  });

  it("calls onExpand when button is clicked", () => {
    const handleExpand = vi.fn();
    render(<LibraryCollapsedStrip onExpand={handleExpand} />);
    fireEvent.click(screen.getByTitle("Back to detail"));
    expect(handleExpand).toHaveBeenCalled();
  });
});
