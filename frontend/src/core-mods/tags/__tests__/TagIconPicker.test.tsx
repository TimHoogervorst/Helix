/**
 * Tests for TagIconPicker — row of 8 icon buttons.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagIconPicker } from "../ui/TagIconPicker";
import { TAG_ICONS } from "../constants";

describe("TagIconPicker", () => {
  it("renders 8 icon buttons", () => {
    render(<TagIconPicker value="circle" onChange={() => {}} />);

    const picker = screen.getByTestId("tag-icon-picker");
    const buttons = picker.querySelectorAll("button");
    expect(buttons).toHaveLength(8);
  });

  it("renders each icon with correct label", () => {
    render(<TagIconPicker value="circle" onChange={() => {}} />);

    for (const ico of TAG_ICONS) {
      expect(screen.getByLabelText(ico.label)).toBeInTheDocument();
    }
  });

  it("applies selected styling to the active icon", () => {
    render(<TagIconPicker value="dna" onChange={() => {}} />);

    const dnaBtn = screen.getByLabelText("DNA");
    expect(dnaBtn.className).toContain("border-foreground");
    expect(dnaBtn.className).toContain("bg-muted");
  });

  it("applies border-hairline to unselected icons", () => {
    render(<TagIconPicker value="dna" onChange={() => {}} />);

    const circleBtn = screen.getByLabelText("Circle");
    expect(circleBtn.className).toContain("border-hairline");
    expect(circleBtn.className).not.toContain("border-foreground");
  });

  it("calls onChange with icon key when clicked", () => {
    const onChange = vi.fn();
    render(<TagIconPicker value="circle" onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("DNA"));
    expect(onChange).toHaveBeenCalledWith("dna");
  });

  it("renders xs size variant with smaller buttons", () => {
    render(<TagIconPicker value="circle" onChange={() => {}} size="xs" />);

    const dnaBtn = screen.getByLabelText("DNA");
    expect(dnaBtn.className).toContain("h-6");
    expect(dnaBtn.className).toContain("w-6");
  });

  it("renders sm size variant with default buttons", () => {
    render(<TagIconPicker value="circle" onChange={() => {}} size="sm" />);

    const dnaBtn = screen.getByLabelText("DNA");
    expect(dnaBtn.className).toContain("h-7");
    expect(dnaBtn.className).toContain("w-7");
  });
});
