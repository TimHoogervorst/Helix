/**
 * Tests for TagPill — single tag display component.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagPill } from "../ui/TagPill";
import type { Tag } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTag(overrides?: Partial<Tag>): Tag {
  return { id: 1, name: "CRISPR", color: "enzyme", icon: "dna", ...overrides };
}

describe("TagPill", () => {
  // ── Minimal (read-only) mode ─────────────────────────────────────────────

  it("renders tag name", () => {
    render(<TagPill tag={makeTag({ name: "CRISPR" })} />);
    expect(screen.getByText("CRISPR")).toBeInTheDocument();
  });

  it("renders with correct CSS class for colour", () => {
    render(<TagPill tag={makeTag({ color: "flask" })} />);
    const pill = screen.getByTestId("tag-pill");
    expect(pill.className).toContain("tag-pill");
    expect(pill.className).toContain("tag-flask");
  });

  it("renders with data-tag-id attribute", () => {
    render(<TagPill tag={makeTag({ id: 42 })} />);
    expect(screen.getByTestId("tag-pill").dataset.tagId).toBe("42");
  });

  it("renders all 8 colour classes correctly", () => {
    const colors = [
      "enzyme", "flask", "solvent", "warn",
      "primary", "success", "destructive", "muted",
    ];
    for (const color of colors) {
      const { unmount } = render(
        <TagPill tag={makeTag({ id: colors.indexOf(color) + 1, color })} />,
      );
      expect(screen.getByTestId("tag-pill").className).toContain(`tag-${color}`);
      unmount();
    }
  });

  // ── Interactive mode ─────────────────────────────────────────────────────

  it("shows remove button when onRemove is passed", () => {
    render(
      <TagPill
        tag={makeTag({ name: "CRISPR" })}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByLabelText("Remove tag CRISPR")).toBeInTheDocument();
  });

  it("calls onRemove when remove button is clicked", () => {
    const onRemove = vi.fn();

    render(
      <TagPill
        tag={makeTag({ id: 5, name: "CRISPR" })}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByLabelText("Remove tag CRISPR"));
    expect(onRemove).toHaveBeenCalledWith(5);
  });

  it("shows icon-change button when onIconChange is passed", () => {
    render(
      <TagPill
        tag={makeTag({ name: "CRISPR", icon: "dna" })}
        onIconChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("Change icon for CRISPR")).toBeInTheDocument();
  });

  it("calls onIconChange when icon button is clicked", () => {
    const onIconChange = vi.fn();

    render(
      <TagPill
        tag={makeTag({ id: 3, name: "qPCR", icon: "dna" })}
        onIconChange={onIconChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Change icon for qPCR"));
    expect(onIconChange).toHaveBeenCalledWith(3, "dna");
  });

  it("shows both buttons when both onRemove and onIconChange are passed", () => {
    render(
      <TagPill
        tag={makeTag({ name: "Test", icon: "circle" })}
        onRemove={() => {}}
        onIconChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("Remove tag Test")).toBeInTheDocument();
    expect(screen.getByLabelText("Change icon for Test")).toBeInTheDocument();
  });
});
