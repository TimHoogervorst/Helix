import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { SidebarProvider } from "../../../../workspace/SidebarContext";
import { CollapsibleSidebar } from "../CollapsibleSidebar";
import type { IconStripGroup } from "../IconStrip";

// ── Helpers ─────────────────────────────────────────────────────────────

function renderWithProvider(ui: ReactNode) {
  return render(<SidebarProvider>{ui}</SidebarProvider>);
}

function makeIconGroup(
  icons: Array<{ label: string; onClick?: () => void }>,
): IconStripGroup {
  return {
    icons: icons.map(({ label, onClick }) => ({
      icon: <span data-testid={`icon-${label}`}>{label[0]}</span>,
      label,
      onClick,
    })),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("CollapsibleSidebar", () => {
  // ── Expanded state ───────────────────────────────────────────────────

  describe("expanded state", () => {
    it("renders children when expanded (default)", () => {
      renderWithProvider(
        <CollapsibleSidebar side="left" variant="full-hide">
          <p data-testid="child">Sidebar content</p>
        </CollapsibleSidebar>,
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("renders a collapse toggle button when expanded", () => {
      renderWithProvider(
        <CollapsibleSidebar side="left" variant="full-hide">
          <p>Content</p>
        </CollapsibleSidebar>,
      );

      const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
      expect(toggle).toBeInTheDocument();
    });
  });

  // ── Collapsed state: full-hide variant ───────────────────────────────

  describe("collapsed state: full-hide variant", () => {
    it("hides children when collapsed", () => {
      renderWithProvider(
        <CollapsibleSidebar side="left" variant="full-hide">
          <p data-testid="child">Content</p>
        </CollapsibleSidebar>,
      );

      // Collapse the sidebar
      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

      expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    });

    it("renders an expand toggle button when collapsed", () => {
      renderWithProvider(
        <CollapsibleSidebar side="left" variant="full-hide">
          <p>Content</p>
        </CollapsibleSidebar>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

      const expandBtn = screen.getByRole("button", { name: "Expand sidebar" });
      expect(expandBtn).toBeInTheDocument();
    });

    it("toggles back to expanded when the expand button is clicked", () => {
      renderWithProvider(
        <CollapsibleSidebar side="left" variant="full-hide">
          <p data-testid="child">Content</p>
        </CollapsibleSidebar>,
      );

      // Collapse
      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
      expect(screen.queryByTestId("child")).not.toBeInTheDocument();

      // Expand
      fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });
  });

  // ── Collapsed state: icon-strip variant ──────────────────────────────

  describe("collapsed state: icon-strip variant", () => {
    it("renders an IconStrip when collapsed with icon-strip variant", () => {
      const groups = [makeIconGroup([{ label: "Hub", onClick: vi.fn() }])];

      renderWithProvider(
        <CollapsibleSidebar
          side="left"
          variant="icon-strip"
          iconStripGroups={groups}
        >
          <p data-testid="child">Content</p>
        </CollapsibleSidebar>,
      );

      // Before collapse, children are visible
      expect(screen.getByTestId("child")).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

      // IconStrip icons should be rendered
      expect(screen.getByTestId("icon-Hub")).toBeInTheDocument();

      // Children should be hidden
      expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    });

    it("renders a toggle button alongside the IconStrip when collapsed", () => {
      const groups = [makeIconGroup([{ label: "Hub", onClick: vi.fn() }])];

      renderWithProvider(
        <CollapsibleSidebar
          side="left"
          variant="icon-strip"
          iconStripGroups={groups}
        >
          <p>Content</p>
        </CollapsibleSidebar>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

      // There should be a toggle to expand back
      expect(
        screen.getByRole("button", { name: "Expand sidebar" }),
      ).toBeInTheDocument();
    });
  });

  // ── Toggle button positioning ────────────────────────────────────────

  describe("toggle button positioning", () => {
    it("for left sidebar: toggle is on the right edge", () => {
      renderWithProvider(
        <CollapsibleSidebar side="left" variant="full-hide">
          <p>Content</p>
        </CollapsibleSidebar>,
      );

      const sidebar = screen.getByRole("complementary");
      expect(sidebar).toHaveAttribute("data-side", "left");

      // The toggle should be after the content in the DOM (right-edge = after content)
      const contentEl = sidebar.querySelector(".sidebar-content");
      const toggleEl = sidebar.querySelector(".sidebar-toggle");
      expect(contentEl).toBeInTheDocument();
      expect(toggleEl).toBeInTheDocument();

      // Content should come before the toggle in DOM order
      expect(
        contentEl!.compareDocumentPosition(toggleEl!),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("for right sidebar: toggle is on the left edge", () => {
      renderWithProvider(
        <CollapsibleSidebar side="right" variant="full-hide">
          <p>Content</p>
        </CollapsibleSidebar>,
      );

      const sidebar = screen.getByRole("complementary");
      expect(sidebar).toHaveAttribute("data-side", "right");

      const contentEl = sidebar.querySelector(".sidebar-content");
      const toggleEl = sidebar.querySelector(".sidebar-toggle");
      expect(contentEl).toBeInTheDocument();
      expect(toggleEl).toBeInTheDocument();

      // Toggle should come before the content in DOM order (left-edge = before content)
      expect(
        toggleEl!.compareDocumentPosition(contentEl!),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });

  // ── ARIA and accessibility ───────────────────────────────────────────

  describe("accessibility", () => {
    it("uses complementary role for the sidebar", () => {
      renderWithProvider(
        <CollapsibleSidebar side="left" variant="full-hide">
          <p>Content</p>
        </CollapsibleSidebar>,
      );

      expect(screen.getByRole("complementary")).toBeInTheDocument();
    });

    it("toggle button has title and aria-label", () => {
      renderWithProvider(
        <CollapsibleSidebar side="left" variant="full-hide">
          <p>Content</p>
        </CollapsibleSidebar>,
      );

      const btn = screen.getByRole("button", { name: "Collapse sidebar" });
      expect(btn).toHaveAttribute("title", "Collapse sidebar");
      expect(btn).toHaveAttribute("aria-label", "Collapse sidebar");
    });
  });
});
