/**
 * Tests for HomePage — the Home hub dashboard.
 *
 * Verifies:
 *  - Decorative header bar renders
 *  - Greeting section shows user's first name from useCurrentUser
 *  - Greeting section includes the placeholder subtitle
 *  - Stats bar renders all four hardcoded metric tiles
 *  - Jump Back In section heading with hub count
 *  - Hub cards for non-home hubs with labels, descriptions, and link targets
 *  - Home hub is excluded from cards
 *  - Empty state when no non-home hubs exist
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { HubConfig } from "../../../shell/src/mod-system/types";

// Mock useCurrentUser so the greeting renders with a known first name
vi.mock("../../../shell/src/user/CurrentUserProvider", () => ({
  CurrentUserProvider: ({ children }: { children: React.ReactNode }) => children,
  useCurrentUser: () => ({
    user: {
      id: 1,
      username: "mkato",
      first_name: "Mira",
      last_name: "Kato",
      color: "#4A90D9",
      is_active: true,
      date_joined: "2025-01-15T00:00:00Z",
    },
    isChecking: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

import HomePage from "../HomePage";

// ── Registry helpers ──────────────────────────────────────────────────────

/** Dummy component for use in test hub configs. */
function DummyComponent() {
  return null;
}

/** Register a hub in the real ModRegistry singleton (assumes caller resets via beforeEach). */
function registerHub(config: HubConfig): void {
  ModRegistry.getInstance().registerHub(config);
}

/** Clean slate before each test. */
beforeEach(() => {
  ModRegistry._reset();
});

/** Clean up after each test so singletons don't leak. */
afterEach(() => {
  ModRegistry._reset();
});

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  // ── Decorative header ─────────────────────────────────────────────────

  it("renders the decorative header bar", () => {
    renderHomePage();
    // The decorative header is an aria-hidden div — verify it's present
    const decorativeHeader = document.querySelector("[aria-hidden='true']");
    expect(decorativeHeader).toBeInTheDocument();
    expect(decorativeHeader).toHaveClass("border-b");
    expect(decorativeHeader).toHaveClass("border-hairline");
  });

  // ── Greeting section ───────────────────────────────────────────────────

  it("renders a greeting with the user's first name", () => {
    renderHomePage();
    expect(screen.getByText(/Good morning,/i)).toBeInTheDocument();
    expect(screen.getByText("Mira")).toBeInTheDocument();
  });

  it("styles the first name in italic primary color", () => {
    renderHomePage();
    const firstName = screen.getByText("Mira");
    expect(firstName).toHaveClass("italic");
    expect(firstName).toHaveClass("text-primary");
  });

  it("renders the placeholder subtitle below the greeting", () => {
    renderHomePage();
    expect(
      screen.getByText(/Here's what's happening in your lab today/i),
    ).toBeInTheDocument();
  });

  it("applies the grid-paper background to the greeting section", () => {
    renderHomePage();
    const greetingSection = document.querySelector("section.grid-paper");
    expect(greetingSection).toBeInTheDocument();
  });

  // ── Stats bar ──────────────────────────────────────────────────────────

  it("renders all four stat tiles", () => {
    renderHomePage();
    expect(screen.getByText("Experiments running")).toBeInTheDocument();
    expect(screen.getByText("Entries this week")).toBeInTheDocument();
    expect(screen.getByText("Freezer")).toBeInTheDocument();
    expect(screen.getByText("Reagents low")).toBeInTheDocument();
  });

  it("renders the hardcoded stat values", () => {
    renderHomePage();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("−79.4 °C")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the stat subtitles in mono font", () => {
    renderHomePage();
    const subtitles = [
      screen.getByText("Across 2 labs"),
      screen.getByText("Last 7 days"),
      screen.getByText("All systems normal"),
      screen.getByText("Reorder soon"),
    ];
    for (const subtitle of subtitles) {
      expect(subtitle).toBeInTheDocument();
      expect(subtitle).toHaveClass("font-mono");
    }
  });

  // ── No leftover placeholder assertions ─────────────────────────────────

  it("does not render the old 'Welcome to Helix' placeholder", () => {
    renderHomePage();
    expect(
      screen.queryByText(/Welcome to Helix/i),
    ).not.toBeInTheDocument();
  });

  it("does not render a plain 'Home' heading", () => {
    renderHomePage();
    expect(screen.queryByRole("heading", { name: "Home" })).not.toBeInTheDocument();
  });

  // ── Jump Back In section ───────────────────────────────────────────────

  describe("Jump Back In", () => {
    it("renders the section heading with hub count (home excluded)", () => {
      // Register home + library hub
      registerHub({
        id: "home",
        label: "Home",
        icon: DummyComponent,
        route: "/home",
        component: DummyComponent,
        order: 0,
        description: "The home hub.",
      });
      registerHub({
        id: "library",
        label: "Library",
        icon: BookOpen,
        route: "/library",
        component: DummyComponent,
        order: 10,
        description: "Browse the library.",
      });

      renderHomePage();

      expect(screen.getByText("Jump back in")).toBeInTheDocument();
      // Hub count: only the non-home hub (library) counts
      expect(screen.getByText("1 workspace")).toBeInTheDocument();
    });

    it("renders one card per non-home hub with label and description", () => {
      registerHub({
        id: "home",
        label: "Home",
        icon: DummyComponent,
        route: "/home",
        component: DummyComponent,
        order: 0,
      });
      registerHub({
        id: "library",
        label: "Library",
        icon: BookOpen,
        route: "/library",
        component: DummyComponent,
        order: 10,
        description: "Browse, search, and organize your lab's entries.",
      });
      registerHub({
        id: "eln",
        label: "ELN Notebook",
        icon: DummyComponent,
        route: "/eln",
        component: DummyComponent,
        order: 20,
        description: "Daily electronic lab notebook entries.",
      });

      renderHomePage();

      // Non-home hubs should be rendered
      expect(screen.getByText("Library")).toBeInTheDocument();
      expect(
        screen.getByText("Browse, search, and organize your lab's entries."),
      ).toBeInTheDocument();
      expect(screen.getByText("ELN Notebook")).toBeInTheDocument();
      expect(
        screen.getByText("Daily electronic lab notebook entries."),
      ).toBeInTheDocument();

      // Hub count
      expect(screen.getByText("2 workspaces")).toBeInTheDocument();
    });

    it("excludes the home hub from the card grid", () => {
      registerHub({
        id: "home",
        label: "Home",
        icon: DummyComponent,
        route: "/home",
        component: DummyComponent,
        order: 0,
      });
      registerHub({
        id: "library",
        label: "Library",
        icon: BookOpen,
        route: "/library",
        component: DummyComponent,
        order: 10,
        description: "Browse the library.",
      });

      renderHomePage();

      // "Home" label should not appear as a card heading (only as greeting)
      const cardHeadings = screen.getAllByRole("heading", { level: 3 });
      const homeCards = cardHeadings.filter((h) => h.textContent === "Home");
      expect(homeCards).toHaveLength(0);
    });

    it("links each card to the hub's route", () => {
      registerHub({
        id: "home",
        label: "Home",
        icon: DummyComponent,
        route: "/home",
        component: DummyComponent,
        order: 0,
      });
      registerHub({
        id: "library",
        label: "Library",
        icon: BookOpen,
        route: "/library",
        component: DummyComponent,
        order: 10,
        description: "The library.",
      });

      renderHomePage();

      const libraryLink = screen.getByRole("link", { name: /Library/i });
      expect(libraryLink).toHaveAttribute("href", "/library");
    });

    it("shows an empty state message when no non-home hubs exist", () => {
      // Only the home hub registered — no non-home hubs
      registerHub({
        id: "home",
        label: "Home",
        icon: DummyComponent,
        route: "/home",
        component: DummyComponent,
        order: 0,
      });

      renderHomePage();

      expect(screen.getByText(/No other workspaces available/i)).toBeInTheDocument();
      expect(screen.getByText("0 workspaces")).toBeInTheDocument();
    });

    it("renders the hardcoded placeholder stats line and footer on each card", () => {
      registerHub({
        id: "home",
        label: "Home",
        icon: DummyComponent,
        route: "/home",
        component: DummyComponent,
        order: 0,
      });
      registerHub({
        id: "library",
        label: "Library",
        icon: BookOpen,
        route: "/library",
        component: DummyComponent,
        order: 10,
        description: "The library.",
      });

      renderHomePage();

      // Placeholder stats line
      expect(screen.getByText("2 active · 14 entries")).toBeInTheDocument();

      // Footer with chip and timestamp
      expect(screen.getByText("open")).toBeInTheDocument();
      expect(screen.getByText("edited 8 min ago")).toBeInTheDocument();
    });
  });
});
