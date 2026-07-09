import { describe, it, expect, beforeEach } from "vitest";
import { ModRegistry } from "../ModRegistry";
import type {
  HubConfig,
  SettingsSectionConfig,
  RouteConfig,
  SidebarActionConfig,
  LibraryItemConfig,
} from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Dummy component for use in test configs. */
function DummyComponent() {
  return null;
}

/** Reset the singleton so each test starts with a clean registry. */
function resetRegistry(): ModRegistry {
  // TypeScript `private` is compile-time only — safe to clear at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
  return ModRegistry.getInstance();
}

function makeHub(overrides?: Partial<HubConfig>): HubConfig {
  return {
    id: "test.hub",
    label: "Test Hub",
    icon: DummyComponent,
    route: "/test-hub",
    component: DummyComponent,
    order: 5,
    ...overrides,
  };
}

function makeSettingsSection(
  overrides?: Partial<SettingsSectionConfig>,
): SettingsSectionConfig {
  return {
    id: "test.section",
    modId: "test-mod",
    label: "Test Section",
    component: DummyComponent,
    order: 10,
    ...overrides,
  };
}

function makeRoute(overrides?: Partial<RouteConfig>): RouteConfig {
  return {
    id: "test.route",
    modId: "test-mod",
    path: "/test-route",
    component: DummyComponent,
    ...overrides,
  };
}

function makeSidebarAction(
  overrides?: Partial<SidebarActionConfig>,
): SidebarActionConfig {
  return {
    id: "test.action",
    workspaceId: "*",
    component: DummyComponent,
    position: "inline",
    ...overrides,
  };
}

function makeLibraryItem(
  overrides?: Partial<LibraryItemConfig>,
): LibraryItemConfig {
  return {
    id: "test.item",
    icon: DummyComponent,
    listCard: DummyComponent,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("ModRegistry", () => {
  let registry: ModRegistry;

  beforeEach(() => {
    registry = resetRegistry();
  });

  // ── Singleton ───────────────────────────────────────────────────────

  it("getInstance returns the same instance", () => {
    const a = ModRegistry.getInstance();
    const b = ModRegistry.getInstance();
    expect(a).toBe(b);
  });

  // ── registerHub ──────────────────────────────────────────────────────

  it("registerHub stores a hub config", () => {
    const config = makeHub({ id: "h1" });
    registry.registerHub(config);
    expect(registry.getHubs().get("h1")).toBe(config);
  });

  it("registerHub throws on duplicate ID", () => {
    registry.registerHub(makeHub({ id: "h1" }));
    expect(() => registry.registerHub(makeHub({ id: "h1" }))).toThrow(
      "Duplicate hub registration",
    );
  });

  // ── registerSettingsSection ──────────────────────────────────────────

  it("registerSettingsSection stores a settings section config", () => {
    const config = makeSettingsSection({ id: "s1" });
    registry.registerSettingsSection(config);
    const sections = registry.getSettingsSections();
    expect(sections).toHaveLength(1);
    expect(sections[0]).toBe(config);
  });

  it("registerSettingsSection throws on duplicate ID", () => {
    registry.registerSettingsSection(makeSettingsSection({ id: "s1" }));
    expect(() =>
      registry.registerSettingsSection(makeSettingsSection({ id: "s1" })),
    ).toThrow("Duplicate settings section registration");
  });

  it("getSettingsSections returns sections sorted by order", () => {
    registry.registerSettingsSection(makeSettingsSection({ id: "s2", order: 20 }));
    registry.registerSettingsSection(makeSettingsSection({ id: "s1", order: 10 }));
    const sections = registry.getSettingsSections();
    expect(sections[0].id).toBe("s1");
    expect(sections[1].id).toBe("s2");
  });

  // ── registerRoute ────────────────────────────────────────────────────

  it("registerRoute stores a route config", () => {
    const config = makeRoute({ id: "r1" });
    registry.registerRoute(config);
    expect(registry.getRoutes().get("r1")).toBe(config);
  });

  it("registerRoute throws on duplicate ID", () => {
    registry.registerRoute(makeRoute({ id: "r1" }));
    expect(() => registry.registerRoute(makeRoute({ id: "r1" }))).toThrow(
      "Duplicate route registration",
    );
  });

  // ── registerSidebarAction ────────────────────────────────────────────

  it("registerSidebarAction stores a sidebar action config", () => {
    const config = makeSidebarAction({ id: "a1" });
    registry.registerSidebarAction(config);
    expect(registry.getSidebarActions().get("a1")).toBe(config);
  });

  it("registerSidebarAction throws on duplicate ID", () => {
    registry.registerSidebarAction(makeSidebarAction({ id: "a1" }));
    expect(() =>
      registry.registerSidebarAction(makeSidebarAction({ id: "a1" })),
    ).toThrow("Duplicate sidebar action registration");
  });

  // ── validate ─────────────────────────────────────────────────────────

  it("passes when all cross-references resolve", () => {
    registry.registerMod("test-mod");
    registry.registerRoute(makeRoute({ id: "r1", modId: "test-mod" }));
    registry.registerSettingsSection(
      makeSettingsSection({ id: "s1", modId: "test-mod" }),
    );

    expect(() => registry.validate()).not.toThrow();
  });

  it("throws when route references unregistered mod", () => {
    registry.registerRoute(makeRoute({ id: "r1", modId: "ghost-mod" }));

    expect(() => registry.validate()).toThrow(
      "references mod 'ghost-mod' which is not registered",
    );
  });

  it("throws when settings section references unregistered mod", () => {
    registry.registerSettingsSection(
      makeSettingsSection({ id: "s1", modId: "ghost-mod" }),
    );

    expect(() => registry.validate()).toThrow(
      "references mod 'ghost-mod' which is not registered",
    );
  });

  // ── Read-only getters ───────────────────────────────────────────────

  it("getHubs returns a read-only view", () => {
    registry.registerHub(makeHub({ id: "h1" }));
    const hubs = registry.getHubs();
    expect(hubs.has("h1")).toBe(true);
    expect(hubs.get("h1")?.id).toBe("h1");
  });

  it("getRoutes returns a read-only view", () => {
    registry.registerRoute(makeRoute({ id: "r1" }));
    expect(registry.getRoutes().has("r1")).toBe(true);
  });

  // ── registerLibraryItem ────────────────────────────────────────────────

  it("registerLibraryItem stores a library item config", () => {
    const config = makeLibraryItem({ id: "eln.entry" });
    registry.registerLibraryItem(config);
    expect(registry.getLibraryItems().get("eln.entry")).toBe(config);
  });

  it("registerLibraryItem throws on duplicate ID", () => {
    registry.registerLibraryItem(makeLibraryItem({ id: "eln.entry" }));
    expect(() =>
      registry.registerLibraryItem(makeLibraryItem({ id: "eln.entry" })),
    ).toThrow("Duplicate library item registration");
  });

  it("getLibraryItems returns a read-only view", () => {
    registry.registerLibraryItem(makeLibraryItem({ id: "eln.entry" }));
    const items = registry.getLibraryItems();
    expect(items.has("eln.entry")).toBe(true);
    expect(items.get("eln.entry")?.id).toBe("eln.entry");
  });

  it("resolveLibraryItem returns the registered config for a given ID", () => {
    const config = makeLibraryItem({ id: "eln.entry" });
    registry.registerLibraryItem(config);
    const resolved = registry.resolveLibraryItem("eln.entry");
    expect(resolved).toBe(config);
  });

  it("resolveLibraryItem returns undefined for unregistered ID", () => {
    const resolved = registry.resolveLibraryItem("nonexistent");
    expect(resolved).toBeUndefined();
  });

  // ── registerWorkspace ──────────────────────────────────────────────────

  it("registerWorkspace stores a workspace config", () => {
    registry.registerWorkspace({ id: "lims", displayName: "LIMS" });
    expect(registry.getWorkspaces().get("lims")).toEqual({
      id: "lims",
      displayName: "LIMS",
    });
  });

  it("registerWorkspace throws on duplicate ID", () => {
    registry.registerWorkspace({ id: "lims", displayName: "LIMS" });
    expect(() =>
      registry.registerWorkspace({ id: "lims", displayName: "LIMS v2" }),
    ).toThrow("Duplicate workspace registration");
  });

  it("getWorkspaces returns a read-only view", () => {
    registry.registerWorkspace({ id: "lims", displayName: "LIMS" });
    registry.registerWorkspace({ id: "eln", displayName: "ELN" });
    const workspaces = registry.getWorkspaces();
    expect(workspaces.has("lims")).toBe(true);
    expect(workspaces.has("eln")).toBe(true);
    expect(workspaces.get("lims")?.displayName).toBe("LIMS");
  });

  it("getWorkspaces returns empty map when no workspaces registered", () => {
    const workspaces = registry.getWorkspaces();
    expect(workspaces.size).toBe(0);
  });
});
