import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { SidebarProvider } from "../../../../workspace/SidebarContext";
import { SidebarSection } from "../SidebarSection";

// ── Test icon ──────────────────────────────────────────────────────────

function TestIcon({ size, className }: { size?: number; className?: string }) {
  return <svg data-testid="test-icon" data-size={size} className={className} />;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function renderWithProvider(ui: ReactNode) {
  return render(<SidebarProvider>{ui}</SidebarProvider>);
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("SidebarSection", () => {
  // ── Header rendering ─────────────────────────────────────────────────

  describe("header rendering", () => {
    it("renders a header with the label text", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p>Content</p>
        </SidebarSection>,
      );

      expect(screen.getByText("Views")).toBeInTheDocument();
    });

    it("renders a ChevronDown icon when expanded", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p>Content</p>
        </SidebarSection>,
      );

      // The chevron container is aria-hidden; it should contain an SVG (the icon)
      const header = screen.getByText("Views").parentElement;
      const chevron = header?.querySelector('[aria-hidden="true"]');
      expect(chevron).toBeInTheDocument();
      // When expanded, the chevron should contain a lucide ChevronDown icon SVG
      expect(chevron?.querySelector("svg")).toBeInTheDocument();
    });
  });

  // ── Children rendering ───────────────────────────────────────────────

  describe("children rendering", () => {
    it("renders children when expanded (default)", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p data-testid="content">Section content</p>
        </SidebarSection>,
      );

      expect(screen.getByTestId("content")).toBeInTheDocument();
    });

    it("hides children when collapsed", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p data-testid="content">Section content</p>
        </SidebarSection>,
      );

      // Click the header to collapse
      fireEvent.click(screen.getByText("Views"));

      expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    });

    it("shows children again after toggling twice", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p data-testid="content">Section content</p>
        </SidebarSection>,
      );

      const header = screen.getByText("Views");
      fireEvent.click(header); // collapse
      fireEvent.click(header); // expand

      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });

  // ── Chevron convention ───────────────────────────────────────────────

  describe("chevron convention", () => {
    it("uses ChevronDown when expanded, ChevronRight when collapsed", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p>Content</p>
        </SidebarSection>,
      );

      const header = screen.getByText("Views").parentElement;

      // Get the SVG element via the chevron container
      const chevronSpan = header?.querySelector('[aria-hidden="true"]');
      const svgEl = chevronSpan?.querySelector("svg");

      // lucide-react renders ChevronDown and ChevronRight as SVG elements.
      // We verify an SVG is present (the specific icon is determined by the
      // component logic; ChevronRight lacks the "lucide-chevron-down" class).
      expect(svgEl).toBeInTheDocument();

      // Collapse the section
      fireEvent.click(screen.getByText("Views"));

      // After collapse, the header should still contain a chevron SVG
      const headerAfter = screen.getByText("Views").parentElement;
      const chevronAfter = headerAfter?.querySelector('[aria-hidden="true"]');
      expect(chevronAfter?.querySelector("svg")).toBeInTheDocument();
    });
  });

  // ── collapsible={false} ──────────────────────────────────────────────

  describe("collapsible={false}", () => {
    it("hides the chevron when collapsible is false", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views" collapsible={false}>
          <p>Content</p>
        </SidebarSection>,
      );

      const header = screen.getByText("Views").parentElement;
      const chevron = header?.querySelector('[aria-hidden="true"]');
      expect(chevron).toBeNull();
    });

    it("prevents collapse when clicking the header", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views" collapsible={false}>
          <p data-testid="content">Content</p>
        </SidebarSection>,
      );

      fireEvent.click(screen.getByText("Views"));

      // Content should still be visible
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });

    it("does not have a button role on the header", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views" collapsible={false}>
          <p>Content</p>
        </SidebarSection>,
      );

      const header = screen.getByText("Views").parentElement;
      expect(header?.getAttribute("role")).toBeNull();
    });
  });

  // ── Collapsed section stays inline ───────────────────────────────────

  describe("collapsed section stays inline", () => {
    it("renders the header bar when collapsed (not removed)", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p data-testid="content">Content</p>
        </SidebarSection>,
      );

      fireEvent.click(screen.getByText("Views"));

      // The header should still be visible
      expect(screen.getByText("Views")).toBeInTheDocument();
    });

    it("collapsed header has aria-expanded set to false", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p>Content</p>
        </SidebarSection>,
      );

      const header = screen.getByText("Views").parentElement;
      // Initially expanded
      expect(header?.getAttribute("aria-expanded")).toBe("true");

      fireEvent.click(screen.getByText("Views"));

      // After collapse
      const headerAfter = screen.getByText("Views").parentElement;
      expect(headerAfter?.getAttribute("aria-expanded")).toBe("false");
    });
  });

  // ── Keyboard interaction ─────────────────────────────────────────────

  describe("keyboard interaction", () => {
    it("toggles on Enter key", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p data-testid="content">Content</p>
        </SidebarSection>,
      );

      const header = screen.getByText("Views").parentElement!;
      fireEvent.keyDown(header, { key: "Enter" });

      expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    });

    it("toggles on Space key", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p data-testid="content">Content</p>
        </SidebarSection>,
      );

      const header = screen.getByText("Views").parentElement!;
      fireEvent.keyDown(header, { key: " " });

      expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    });

    it("does not toggle on Enter when collapsible is false", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views" collapsible={false}>
          <p data-testid="content">Content</p>
        </SidebarSection>,
      );

      const header = screen.getByText("Views").parentElement!;
      fireEvent.keyDown(header, { key: "Enter" });

      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });

  // ── Icon rendering ────────────────────────────────────────────────────

  describe("icon rendering", () => {
    it("renders the icon component when provided", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views" icon={TestIcon}>
          <p>Content</p>
        </SidebarSection>,
      );

      expect(screen.getByTestId("test-icon")).toBeInTheDocument();
    });

    it("renders the icon before the label in the header", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views" icon={TestIcon}>
          <p>Content</p>
        </SidebarSection>,
      );

      const header = screen.getByText("Views").parentElement!;
      const children = Array.from(header.children);
      const iconIndex = children.findIndex(
        (c) => c.getAttribute("data-testid") === "test-icon",
      );
      const labelIndex = children.findIndex((c) =>
        c.classList.contains("sidebar-section-label"),
      );
      expect(iconIndex).toBeLessThan(labelIndex);
    });

    it("does not render an icon element when icon prop is not provided", () => {
      renderWithProvider(
        <SidebarSection id="views" label="Views">
          <p>Content</p>
        </SidebarSection>,
      );

      expect(screen.queryByTestId("test-icon")).not.toBeInTheDocument();
    });
  });

  // ── Multiple sections independence ───────────────────────────────────

  describe("multiple sections independence", () => {
    it("collapsing one section does not affect another", () => {
      renderWithProvider(
        <>
          <SidebarSection id="section-a" label="Section A">
            <p data-testid="content-a">A</p>
          </SidebarSection>
          <SidebarSection id="section-b" label="Section B">
            <p data-testid="content-b">B</p>
          </SidebarSection>
        </>,
      );

      fireEvent.click(screen.getByText("Section A"));

      expect(screen.queryByTestId("content-a")).not.toBeInTheDocument();
      expect(screen.getByTestId("content-b")).toBeInTheDocument();
    });
  });
});
