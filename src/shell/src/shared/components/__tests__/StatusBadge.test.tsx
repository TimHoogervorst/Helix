import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../StatusBadge";

describe("StatusBadge", () => {
  it('renders "In Progress" with status-warn class for in_progress', () => {
    render(<StatusBadge status="in_progress" />);
    const chip = screen.getByText("In Progress");
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain("card-status-chip");
    expect(chip.className).toContain("status-warn");
  });

  it('renders "Finished" with status-success class for finished', () => {
    render(<StatusBadge status="finished" />);
    const chip = screen.getByText("Finished");
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain("card-status-chip");
    expect(chip.className).toContain("status-success");
  });

  it("renders fallback label for unknown statuses", () => {
    render(<StatusBadge status="unknown_status" />);
    const chip = screen.getByText("Unknown Status");
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain("card-status-chip");
    // No specific status class for unknown statuses
    expect(chip.className).not.toContain("status-warn");
    expect(chip.className).not.toContain("status-success");
  });

  it("returns null for empty string status", () => {
    const { container } = render(<StatusBadge status="" />);
    expect(container.querySelector(".card-status-chip")).toBeNull();
  });
});
