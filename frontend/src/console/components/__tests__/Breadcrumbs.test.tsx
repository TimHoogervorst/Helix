import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Breadcrumbs from "../Breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders root as current when path is empty", () => {
    render(
      <Breadcrumbs path="" onNavigate={vi.fn()} onUp={vi.fn()} />,
    );
    const root = screen.getByText(/root/);
    expect(root.className).toContain("is-current");
  });

  it("renders root as clickable when in a subfolder", () => {
    render(
      <Breadcrumbs
        path="/Experiments"
        onNavigate={vi.fn()}
        onUp={vi.fn()}
      />,
    );
    const root = screen.getByText(/root/);
    expect(root.className).not.toContain("is-current");
  });

  it("renders path segments separated by /", () => {
    render(
      <Breadcrumbs
        path="/Experiments/Q1"
        onNavigate={vi.fn()}
        onUp={vi.fn()}
      />,
    );
    expect(screen.getByText(/Experiments/)).toBeInTheDocument();
    expect(screen.getByText(/Q1/)).toBeInTheDocument();
  });

  it("marks the last segment as current", () => {
    render(
      <Breadcrumbs
        path="/Experiments/Q1"
        onNavigate={vi.fn()}
        onUp={vi.fn()}
      />,
    );
    // "Q1" segment should be current
    const q1 = screen.getByText(/Q1/);
    expect(q1.className).toContain("is-current");
    // "Experiments" should not be current
    const experiments = screen.getByText(/Experiments/);
    expect(experiments.className).not.toContain("is-current");
  });

  it("calls onNavigate with empty string when root is clicked", () => {
    const handleNavigate = vi.fn();
    render(
      <Breadcrumbs
        path="/Experiments"
        onNavigate={handleNavigate}
        onUp={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/root/));
    expect(handleNavigate).toHaveBeenCalledWith("");
  });

  it("calls onNavigate with segment path when intermediate segment is clicked", () => {
    const handleNavigate = vi.fn();
    render(
      <Breadcrumbs
        path="/Experiments/Q1/Sub"
        onNavigate={handleNavigate}
        onUp={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/Experiments/));
    expect(handleNavigate).toHaveBeenCalledWith("/Experiments");
  });

  it("does not call onNavigate when clicking current (last) segment", () => {
    const handleNavigate = vi.fn();
    render(
      <Breadcrumbs
        path="/Experiments"
        onNavigate={handleNavigate}
        onUp={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText(/Experiments/));
    expect(handleNavigate).not.toHaveBeenCalled();
  });

  it("calls onUp when back button is clicked", () => {
    const handleUp = vi.fn();
    render(
      <Breadcrumbs
        path="/Experiments"
        onNavigate={vi.fn()}
        onUp={handleUp}
      />,
    );
    const btn = screen.getByRole("button", { name: "Go up" });
    expect(btn).toHaveAttribute("aria-label", "Go up");
    fireEvent.click(btn);
    expect(handleUp).toHaveBeenCalled();
  });

  it("disables back button at root", () => {
    render(
      <Breadcrumbs path="" onNavigate={vi.fn()} onUp={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Go up" })).toBeDisabled();
  });

  it("enables back button in subfolder", () => {
    render(
      <Breadcrumbs
        path="/Experiments"
        onNavigate={vi.fn()}
        onUp={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Go up" })).not.toBeDisabled();
  });
});
