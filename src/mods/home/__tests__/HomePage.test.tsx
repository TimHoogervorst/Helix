/**
 * Tests for HomePage — the Home hub dashboard.
 *
 * Verifies:
 *  - Decorative header bar renders
 *  - Greeting section shows user's username from useCurrentUser
 *  - Greeting section includes the placeholder subtitle
 *  - Metric Cards bar renders live cards with values from the API
 *  - Metric Cards bar empty state when no cards exist
 *  - Metric Cards bar loading skeleton
 *  - Jump Back In section heading with hub count
 *  - Hub cards for non-home hubs with labels, descriptions, and link targets
 *  - Home hub is excluded from cards
 *  - Empty state when no non-home hubs exist
 *  - Recent Activity panel with heading, live chip, five activity items
 *  - Today in the Lab panel with heading, trending icon, four timeline entries
 *  - Both panels render side by side, no inspirational quote
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { HubConfig } from "../../../shell/src/mod-system/types";

// Mock the Metric Cards API so the cards bar loads from seeded data
vi.mock("../api", () => ({
  getCards: vi.fn(),
  getMetricValue: vi.fn(),
}));

import * as cardApi from "../api";

// Mock useCurrentUser so the greeting renders with a known username
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
  vi.mocked(cardApi.getCards).mockReset();
  vi.mocked(cardApi.getMetricValue).mockReset();
  vi.mocked(cardApi.getCards).mockResolvedValue([]);
  vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 0 });
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

  it("does not render the decorative header bar (removed during profile redesign)", () => {
    renderHomePage();
    // The decorative header was intentionally removed — verify no element
    // with both border-b-1 and border-border classes exists
    const decorativeHeader = document.querySelector(".border-b-1.border-border");
    expect(decorativeHeader).not.toBeInTheDocument();
  });

  // ── Greeting section ───────────────────────────────────────────────────

  it("renders a greeting with the user's username", () => {
    renderHomePage();
    expect(screen.getByText(/Good morning,/i)).toBeInTheDocument();
    expect(screen.getByText("mkato")).toBeInTheDocument();
  });

  it("styles the username in italic primary color", () => {
    renderHomePage();
    const userName = screen.getByText("mkato");
    expect(userName).toHaveClass("italic");
    expect(userName).toHaveClass("text-primary");
  });

  it("renders 'Your bench is warm.' below the greeting", () => {
    renderHomePage();
    expect(screen.getByText(/Your bench is warm\./)).toBeInTheDocument();
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

  // ── Metric Cards bar ───────────────────────────────────────────────────

  describe("Metric Cards bar", () => {
    const defaultCard = {
      id: 1,
      owner: null as number | null,
      owner_username: null as string | null,
      is_global: true,
      metric: 1,
      metric_name: "Count — In-progress entries",
      surface: "home",
      order: 0,
      label: "In-progress entries",
      icon: "scroll-text",
      formatting: { rules: [], default: { color: "flask", icon: "flask-conical", text: null } },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    function makeCard(overrides: Partial<typeof defaultCard> = {}) {
      return { ...defaultCard, ...overrides };
    }

    const seededCards = [
      makeCard(),
      makeCard({
        id: 2,
        metric: 2,
        metric_name: "Count — My entities",
        label: "Entities created",
        icon: "test-tubes",
        order: 1,
      }),
    ];

    it("renders cards with live values from the API", async () => {
      vi.mocked(cardApi.getCards).mockResolvedValue(seededCards);
      vi.mocked(cardApi.getMetricValue)
        .mockResolvedValueOnce({ value: 7 })
        .mockResolvedValueOnce({ value: 42 });

      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText("In-progress entries")).toBeInTheDocument();
        expect(screen.getByText("Entities created")).toBeInTheDocument();
      });

      expect(screen.getByText("7")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("passes the current user's identity to getMetricValue for is_me resolution", async () => {
      vi.mocked(cardApi.getCards).mockResolvedValue([makeCard()]);
      vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 3 });

      renderHomePage();

      await waitFor(() => {
        expect(cardApi.getMetricValue).toHaveBeenCalledWith(1, "mkato");
      });
    });

    it("shows a loading skeleton while cards are loading", () => {
      vi.mocked(cardApi.getCards).mockReturnValue(new Promise(() => {}));

      renderHomePage();

      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThanOrEqual(4);
    });

    it("shows empty state when no cards exist for the surface", async () => {
      vi.mocked(cardApi.getCards).mockResolvedValue([]);

      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText("Pin a metric to see it here.")).toBeInTheDocument();
      });
    });

    it("shows an error chip when a single metric value fails to load", async () => {
      vi.mocked(cardApi.getCards).mockResolvedValue([makeCard()]);
      vi.mocked(cardApi.getMetricValue).mockRejectedValue(new Error("Network Error"));

      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText("Failed to load")).toBeInTheDocument();
      });
    });

    it("handles cards API failure gracefully (shows empty state)", async () => {
      vi.mocked(cardApi.getCards).mockRejectedValue(new Error("Server Error"));

      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText("Pin a metric to see it here.")).toBeInTheDocument();
      });
    });

    it("supports horizontal scrolling when there are more than 4 cards", async () => {
      const manyCards = Array.from({ length: 6 }, (_, i) =>
        makeCard({ id: i + 1, order: i, label: `Card ${i + 1}` }),
      );
      vi.mocked(cardApi.getCards).mockResolvedValue(manyCards);

      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText("Card 1")).toBeInTheDocument();
        expect(screen.getByText("Card 6")).toBeInTheDocument();
      });

      // The scroll container should be present with overflow-x-auto
      const sections = document.querySelectorAll(
        "section.border-y-1.border-border",
      );
      expect(sections.length).toBeGreaterThanOrEqual(1);
      const cardsSection = sections[sections.length - 1];
      const scrollContainer = cardsSection.querySelector(".overflow-x-auto");
      expect(scrollContainer).toBeInTheDocument();

      // Each card should have w-1/4 (25% width), so 6 cards = 150% of parent → overflow
      const cardEls = scrollContainer!.querySelectorAll(".w-1\\/4");
      expect(cardEls.length).toBe(6);
    });

    it("falls back to metric_name when label is empty", async () => {
      vi.mocked(cardApi.getCards).mockResolvedValue([
        makeCard({ label: "" }),
      ]);
      vi.mocked(cardApi.getMetricValue).mockResolvedValue({ value: 5 });

      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText("Count — In-progress entries")).toBeInTheDocument();
      });
    });
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
      registerHub({
        id: "home.home",
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
      expect(screen.getByText("1 workspace")).toBeInTheDocument();
    });

    it("renders one card per non-home hub with label and description", () => {
      registerHub({
        id: "home.home",
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

      expect(screen.getByText("Library")).toBeInTheDocument();
      expect(
        screen.getByText("Browse, search, and organize your lab's entries."),
      ).toBeInTheDocument();
      expect(screen.getByText("ELN Notebook")).toBeInTheDocument();
      expect(
        screen.getByText("Daily electronic lab notebook entries."),
      ).toBeInTheDocument();

      expect(screen.getByText("2 workspaces")).toBeInTheDocument();
    });

    it("excludes the home hub from the card grid", () => {
      registerHub({
        id: "home.home",
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

      const cardHeadings = screen.getAllByRole("heading", { level: 3 });
      const homeCards = cardHeadings.filter((h) => h.textContent === "Home");
      expect(homeCards).toHaveLength(0);
    });

    it("links each card to the hub's route", () => {
      registerHub({
        id: "home.home",
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
      registerHub({
        id: "home.home",
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
        id: "home.home",
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

      const statsElements = screen.getAllByText("2 active · 14 entries");
      expect(statsElements.length).toBe(1);

      expect(screen.getByText("open")).toBeInTheDocument();
      expect(screen.getByText("edited 8 min ago")).toBeInTheDocument();
    });
  });

  // ── Recent Activity panel ─────────────────────────────────────────────

  describe("Recent Activity", () => {
    it("renders the panel heading and live chip", () => {
      renderHomePage();
      expect(
        screen.getByRole("heading", { name: "Recent activity" }),
      ).toBeInTheDocument();
      expect(screen.getByText("live")).toBeInTheDocument();
      // The live chip includes a green pulsing dot
      const liveChip = screen.getByText("live").closest(".chip");
      expect(liveChip).toBeInTheDocument();
      expect(liveChip!.querySelector(".bg-green-500")).toBeInTheDocument();
    });

    it("renders all five activity items with person names", () => {
      renderHomePage();
      expect(screen.getByText(/Mira Kato/)).toBeInTheDocument();
      expect(screen.getByText(/James Chen/)).toBeInTheDocument();
      expect(screen.getByText(/Priya Sharma/)).toBeInTheDocument();
      expect(screen.getByText(/Alex Müller/)).toBeInTheDocument();
      expect(screen.getByText(/Sarah Okafor/)).toBeInTheDocument();
    });

    it("renders activity actions and targets", () => {
      renderHomePage();
      expect(screen.getByText(/PCR run #142/)).toBeInTheDocument();
      expect(screen.getByText(/Buffer prep SOP/)).toBeInTheDocument();
      expect(screen.getByText(/Cell culture passage/)).toBeInTheDocument();
      expect(screen.getByText(/Incubator temperature/)).toBeInTheDocument();
      expect(screen.getByText(/Western blot results/)).toBeInTheDocument();
    });

    it("renders monospaced timestamps with file paths", () => {
      renderHomePage();
      // Each activity row has a timestamp + file path in mono font
      expect(screen.getByText(/2 min ago/)).toBeInTheDocument();
      expect(screen.getByText(/18 min ago/)).toBeInTheDocument();
      expect(screen.getByText(/47 min ago/)).toBeInTheDocument();
      expect(screen.getByText(/1 hour ago/)).toBeInTheDocument();
      expect(screen.getByText(/2 hours ago/)).toBeInTheDocument();
    });

    it("renders the panel inside a bordered card", () => {
      renderHomePage();
      const heading = screen.getByRole("heading", {
        name: "Recent activity",
      });
      const section = heading.closest("section");
      expect(section).toBeInTheDocument();
      expect(section).toHaveClass("rounded-lg");
      expect(section).toHaveClass("border");
      expect(section).toHaveClass("border-border");
      expect(section).toHaveClass("bg-panel");
    });
  });

  // ── Today in the Lab panel ────────────────────────────────────────────

  describe("Today in the Lab", () => {
    it("renders the panel heading and trending icon", () => {
      renderHomePage();
      expect(
        screen.getByRole("heading", { name: "Today in the lab" }),
      ).toBeInTheDocument();
      // The trending icon (TrendingUp) is an SVG with aria-hidden in the heading row
      const heading = screen.getByRole("heading", {
        name: "Today in the lab",
      });
      const headingRow = heading.closest("div");
      expect(headingRow).toBeInTheDocument();
      expect(
        headingRow!.querySelector("svg[aria-hidden='true']"),
      ).toBeInTheDocument();
    });

    it("renders all four timeline entries with time labels", () => {
      renderHomePage();
      expect(screen.getByText("09:15")).toBeInTheDocument();
      expect(screen.getByText("10:30")).toBeInTheDocument();
      expect(screen.getByText("13:45")).toBeInTheDocument();
      expect(screen.getByText("15:00")).toBeInTheDocument();
    });

    it("renders timeline descriptions", () => {
      renderHomePage();
      expect(
        screen.getByText(/Daily instrument calibration completed/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/New reagent batch QC passed/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Safety inspection walkthrough starting/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Freezer −80 °C defrost cycle/),
      ).toBeInTheDocument();
    });

    it("renders the panel inside a bordered card", () => {
      renderHomePage();
      const heading = screen.getByRole("heading", {
        name: "Today in the lab",
      });
      const section = heading.closest("section");
      expect(section).toBeInTheDocument();
      expect(section).toHaveClass("rounded-lg");
      expect(section).toHaveClass("border");
      expect(section).toHaveClass("border-border");
      expect(section).toHaveClass("bg-panel");
    });
  });

  // ── Panel layout ──────────────────────────────────────────────────────

  describe("panel layout", () => {
    it("renders Recent Activity and Today in the Lab side by side", () => {
      renderHomePage();
      // Both panels should be present
      expect(
        screen.getByRole("heading", { name: "Recent activity" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Today in the lab" }),
      ).toBeInTheDocument();
    });

    it("does not render an inspirational quote", () => {
      renderHomePage();
      expect(
        screen.queryByText(/Asimov/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/inspiration/i),
      ).not.toBeInTheDocument();
    });
  });
});
