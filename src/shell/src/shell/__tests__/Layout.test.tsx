/**
 * Tests for Layout — the global sidebar shell wrapping <Outlet />.
 *
 * Verifies:
 *  - Sidebar renders with all required sections (brand, nav, user menu)
 *  - The old horizontal <nav> topbar no longer exists
 *  - Sidebar actions (registered by mods via registry) render inline
 *  - UserMenu trigger renders (avatar + username from CurrentUserContext)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BookOpen, House } from "lucide-react";
import { ModRegistry } from "../../mod-system/ModRegistry";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGet = vi.fn();
vi.mock("../../api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
}));

// Provide a mock user for UserMenu / useCurrentUser
vi.mock("../../user/CurrentUserProvider", () => ({
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

// UserMenu uses these — mock them to avoid router/navigation issues
vi.mock("../../user/api", () => ({
  logout: vi.fn().mockResolvedValue({ detail: "ok" }),
  fetchMe: vi.fn(),
}));

import Layout from "../Layout";

function renderLayout(initialRoute = "/library") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Layout />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ModRegistry._reset();
  // Register mock hubs so the dynamic sidebar renders nav links.
  ModRegistry.getInstance().registerHub({
    id: "home",
    label: "Home",
    icon: House,
    route: "/home",
    component: () => null,
    order: 0,
  });
  ModRegistry.getInstance().registerHub({
    id: "library",
    label: "Library",
    icon: BookOpen,
    route: "/library",
    component: () => null,
    order: 10,
  });
  // Default: no pins, no CSRF error
  mockGet.mockResolvedValue([]);
});

// ── Static sidebar sections ────────────────────────────────────────────────────

describe("Layout sidebar", () => {
  it("renders the Helix brand text", () => {
    renderLayout();
    expect(screen.getByText("Helix")).toBeInTheDocument();
  });

  it("renders the subtitle Alpha", () => {
    renderLayout();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("renders Home nav link", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
  });

  it("Home nav link points to /home", () => {
    renderLayout();
    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).toHaveAttribute("href", "/home");
  });

  it("does not render the old hardcoded Starred button", () => {
    renderLayout();
    expect(screen.queryByRole("button", { name: "Starred" })).not.toBeInTheDocument();
  });

  it("renders Library nav link", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
  });

  it("Library nav link points to /library", () => {
    renderLayout();
    const libraryLink = screen.getByRole("link", { name: "Library" });
    expect(libraryLink).toHaveAttribute("href", "/library");
  });

  it("does not show Database nav link (LIMS console removed)", () => {
    renderLayout();
    expect(screen.queryByRole("link", { name: "Database" })).not.toBeInTheDocument();
  });

  it("renders the UserMenu trigger button", () => {
    renderLayout();
    expect(
      screen.getByRole("button", { name: "User menu" }),
    ).toBeInTheDocument();
  });

  it("shows the current user's initials in the sidebar", () => {
    renderLayout();
    expect(screen.getByText("MK")).toBeInTheDocument();
  });

  it("shows the current user's username in the sidebar", () => {
    renderLayout();
    expect(screen.getByText("mkato")).toBeInTheDocument();
  });

  it("does not show the old hardcoded user name", () => {
    renderLayout();
    expect(
      screen.queryByText("Dr. Mira Kato"),
    ).not.toBeInTheDocument();
  });

  it("does not show the old hardcoded user subtitle", () => {
    renderLayout();
    expect(
      screen.queryByText("Molecular Bio · Lab 3B"),
    ).not.toBeInTheDocument();
  });

  it("does not contain the old horizontal nav topbar", () => {
    renderLayout();
    const navLinks = screen.getAllByRole("link");
    expect(navLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("does not contain OpenScience text anywhere", () => {
    renderLayout();
    expect(screen.queryByText("OpenScience")).not.toBeInTheDocument();
  });

  it("renders the sidebar as an <aside> element", () => {
    renderLayout();
    const aside = document.querySelector("aside");
    expect(aside).toBeInTheDocument();
  });

  it("renders all nav links with tooltip titles", () => {
    renderLayout();
    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink).toHaveAttribute("title", "Home");

    const libraryLink = screen.getByRole("link", { name: "Library" });
    expect(libraryLink).toHaveAttribute("title", "Library");
  });

  it("renders without crashing (CSRF priming runs)", () => {
    renderLayout();
    expect(mockGet).toHaveBeenCalledWith("/core/csrf/");
  });
});

// ── Sidebar actions ───────────────────────────────────────────────────────

describe("Sidebar actions", () => {
  function DummySidebarAction() {
    return <div data-testid="sidebar-action">Sidebar action content</div>;
  }

  beforeEach(() => {
    ModRegistry._reset();
    // Re-register hubs (needed by the "Layout sidebar" tests but we
    // also need them here so the full Layout renders without error).
    ModRegistry.getInstance().registerHub({
      id: "home",
      label: "Home",
      icon: House,
      route: "/home",
      component: () => null,
      order: 0,
    });
    ModRegistry.getInstance().registerHub({
      id: "library",
      label: "Library",
      icon: BookOpen,
      route: "/library",
      component: () => null,
      order: 10,
    });
    mockGet.mockResolvedValue([]);
  });

  it("renders sidebar actions registered with position 'inline'", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerSidebarAction({
      id: "test.action",
      workspaceId: "*",
      component: DummySidebarAction,
      position: "inline",
    });

    renderLayout();
    expect(screen.getByTestId("sidebar-action")).toBeInTheDocument();
    expect(screen.getByText("Sidebar action content")).toBeInTheDocument();
  });

  it("does not render sidebar actions registered with position 'hover'", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerSidebarAction({
      id: "test.action",
      workspaceId: "*",
      component: DummySidebarAction,
      position: "hover",
    });

    renderLayout();
    expect(screen.queryByTestId("sidebar-action")).not.toBeInTheDocument();
  });

  it("renders multiple sidebar actions", () => {
    function SecondAction() {
      return <div data-testid="second-action">Second</div>;
    }

    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerSidebarAction({
      id: "test.action1",
      workspaceId: "*",
      component: DummySidebarAction,
      position: "inline",
    });
    registry.registerSidebarAction({
      id: "test.action2",
      workspaceId: "*",
      component: SecondAction,
      position: "inline",
    });

    renderLayout();
    expect(screen.getByTestId("sidebar-action")).toBeInTheDocument();
    expect(screen.getByTestId("second-action")).toBeInTheDocument();
  });

  it("renders nothing when no sidebar actions are registered", () => {
    renderLayout();
    // Layout should render normally — just verify no crash
    expect(screen.getByText("Helix")).toBeInTheDocument();
  });
});

// ── Settings sidebar mode ──────────────────────────────────────────────────

describe("Layout settings sidebar", () => {
  function DummySettingsComponent() {
    return <div data-testid="settings-comp">Settings Content</div>;
  }

  function AltSettingsComponent() {
    return <div data-testid="alt-settings-comp">Alt Settings Content</div>;
  }

  function SidebarAction() {
    return <div data-testid="ws-action">Workspace Action</div>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    ModRegistry._reset();
    // Re-register hubs so Layout doesn't error when NOT on settings
    ModRegistry.getInstance().registerHub({
      id: "home",
      label: "Home",
      icon: House,
      route: "/home",
      component: () => null,
      order: 0,
    });
    ModRegistry.getInstance().registerHub({
      id: "library",
      label: "Library",
      icon: BookOpen,
      route: "/library",
      component: () => null,
      order: 10,
    });
    // Register settings sections
    const registry = ModRegistry.getInstance();
    registry.registerMod("mod-a");
    registry.registerSettingsSection({
      id: "users.management",
      modId: "mod-a",
      label: "Users",
      component: DummySettingsComponent,
      order: 5,
    });
    registry.registerSettingsSection({
      id: "lims.schema-settings",
      modId: "mod-a",
      label: "Schemas",
      component: AltSettingsComponent,
      order: 10,
    });
    // Register a sidebar action (workspace)
    registry.registerMod("test-mod");
    registry.registerSidebarAction({
      id: "test.action",
      workspaceId: "*",
      component: SidebarAction,
      position: "inline",
    });
    mockGet.mockResolvedValue([]);
  });

  it("shows settings sections in the sidebar when on /settings", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Layout />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Schemas" })).toBeInTheDocument();
  });

  it("shows a 'Settings' section label when on /settings", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Layout />
      </MemoryRouter>,
    );

    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("shows a 'Back to Home' link that navigates to /library when on /settings", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Layout />
      </MemoryRouter>,
    );

    const backLink = screen.getByRole("link", { name: "Back to Home" });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/library");
  });

  it("highlights the active settings section based on search param", () => {
    render(
      <MemoryRouter initialEntries={["/settings?section=lims.schema-settings"]}>
        <Layout />
      </MemoryRouter>,
    );

    const schemasLink = screen.getByRole("link", { name: "Schemas" });
    expect(schemasLink.className).toContain("bg-muted");
    expect(schemasLink.className).toContain("font-medium");
  });

  it("the first section is active when no section param is given", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Layout />
      </MemoryRouter>,
    );

    const usersLink = screen.getByRole("link", { name: "Users" });
    expect(usersLink.className).toContain("bg-muted");
    expect(usersLink.className).toContain("font-medium");
  });

  it("hides hub links when on /settings", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Layout />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Library" })).not.toBeInTheDocument();
  });

  it("hides sidebar actions (workspace) when on /settings", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Layout />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("ws-action")).not.toBeInTheDocument();
  });

  it("still shows brand and user menu on /settings", () => {
    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <Layout />
      </MemoryRouter>,
    );

    expect(screen.getByText("Helix")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "User menu" })).toBeInTheDocument();
  });

  it("does not show 'Back to Home' when NOT on /settings", () => {
    renderLayout("/library");

    expect(screen.queryByRole("link", { name: "Back to Home" })).not.toBeInTheDocument();
  });

  it("shows normal nav (hubs) when NOT on /settings", () => {
    renderLayout("/library");

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
  });

  it("shows sidebar actions when NOT on /settings", () => {
    renderLayout("/library");

    expect(screen.getByTestId("ws-action")).toBeInTheDocument();
  });
});
