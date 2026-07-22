/**
 * Tests for HomePage — the Home hub dashboard.
 *
 * Verifies:
 *  - Decorative header bar renders
 *  - Greeting section shows user's first name from useCurrentUser
 *  - Greeting section includes the placeholder subtitle
 *  - Stats bar renders all four hardcoded metric tiles
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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
});
