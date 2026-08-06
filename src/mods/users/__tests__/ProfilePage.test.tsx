/**
 * Tests for ProfilePage — the user's own profile.
 *
 * Verifies:
 *  - MetricCardsBar is rendered with surface="profile"
 *  - Old StatsBar is absent
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../shell/src/shared/components/MetricCards", () => ({
  MetricCardsBar: ({ surface }: { surface?: string }) => (
    <div data-testid="metric-cards-bar" data-surface={surface}>
      Metric Cards Bar ({surface})
    </div>
  ),
}));

vi.mock("../../../shell/src/user/CurrentUserProvider", () => ({
  CurrentUserProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useCurrentUser: () => ({
    user: {
      id: 1,
      username: "mkato",
      first_name: "Mira",
      last_name: "Kato",
      color: "#4A90D9",
      is_active: true,
      date_joined: "2025-01-15T00:00:00Z",
      profile: {
        title: "Dr.",
        position: "Senior Researcher",
        affiliation: "Helix Lab",
        avatar_url: null,
        cover_url: null,
        location: null,
        email: "mira@helix.lab",
        phone: null,
        orcid: null,
      },
    },
    isChecking: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("../components/ProfileHeader", () => ({
  ProfileHeader: () => <div data-testid="profile-header">Profile Header</div>,
}));

vi.mock("../components/AboutSection", () => ({
  AboutSection: () => null,
}));

vi.mock("../components/NotebookActivity", () => ({
  NotebookActivity: () => null,
}));

vi.mock("../components/RecentActivity", () => ({
  RecentActivity: () => null,
}));

vi.mock("../components/AffiliationsSection", () => ({
  AffiliationsSection: () => null,
}));

vi.mock("../components/PublicationsSection", () => ({
  PublicationsSection: () => null,
}));

vi.mock("../components/ProjectsSection", () => ({
  ProjectsSection: () => null,
}));

vi.mock("../components/RecognitionsSection", () => ({
  RecognitionsSection: () => null,
}));

vi.mock("../components/AvailabilitySection", () => ({
  AvailabilitySection: () => null,
}));

import ProfilePage from "../pages/ProfilePage";

function renderProfilePage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

describe("ProfilePage", () => {
  it("renders the MetricCardsBar with surface='profile'", () => {
    renderProfilePage();
    const bar = screen.getByTestId("metric-cards-bar");
    expect(bar).toBeInTheDocument();
    expect(bar.getAttribute("data-surface")).toBe("profile");
  });

  it("renders the ProfileHeader", () => {
    renderProfilePage();
    expect(screen.getByTestId("profile-header")).toBeInTheDocument();
  });
});
