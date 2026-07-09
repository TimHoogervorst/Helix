/**
 * Tests for TagColorPicker — row of 8 coloured dots.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagColorPicker } from "../ui/TagColorPicker";
import { TAG_COLORS } from "../constants";

describe("TagColorPicker", () => {
  it("renders 8 colour buttons", () => {
    render(<TagColorPicker value="muted" onChange={() => {}} />);

    const picker = screen.getByTestId("tag-color-picker");
    const buttons = picker.querySelectorAll("button");
    expect(buttons).toHaveLength(8);
  });

  it("renders each colour with correct label", () => {
    render(<TagColorPicker value="muted" onChange={() => {}} />);

    for (const c of TAG_COLORS) {
      expect(screen.getByLabelText(c.label)).toBeInTheDocument();
    }
  });

  it("applies border-foreground to the selected colour", () => {
    render(<TagColorPicker value="enzyme" onChange={() => {}} />);

    const enzymeBtn = screen.getByLabelText("Enzyme");
    expect(enzymeBtn.className).toContain("border-foreground");
  });

  it("does not apply border-foreground to unselected colours", () => {
    render(<TagColorPicker value="enzyme" onChange={() => {}} />);

    // "Muted" should not have the selected border
    const mutedBtn = screen.getByLabelText("Muted");
    expect(mutedBtn.className).toContain("border-transparent");
    expect(mutedBtn.className).not.toContain("border-foreground");
  });

  it("calls onChange with colour key when clicked", () => {
    const onChange = vi.fn();
    render(<TagColorPicker value="muted" onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("Enzyme"));
    expect(onChange).toHaveBeenCalledWith("enzyme");
  });

  it("renders xs size variant with smaller dots", () => {
    render(<TagColorPicker value="muted" onChange={() => {}} size="xs" />);

    const enzymeBtn = screen.getByLabelText("Enzyme");
    expect(enzymeBtn.className).toContain("h-4");
    expect(enzymeBtn.className).toContain("w-4");
  });

  it("renders sm size variant with default dots", () => {
    render(<TagColorPicker value="muted" onChange={() => {}} size="sm" />);

    const enzymeBtn = screen.getByLabelText("Enzyme");
    expect(enzymeBtn.className).toContain("h-5");
    expect(enzymeBtn.className).toContain("w-5");
  });
});
