import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IconBadge } from "../IconBadge";

describe("IconBadge", () => {
  describe("known keys", () => {
    it("renders with a known icon and color key", () => {
      render(<IconBadge iconKey="dna" colorKey="flask" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge).toBeInTheDocument();
      expect(badge.querySelector("svg")).toBeInTheDocument();
    });

    it("applies the resolved background color", () => {
      render(<IconBadge iconKey="dna" colorKey="enzyme" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.backgroundColor).toBe("rgb(217, 179, 230)");
    });

    it("derives a dark foreground for light backgrounds", () => {
      render(<IconBadge iconKey="dna" colorKey="muted" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.color).toBe("rgb(26, 26, 26)");
    });

    it("derives a light foreground for dark backgrounds", () => {
      render(<IconBadge iconKey="dna" colorKey="primary" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.color).toBe("rgb(255, 255, 255)");
    });
  });

  describe("unknown keys", () => {
    it("still renders an SVG for an unknown iconKey", () => {
      render(<IconBadge iconKey="nonexistent" colorKey="flask" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.querySelector("svg")).toBeInTheDocument();
    });

    it("falls back to muted background for an unknown colorKey", () => {
      render(<IconBadge iconKey="dna" colorKey="nonexistent" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.style.backgroundColor).toBe("rgb(217, 217, 217)");
    });

    it("falls back gracefully when both keys are unknown", () => {
      render(<IconBadge iconKey="nonexistent" colorKey="nonexistent" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.querySelector("svg")).toBeInTheDocument();
      expect(badge.style.backgroundColor).toBe("rgb(217, 217, 217)");
    });
  });

  describe("clickable vs inert", () => {
    it("renders as a div without onChange", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.tagName).toBe("DIV");
    });

    it("renders as a button with onChange", () => {
      render(
        <IconBadge iconKey="circle" colorKey="muted" onChange={() => {}} />,
      );
      const badge = screen.getByTestId("icon-badge");
      expect(badge.tagName).toBe("BUTTON");
    });

    it("calls onChange when clicked", () => {
      const onChange = vi.fn();
      render(
        <IconBadge iconKey="circle" colorKey="muted" onChange={onChange} />,
      );
      const badge = screen.getByTestId("icon-badge");
      fireEvent.click(badge);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("has cursor-pointer class with onChange", () => {
      render(
        <IconBadge iconKey="circle" colorKey="muted" onChange={() => {}} />,
      );
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("cursor-pointer");
    });

    it("does not have cursor-pointer class without onChange", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).not.toContain("cursor-pointer");
    });
  });

  describe("size variants", () => {
    it("renders sm size with correct classes", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" size="sm" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("h-6");
      expect(badge.className).toContain("w-6");
    });

    it("renders md size with correct classes", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" size="md" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("h-9");
      expect(badge.className).toContain("w-9");
    });

    it("renders lg size with correct classes", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" size="lg" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("h-12");
      expect(badge.className).toContain("w-12");
    });

    it("defaults to md when size is not specified", () => {
      render(<IconBadge iconKey="circle" colorKey="muted" />);
      const badge = screen.getByTestId("icon-badge");
      expect(badge.className).toContain("h-9");
      expect(badge.className).toContain("w-9");
    });

    it("renders the correct icon size for each variant", () => {
      const { rerender } = render(
        <IconBadge iconKey="circle" colorKey="muted" size="sm" />,
      );
      let svg = screen.getByTestId("icon-badge").querySelector("svg");
      expect(svg?.className.baseVal).toContain("h-3.5");

      rerender(<IconBadge iconKey="circle" colorKey="muted" size="md" />);
      svg = screen.getByTestId("icon-badge").querySelector("svg");
      expect(svg?.className.baseVal).toContain("h-5");

      rerender(<IconBadge iconKey="circle" colorKey="muted" size="lg" />);
      svg = screen.getByTestId("icon-badge").querySelector("svg");
      expect(svg?.className.baseVal).toContain("h-7");
    });
  });
});
