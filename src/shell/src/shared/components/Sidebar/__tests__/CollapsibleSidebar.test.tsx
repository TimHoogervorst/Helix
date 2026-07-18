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
    it("treats the first icon as a logo-toggle when side is left", () => {
      const groups = [
        makeIconGroup([{ label: "Logo" }]),
        makeIconGroup([{ label: "Hub", onClick: vi.fn() }]),
      ];

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

      // The first icon ("Logo") becomes a logo-as-toggle button
      const logoToggle = screen.getByRole("button", { name: "Expand sidebar" });
      expect(logoToggle).toBeInTheDocument();
      expect(logoToggle).toHaveClass("sidebar-logo-toggle");
      // The logo icon is rendered inside the toggle
      expect(screen.getByTestId("icon-Logo")).toBeInTheDocument();

      // Remaining groups (Hub) are rendered in an IconStrip
      expect(screen.getByTestId("icon-Hub")).toBeInTheDocument();

      // Children should be hidden
      expect(screen.queryByTestId("child")).not.toBeInTheDocument();
    });

    it("renders standard IconStrip + toggle for right side (no logo extraction)", () => {
      const groups = [makeIconGroup([{ label: "Hub", onClick: vi.fn() }])];

      renderWithProvider(
        <CollapsibleSidebar
          side="right"
          variant="icon-strip"
          iconStripGroups={groups}
        >
          <p>Content</p>
        </CollapsibleSidebar>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

      // IconStrip should render the icon
      expect(screen.getByTestId("icon-Hub")).toBeInTheDocument();

      // There should be a separate toggle button (not a logo-toggle)
      const toggle = screen.getByRole("button", { name: "Expand sidebar" });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toHaveClass("sidebar-toggle");
      expect(toggle).not.toHaveClass("sidebar-logo-toggle");
    });
  });

  // ── Toggle button positioning ────────────────────────────────────────

  describe("toggle button positioning", () => {
    it("for left sidebar: toggle is inside sidebar-content in a toggle row", () => {
      renderWithProvider(
        <CollapsibleSidebar side="left" variant="full-hide">
          <p>Content</p>
        </CollapsibleSidebar>,
      );

      const sidebar = screen.getByRole("complementary");
      expect(sidebar).toHaveAttribute("data-side", "left");

      const contentEl = sidebar.querySelector(".sidebar-content");
      const toggleRow = sidebar.querySelector(".sidebar-toggle-row");
      const toggleEl = sidebar.querySelector(".sidebar-toggle");
      expect(contentEl).toBeInTheDocument();
      expect(toggleRow).toBeInTheDocument();
      expect(toggleEl).toBeInTheDocument();

      // Toggle row should be inside sidebar-content
      expect(contentEl!.contains(toggleRow!)).toBe(true);

      // Toggle row should come before the <p>Content in DOM order
      const paraEl = sidebar.querySelector("p");
      expect(
        toggleRow!.compareDocumentPosition(paraEl!),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

      // Toggle row aligns right for left sidebars
      expect(toggleRow).toHaveAttribute("data-side", "left");
    });

    it("for right sidebar: toggle is inside sidebar-content in a toggle row", () => {
      renderWithProvider(
        <CollapsibleSidebar side="right" variant="full-hide">
          <p>Content</p>
        </CollapsibleSidebar>,
      );

      const sidebar = screen.getByRole("complementary");
      expect(sidebar).toHaveAttribute("data-side", "right");

      const contentEl = sidebar.querySelector(".sidebar-content");
      const toggleRow = sidebar.querySelector(".sidebar-toggle-row");
      const toggleEl = sidebar.querySelector(".sidebar-toggle");
      expect(contentEl).toBeInTheDocument();
      expect(toggleRow).toBeInTheDocument();
      expect(toggleEl).toBeInTheDocument();

      // Toggle row should be inside sidebar-content
      expect(contentEl!.contains(toggleRow!)).toBe(true);

      // Toggle row should come before the <p>Content in DOM order
      const paraEl = sidebar.querySelector("p");
      expect(
        toggleRow!.compareDocumentPosition(paraEl!),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

      // Toggle row aligns left for right sidebars
      expect(toggleRow).toHaveAttribute("data-side", "right");
    });

    it("when hideToggle is true, no toggle row is rendered in expanded state", () => {
      renderWithProvider(
        <CollapsibleSidebar side="left" variant="full-hide" hideToggle>
          <p data-testid="child">Content</p>
        </CollapsibleSidebar>,
      );

      const sidebar = screen.getByRole("complementary");
      expect(sidebar.querySelector(".sidebar-toggle-row")).not.toBeInTheDocument();
      expect(sidebar.querySelector(".sidebar-toggle")).not.toBeInTheDocument();
      // Children are still rendered
      expect(screen.getByTestId("child")).toBeInTheDocument();
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
