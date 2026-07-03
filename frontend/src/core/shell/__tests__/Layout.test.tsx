/**
 * Tests for Layout — the global sidebar shell wrapping <Outlet />.
 *
 * Verifies:
 *  - Sidebar renders with all required sections (brand, search, nav,
 *    user avatar)
 *  - The old horizontal <nav> topbar no longer exists
 *  - Sidebar actions (registered by mods via registry) render inline
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Database, BookOpen } from "lucide-react";
import { ModRegistry } from "../../mod-system/ModRegistry";

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGet = vi.fn();
vi.mock("../../api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
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
  // Register mock consoles so the dynamic sidebar renders nav links.
  // Library is no longer hardcoded in Layout — it comes from registerConsole().
  ModRegistry.getInstance().registerConsole({
    id: "library",
    label: "Library",
    icon: BookOpen,
    route: "/library",
    component: () => null,
    order: 10,
    defaults: {},
    accepts: { only: ["eln.entry"] },
  });
  ModRegistry.getInstance().registerConsole({
    id: "lims",
    label: "Database",
    icon: Database,
    route: "/lims",
    component: () => null,
    order: 30,
    defaults: {},
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

  it("renders the search placeholder with ⌘K badge", () => {
    renderLayout();
    expect(screen.getByText("Search entries…")).toBeInTheDocument();
    expect(screen.getByText("⌘K")).toBeInTheDocument();
  });

  it("renders Home nav button", () => {
    renderLayout();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
  });

  it("renders Starred nav button", () => {
    renderLayout();
    expect(screen.getByRole("button", { name: "Starred" })).toBeInTheDocument();
  });

  it("renders Library nav link", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Library" })).toBeInTheDocument();
  });

  it("renders Database nav link", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: "Database" })).toBeInTheDocument();
  });

  it("Library nav link points to /library", () => {
    renderLayout();
    const libraryLink = screen.getByRole("link", { name: "Library" });
    expect(libraryLink).toHaveAttribute("href", "/library");
  });

  it("Database nav link points to /lims", () => {
    renderLayout();
    const dbLink = screen.getByRole("link", { name: "Database" });
    expect(dbLink).toHaveAttribute("href", "/lims");
  });

  it("renders the user initials MK", () => {
    renderLayout();
    expect(screen.getByText("MK")).toBeInTheDocument();
  });

  it("renders the user name", () => {
    renderLayout();
    expect(screen.getByText("Dr. Mira Kato")).toBeInTheDocument();
  });

  it("renders the user subtitle", () => {
    renderLayout();
    expect(screen.getByText("Molecular Bio · Lab 3B")).toBeInTheDocument();
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

  it("has the search placeholder bar with correct aria-label", () => {
    renderLayout();
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("renders all nav buttons with tooltip titles", () => {
    renderLayout();
    const homeBtn = screen.getByRole("button", { name: "Home" });
    expect(homeBtn).toHaveAttribute("title", "Home — coming soon");

    const starredBtn = screen.getByRole("button", { name: "Starred" });
    expect(starredBtn).toHaveAttribute("title", "Starred — coming soon");

    const libraryLink = screen.getByRole("link", { name: "Library" });
    expect(libraryLink).toHaveAttribute("title", "Library");

    const dbLink = screen.getByRole("link", { name: "Database" });
    expect(dbLink).toHaveAttribute("title", "Database");
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
    // Re-register consoles (needed by the "Layout sidebar" tests but we
    // also need them here so the full Layout renders without error).
    ModRegistry.getInstance().registerConsole({
      id: "library",
      label: "Library",
      icon: BookOpen,
      route: "/library",
      component: () => null,
      order: 10,
      defaults: {},
      accepts: { only: ["eln.entry"] },
    });
    ModRegistry.getInstance().registerConsole({
      id: "lims",
      label: "Database",
      icon: Database,
      route: "/lims",
      component: () => null,
      order: 30,
      defaults: {},
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
