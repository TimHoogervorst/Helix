/**
 * Tests for Router — the registry-driven route generator.
 *
 * Verifies:
 *  - Console routes are generated from registry.getConsoles()
 *  - Standalone routes are generated from registry.getRoutes()
 *  - App-level redirects / → /library and /eln → /library work
 *  - Empty registry doesn't crash
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ModRegistry } from "../../mod-system/ModRegistry";
import Router from "../Router";
import type { ConsoleConfig, HubConfig, RouteConfig } from "../../mod-system/types";

// Provide a mock user context so Layout (which renders UserMenu) doesn't crash
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

vi.mock("../../user/api", () => ({
  logout: vi.fn().mockResolvedValue({ detail: "ok" }),
  fetchMe: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

/** Dummy component with a data-testid for assertion. */
function DummyComponent({ label = "default" }: { label?: string }) {
  return <div data-testid={`component-${label}`}>{label}</div>;
}

function ConsoleA() {
  return <DummyComponent label="console-a" />;
}
function ConsoleB() {
  return <DummyComponent label="console-b" />;
}
function StandaloneX() {
  return <DummyComponent label="standalone-x" />;
}
function StandaloneY() {
  return <DummyComponent label="standalone-y" />;
}
function LibraryConsole() {
  return <DummyComponent label="library" />;
}

function resetRegistry(): void {
  ModRegistry._reset();
}

function makeConsole(overrides?: Partial<ConsoleConfig>): ConsoleConfig {
  return {
    id: "test.console",
    label: "Test Console",
    icon: () => null,
    route: "/test",
    component: () => null,
    order: 10,
    defaults: {},
    ...overrides,
  };
}

function makeHub(overrides?: Partial<HubConfig>): HubConfig {
  return {
    id: "test.hub",
    label: "Test Hub",
    icon: () => null,
    route: "/test-hub",
    component: () => null,
    order: 5,
    ...overrides,
  };
}

function makeRoute(overrides?: Partial<RouteConfig>): RouteConfig {
  return {
    id: "test.route",
    modId: "test-mod",
    path: "/test-route",
    component: () => null,
    ...overrides,
  };
}

/** Render Router inside a MemoryRouter at a specific initial route. */
function renderRouter(initialRoute = "/") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Router />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Router", () => {
  beforeEach(() => {
    resetRegistry();
  });

  // ── Console routes ────────────────────────────────────────────────────

  it("generates a route for each registered console", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerConsole(
      makeConsole({
        id: "console-a",
        route: "/console-a",
        component: ConsoleA,
      }),
    );

    renderRouter("/console-a");
    expect(screen.getByTestId("component-console-a")).toBeInTheDocument();
  });

  // ── Hub routes ────────────────────────────────────────────────────────

  it("generates a route for each registered hub", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerHub(
      makeHub({
        id: "home",
        route: "/home",
        component: () => <div data-testid="component-home">Home</div>,
      }),
    );

    renderRouter("/home");
    expect(screen.getByTestId("component-home")).toBeInTheDocument();
  });

  // ── Console routes ────────────────────────────────────────────────────

  it("generates routes for multiple consoles", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerConsole(
      makeConsole({
        id: "console-a",
        route: "/console-a",
        component: ConsoleA,
      }),
    );
    registry.registerConsole(
      makeConsole({
        id: "console-b",
        route: "/console-b",
        component: ConsoleB,
      }),
    );

    // Console A renders at its route
    renderRouter("/console-a");
    expect(screen.getByTestId("component-console-a")).toBeInTheDocument();

    // Console B renders at its route
    renderRouter("/console-b");
    expect(screen.getByTestId("component-console-b")).toBeInTheDocument();
  });

  // ── Standalone routes ─────────────────────────────────────────────────

  it("generates a route for each registered standalone route", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerRoute(
      makeRoute({
        id: "standalone-x",
        path: "/standalone-x",
        component: StandaloneX,
      }),
    );

    renderRouter("/standalone-x");
    expect(screen.getByTestId("component-standalone-x")).toBeInTheDocument();
  });

  it("generates routes for multiple standalone routes", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerRoute(
      makeRoute({
        id: "standalone-x",
        path: "/standalone-x",
        component: StandaloneX,
      }),
    );
    registry.registerRoute(
      makeRoute({
        id: "standalone-y",
        path: "/standalone-y",
        component: StandaloneY,
      }),
    );

    renderRouter("/standalone-y");
    expect(screen.getByTestId("component-standalone-y")).toBeInTheDocument();
  });

  // ── Mixed routes ──────────────────────────────────────────────────────

  it("generates both console and standalone routes together", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerConsole(
      makeConsole({
        id: "console-a",
        route: "/console-a",
        component: ConsoleA,
      }),
    );
    registry.registerRoute(
      makeRoute({
        id: "standalone-x",
        path: "/standalone-x",
        component: StandaloneX,
      }),
    );

    // Console route works
    renderRouter("/console-a");
    expect(screen.getByTestId("component-console-a")).toBeInTheDocument();

    // Standalone route works
    renderRouter("/standalone-x");
    expect(screen.getByTestId("component-standalone-x")).toBeInTheDocument();
  });

  // ── Redirects ─────────────────────────────────────────────────────────

  it("redirects / to /library", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerHub(
      makeHub({
        id: "library",
        route: "/library",
        component: LibraryConsole,
      }),
    );

    renderRouter("/");
    // After redirect, the library hub component should render
    expect(screen.getByTestId("component-library")).toBeInTheDocument();
  });

  it("redirects /eln to /library", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerHub(
      makeHub({
        id: "library",
        route: "/library",
        component: LibraryConsole,
      }),
    );

    renderRouter("/eln");
    // After redirect, the library hub component should render
    expect(screen.getByTestId("component-library")).toBeInTheDocument();
  });

  // ── Empty registry ────────────────────────────────────────────────────

  it("does not crash when no consoles or routes are registered", () => {
    // Should not throw — Layout renders (with CSRF side-effect, which we
    // don't mock here, but it just fails silently via .catch(() => {}))
    expect(() => renderRouter("/")).not.toThrow();
  });

  // ── Sidebar rendering ─────────────────────────────────────────────────

  it("renders the sidebar Layout with brand text", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerHub(
      makeHub({
        id: "library",
        route: "/library",
        component: LibraryConsole,
      }),
    );

    renderRouter("/library");
    // Sidebar should be present (brand text)
    expect(screen.getByText("Helix")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });
});
