import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../../../shell/src/preferences";
import OrganizationPage from "../components/OrganizationPage";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../../../shell/src/user/CurrentUserProvider", () => ({
  CurrentUserProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useCurrentUser: vi.fn(),
}));

const mockFetchOrganization = vi.fn();
const mockFetchPeople = vi.fn();
const mockFetchPolicies = vi.fn();
const mockFetchTeams = vi.fn();
const mockFetchProjectsWithRole = vi.fn();
const mockUpdateOrganization = vi.fn();

vi.mock("../api", () => ({
  fetchOrganization: (...args: unknown[]) => mockFetchOrganization(...args),
  fetchPeople: (...args: unknown[]) => mockFetchPeople(...args),
  fetchPolicies: (...args: unknown[]) => mockFetchPolicies(...args),
  fetchTeams: (...args: unknown[]) => mockFetchTeams(...args),
  fetchProjectsWithRole: (...args: unknown[]) => mockFetchProjectsWithRole(...args),
  updateOrganization: (...args: unknown[]) => mockUpdateOrganization(...args),
}));

import { useCurrentUser } from "../../../shell/src/user/CurrentUserProvider";

// ── Fixtures ───────────────────────────────────────────────────────────────

const defaultOrg = {
  id: 1,
  name: "Test Corp",
  short_description: "A test organization",
  address: "123 Main St",
  icon_key: "building",
  color_key: "blue",
};

const defaultPeople = [
  {
    id: 1,
    user: 1,
    username: "mkato",
    first_name: "Mira",
    last_name: "Kato",
    color: "#4A90D9",
    role: "admin" as const,
    created_at: "2025-01-15T00:00:00Z",
  },
  {
    id: 2,
    user: 2,
    username: "jdoe",
    first_name: "Jane",
    last_name: "Doe",
    color: "#E94E77",
    role: "user" as const,
    created_at: "2025-02-01T00:00:00Z",
  },
];

const defaultTeams = [
  {
    id: 1,
    name: "Research",
    icon_key: "flask",
    color_key: "blue",
    members: [
      {
        id: 1,
        username: "mkato",
        first_name: "Mira",
        last_name: "Kato",
        color: "#4A90D9",
      },
    ],
    blocked_from_deletion: false,
  },
  {
    id: 2,
    name: "Development",
    icon_key: "code",
    color_key: "green",
    members: [
      {
        id: 2,
        username: "jdoe",
        first_name: "Jane",
        last_name: "Doe",
        color: "#E94E77",
      },
    ],
    blocked_from_deletion: false,
  },
];

const defaultPolicies = [
  {
    id: "1",
    core_action: "read",
    resource: "helix",
    resource_label: "Helix",
    required_level: "authenticated",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function renderOrganizationPage(role: string | null = "admin") {
  vi.mocked(useCurrentUser).mockReturnValue({
    user: {
      id: 1,
      username: "mkato",
      organization_role: role,
    },
    isChecking: false,
    error: null,
    refresh: vi.fn(),
  } as any);

  return render(
    <MemoryRouter>
      <ThemeProvider>
        <OrganizationPage />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchOrganization.mockResolvedValue(defaultOrg);
  mockFetchPeople.mockResolvedValue(defaultPeople);
  mockFetchTeams.mockResolvedValue(defaultTeams);
  mockFetchProjectsWithRole.mockResolvedValue([]);
  mockFetchPolicies.mockResolvedValue(defaultPolicies);
});

// ── Role-based rendering ──────────────────────────────────────────────────

describe("OrganizationPage role-based rendering", () => {
  it("shows edit button for admin users", async () => {
    renderOrganizationPage("admin");
    await screen.findByText("Test Corp");
    expect(
      screen.getByRole("button", { name: "Edit organization" }),
    ).toBeInTheDocument();
  });

  it("does not show edit button for non-admin users", async () => {
    renderOrganizationPage("user");
    await screen.findByText("Test Corp");
    expect(
      screen.queryByRole("button", { name: "Edit organization" }),
    ).not.toBeInTheDocument();
  });

  it("shows organization name, short_description, and address", async () => {
    renderOrganizationPage("admin");
    expect(await screen.findByText("Test Corp")).toBeInTheDocument();
    expect(screen.getByText("A test organization")).toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
  });
});

// ── Admin editing ─────────────────────────────────────────────────────────

describe("OrganizationPage admin editing", () => {
  it("enters edit mode when edit button is clicked", async () => {
    renderOrganizationPage("admin");
    await screen.findByText("Test Corp");

    fireEvent.click(screen.getByRole("button", { name: "Edit organization" }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Short description")).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel editing" }),
    ).toBeInTheDocument();
  });

  it("saves organization changes when save is clicked", async () => {
    mockUpdateOrganization.mockResolvedValue({
      ...defaultOrg,
      name: "New Name",
      short_description: "Updated desc",
      address: "456 Oak Ave",
    });

    renderOrganizationPage("admin");
    await screen.findByText("Test Corp");

    fireEvent.click(screen.getByRole("button", { name: "Edit organization" }));

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New Name" },
    });
    fireEvent.change(screen.getByLabelText("Short description"), {
      target: { value: "Updated desc" },
    });
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "456 Oak Ave" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockUpdateOrganization).toHaveBeenCalledWith({
        name: "New Name",
        short_description: "Updated desc",
        address: "456 Oak Ave",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("New Name")).toBeInTheDocument();
    });
  });

  it("cancels editing and reverts to displayed values", async () => {
    renderOrganizationPage("admin");
    await screen.findByText("Test Corp");

    fireEvent.click(screen.getByRole("button", { name: "Edit organization" }));

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New Name" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel editing" }));

    expect(screen.getByText("Test Corp")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(mockUpdateOrganization).not.toHaveBeenCalled();
  });
});

// ── Teams tab ─────────────────────────────────────────────────────────────

describe("OrganizationPage Teams tab", () => {
  it("shows Teams tab in the TabBar", async () => {
    renderOrganizationPage("admin");
    await screen.findByText("Test Corp");
    expect(screen.getByText("Teams")).toBeInTheDocument();
  });

  it("groups viewer's teams into Your Teams", async () => {
    renderOrganizationPage("admin");
    await screen.findByText("Test Corp");

    fireEvent.click(screen.getByText("Teams"));

    await waitFor(() => {
      expect(screen.getByText("Your Teams")).toBeInTheDocument();
      expect(screen.getByText("Other Teams")).toBeInTheDocument();
    });
  });

  it("shows team name and member chips in Team cards", async () => {
    renderOrganizationPage("admin");
    await screen.findByText("Test Corp");

    fireEvent.click(screen.getByText("Teams"));

    await waitFor(() => {
      expect(screen.getByText("Research")).toBeInTheDocument();
      expect(screen.getByText("Development")).toBeInTheDocument();
    });
  });

  it("shows all teams as Other Teams when viewer is not a member", async () => {
    vi.mocked(useCurrentUser).mockReturnValue({
      user: {
        id: 99,
        username: "outsider",
        organization_role: "user",
      },
      isChecking: false,
      error: null,
      refresh: vi.fn(),
    } as any);

    render(
      <MemoryRouter>
        <ThemeProvider>
          <OrganizationPage />
        </ThemeProvider>
      </MemoryRouter>,
    );

    await screen.findByText("Test Corp");
    fireEvent.click(screen.getByText("Teams"));

    await waitFor(() => {
      expect(screen.queryByText("Your Teams")).not.toBeInTheDocument();
      expect(screen.getByText("Other Teams")).toBeInTheDocument();
    });
  });

  it("shows empty state when no teams exist", async () => {
    mockFetchTeams.mockResolvedValue([]);

    renderOrganizationPage("admin");
    await screen.findByText("Test Corp");

    fireEvent.click(screen.getByText("Teams"));

    await waitFor(() => {
      expect(screen.getByText("No Teams have been created yet.")).toBeInTheDocument();
    });
  });
});
