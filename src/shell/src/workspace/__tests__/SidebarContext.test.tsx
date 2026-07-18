import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { SidebarProvider, useSidebar } from "../SidebarContext";

// ── Test harness ──────────────────────────────────────────────────────────

/**
 * Renders children inside a single SidebarProvider.
 * Thin wrapper so tests stay concise.
 */
function renderWithProvider(ui: ReactNode) {
  return render(<SidebarProvider>{ui}</SidebarProvider>);
}

/**
 * Test component that exposes the full useSidebar API as DOM elements.
 *
 * Reads:
 *  - data-testid="isCollapsed"           → "true" | "false"
 *  - data-testid="collapsedSections-<id>" → "true" | "false" (per section)
 *  - data-testid="allCollapsed"          → JSON-sorted array of collapsed IDs
 *
 * Actions:
 *  - data-testid="toggleSidebar"         → clicks toggleSidebar()
 *  - data-testid="toggleSection-<id>"    → clicks toggleSection(id)
 */
function SidebarConsumer({
  sectionIds = [],
}: {
  sectionIds?: string[];
}) {
  const {
    isCollapsed,
    toggleSidebar,
    collapsedSections,
    toggleSection,
    isSectionCollapsed,
  } = useSidebar();

  return (
    <div>
      <span data-testid="isCollapsed">{String(isCollapsed)}</span>
      <span data-testid="allCollapsed">
        {JSON.stringify([...collapsedSections].sort())}
      </span>
      {sectionIds.map((id) => (
        <span key={`cs-${id}`} data-testid={`collapsedSections-${id}`}>
          {String(isSectionCollapsed(id))}
        </span>
      ))}
      <button data-testid="toggleSidebar" onClick={toggleSidebar}>
        Toggle Sidebar
      </button>
      {sectionIds.map((id) => (
        <button
          key={`ts-${id}`}
          data-testid={`toggleSection-${id}`}
          onClick={() => toggleSection(id)}
        >
          Toggle {id}
        </button>
      ))}
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("SidebarContext", () => {
  // ── Initial state ────────────────────────────────────────────────────

  describe("initial state", () => {
    it("isCollapsed defaults to false", () => {
      renderWithProvider(<SidebarConsumer />);
      expect(screen.getByTestId("isCollapsed").textContent).toBe("false");
    });

    it("collapsedSections defaults to an empty set", () => {
      renderWithProvider(<SidebarConsumer />);
      expect(screen.getByTestId("allCollapsed").textContent).toBe("[]");
    });

    it("isSectionCollapsed returns false for an arbitrary section", () => {
      renderWithProvider(<SidebarConsumer sectionIds={["views"]} />);
      expect(
        screen.getByTestId("collapsedSections-views").textContent,
      ).toBe("false");
    });
  });

  // ── toggleSidebar ────────────────────────────────────────────────────

  describe("toggleSidebar", () => {
    it("toggles isCollapsed from false to true", () => {
      renderWithProvider(<SidebarConsumer />);
      fireEvent.click(screen.getByTestId("toggleSidebar"));
      expect(screen.getByTestId("isCollapsed").textContent).toBe("true");
    });

    it("toggles isCollapsed back from true to false", () => {
      renderWithProvider(<SidebarConsumer />);
      const btn = screen.getByTestId("toggleSidebar");
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(screen.getByTestId("isCollapsed").textContent).toBe("false");
    });
  });

  // ── toggleSection ────────────────────────────────────────────────────

  describe("toggleSection", () => {
    it("adds a section ID to collapsedSections when toggled once", () => {
      renderWithProvider(<SidebarConsumer sectionIds={["views"]} />);
      fireEvent.click(screen.getByTestId("toggleSection-views"));
      expect(screen.getByTestId("allCollapsed").textContent).toBe(
        JSON.stringify(["views"]),
      );
    });

    it("removes a section ID from collapsedSections when toggled twice", () => {
      renderWithProvider(<SidebarConsumer sectionIds={["views"]} />);
      const btn = screen.getByTestId("toggleSection-views");
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(screen.getByTestId("allCollapsed").textContent).toBe("[]");
    });

    it("can track multiple collapsed sections independently", () => {
      renderWithProvider(
        <SidebarConsumer sectionIds={["views", "selection"]} />,
      );
      fireEvent.click(screen.getByTestId("toggleSection-views"));
      fireEvent.click(screen.getByTestId("toggleSection-selection"));
      expect(screen.getByTestId("allCollapsed").textContent).toBe(
        JSON.stringify(["selection", "views"]),
      );
    });
  });

  // ── isSectionCollapsed ───────────────────────────────────────────────

  describe("isSectionCollapsed", () => {
    it("returns false for an uncollapsed section", () => {
      renderWithProvider(<SidebarConsumer sectionIds={["views"]} />);
      expect(
        screen.getByTestId("collapsedSections-views").textContent,
      ).toBe("false");
    });

    it("returns true for a collapsed section", () => {
      renderWithProvider(<SidebarConsumer sectionIds={["views"]} />);
      fireEvent.click(screen.getByTestId("toggleSection-views"));
      expect(
        screen.getByTestId("collapsedSections-views").textContent,
      ).toBe("true");
    });

    it("returns false again after un-collapsing a section", () => {
      renderWithProvider(<SidebarConsumer sectionIds={["views"]} />);
      const btn = screen.getByTestId("toggleSection-views");
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(
        screen.getByTestId("collapsedSections-views").textContent,
      ).toBe("false");
    });
  });

  // ── Independence of collapse dimensions ──────────────────────────────

  describe("independence of collapse dimensions", () => {
    it("toggling sidebar does not modify collapsedSections", () => {
      renderWithProvider(<SidebarConsumer sectionIds={["views"]} />);
      // Collapse a section first
      fireEvent.click(screen.getByTestId("toggleSection-views"));
      expect(screen.getByTestId("allCollapsed").textContent).toBe(
        JSON.stringify(["views"]),
      );

      // Toggle sidebar — sections must be unaffected
      fireEvent.click(screen.getByTestId("toggleSidebar"));
      expect(screen.getByTestId("allCollapsed").textContent).toBe(
        JSON.stringify(["views"]),
      );
    });

    it("toggling a section does not modify isCollapsed", () => {
      renderWithProvider(<SidebarConsumer sectionIds={["views"]} />);
      // Collapse the sidebar first
      fireEvent.click(screen.getByTestId("toggleSidebar"));
      expect(screen.getByTestId("isCollapsed").textContent).toBe("true");

      // Toggle a section — sidebar collapse must be unaffected
      fireEvent.click(screen.getByTestId("toggleSection-views"));
      expect(screen.getByTestId("isCollapsed").textContent).toBe("true");
    });

    it("toggling sidebar twice still preserves section state", () => {
      renderWithProvider(<SidebarConsumer sectionIds={["views"]} />);
      fireEvent.click(screen.getByTestId("toggleSection-views"));
      fireEvent.click(screen.getByTestId("toggleSidebar"));
      fireEvent.click(screen.getByTestId("toggleSidebar"));
      expect(screen.getByTestId("allCollapsed").textContent).toBe(
        JSON.stringify(["views"]),
      );
    });
  });

  // ── Multiple provider instances ──────────────────────────────────────

  describe("multiple provider instances", () => {
    it("two providers maintain independent collapse state", () => {
      // Render two independent provider trees
      render(
        <div>
          <div data-testid="provider-1">
            <SidebarProvider>
              <SidebarConsumer sectionIds={["views"]} />
            </SidebarProvider>
          </div>
          <div data-testid="provider-2">
            <SidebarProvider>
              <SidebarConsumer sectionIds={["views"]} />
            </SidebarProvider>
          </div>
        </div>,
      );

      // Both start with isCollapsed = false
      const allCollapsedSpans = screen.getAllByTestId("isCollapsed");
      expect(allCollapsedSpans[0].textContent).toBe("false");
      expect(allCollapsedSpans[1].textContent).toBe("false");

      // Collapse sidebar in provider 1 only
      const toggleBtns = screen.getAllByTestId("toggleSidebar");
      fireEvent.click(toggleBtns[0]);

      // Provider 1 is collapsed, provider 2 is not
      const updatedCollapsedSpans = screen.getAllByTestId("isCollapsed");
      expect(updatedCollapsedSpans[0].textContent).toBe("true");
      expect(updatedCollapsedSpans[1].textContent).toBe("false");
    });

    it("two providers maintain independent section collapse state", () => {
      render(
        <div>
          <div data-testid="provider-1">
            <SidebarProvider>
              <SidebarConsumer sectionIds={["views"]} />
            </SidebarProvider>
          </div>
          <div data-testid="provider-2">
            <SidebarProvider>
              <SidebarConsumer sectionIds={["views"]} />
            </SidebarProvider>
          </div>
        </div>,
      );

      // Collapse section in provider 1 only
      const sectionBtns = screen.getAllByTestId("toggleSection-views");
      fireEvent.click(sectionBtns[0]);

      const allCollapsed = screen.getAllByTestId("allCollapsed");
      expect(allCollapsed[0].textContent).toBe(JSON.stringify(["views"]));
      expect(allCollapsed[1].textContent).toBe("[]");
    });
  });

  // ── Error boundary ───────────────────────────────────────────────────

  describe("error cases", () => {
    it("throws when useSidebar is used outside a provider", () => {
      // Suppress console.error for the expected throw so test output stays clean
      const spy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      function BareConsumer() {
        useSidebar();
        return null;
      }

      expect(() => render(<BareConsumer />)).toThrow(
        "useSidebar must be used inside <SidebarProvider>.",
      );

      spy.mockRestore();
    });
  });
});
