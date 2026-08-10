/**
 * Tests for Router — the registry-driven route generator.
 *
 * Verifies:
 *  - Hub routes are generated from registry.getHubs()
 *  - Standalone routes are generated from registry.getRoutes()
 *  - App-level redirects / → /library and /eln → /library work
 *  - Empty registry doesn't crash
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ModRegistry } from "../../mod-system/ModRegistry";
import Router from "../Router";
import { ThemeProvider } from "../../preferences";
import type { HubConfig, RouteConfig } from "../../mod-system/types";

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

function HubA() {
  return <DummyComponent label="hub-a" />;
}
function HubB() {
  return <DummyComponent label="hub-b" />;
}
function StandaloneX() {
  return <DummyComponent label="standalone-x" />;
}
function StandaloneY() {
  return <DummyComponent label="standalone-y" />;
}
function LibraryHub() {
  return <DummyComponent label="library" />;
}

function resetRegistry(): void {
  ModRegistry._reset();
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
      <ThemeProvider>
        <Router />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Router", () => {
  beforeEach(() => {
    resetRegistry();
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

  it("generates routes for multiple hubs", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerHub(
      makeHub({
        id: "hub-a",
        route: "/hub-a",
        component: HubA,
      }),
    );
    registry.registerHub(
      makeHub({
        id: "hub-b",
        route: "/hub-b",
        component: HubB,
      }),
    );

    // Hub A renders at its route
    renderRouter("/hub-a");
    expect(screen.getByTestId("component-hub-a")).toBeInTheDocument();

    // Hub B renders at its route
    renderRouter("/hub-b");
    expect(screen.getByTestId("component-hub-b")).toBeInTheDocument();
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

  it("generates both hub and standalone routes together", () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod("test-mod");
    registry.registerHub(
      makeHub({
        id: "hub-a",
        route: "/hub-a",
        component: HubA,
      }),
    );
    registry.registerRoute(
      makeRoute({
        id: "standalone-x",
        path: "/standalone-x",
        component: StandaloneX,
      }),
    );

    // Hub route works
    renderRouter("/hub-a");
    expect(screen.getByTestId("component-hub-a")).toBeInTheDocument();

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
        component: LibraryHub,
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
        component: LibraryHub,
      }),
    );

    renderRouter("/eln");
    // After redirect, the library hub component should render
    expect(screen.getByTestId("component-library")).toBeInTheDocument();
  });

  // ── Empty registry ────────────────────────────────────────────────────

  it("does not crash when no hubs or routes are registered", () => {
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
        component: LibraryHub,
      }),
    );

    renderRouter("/library");
    // Sidebar should be present (brand text)
    expect(screen.getByText("Helix")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });
});
