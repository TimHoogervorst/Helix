import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TagChips } from "../TagChips";

describe("TagChips", () => {
  it("renders a list of tag chips", () => {
    const tags = [
      { name: "CRISPR", color: "flask" },
      { name: "QC", color: "solvent" },
    ];
    render(<TagChips tags={tags} />);
    expect(screen.getByText("CRISPR")).toBeInTheDocument();
    expect(screen.getByText("QC")).toBeInTheDocument();
  });

  it("applies color class to each tag chip", () => {
    const tags = [{ name: "CRISPR", color: "flask" }];
    render(<TagChips tags={tags} />);
    const chip = screen.getByText("CRISPR");
    expect(chip.className).toContain("tag-chip");
    expect(chip.className).toContain("tag-flask");
  });

  it("renders nothing when tags array is empty", () => {
    const { container } = render(<TagChips tags={[]} />);
    expect(container.querySelector(".card-tags")).toBeNull();
  });

  it("renders multiple chips with different colors", () => {
    const tags = [
      { name: "A", color: "flask" },
      { name: "B", color: "solvent" },
      { name: "C", color: "enzyme" },
    ];
    render(<TagChips tags={tags} />);
    expect(screen.getByText("A").className).toContain("tag-flask");
    expect(screen.getByText("B").className).toContain("tag-solvent");
    expect(screen.getByText("C").className).toContain("tag-enzyme");
  });
});
