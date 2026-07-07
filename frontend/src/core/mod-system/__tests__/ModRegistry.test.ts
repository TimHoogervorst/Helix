import { describe, it, expect, beforeEach } from "vitest";
import { ModRegistry } from "../ModRegistry";
import type {
  ConsoleConfig,
  WorkspaceConfig,
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

function makeConsole(overrides?: Partial<ConsoleConfig>): ConsoleConfig {
  return {
    id: "test.console",
    label: "Test Console",
    icon: DummyComponent,
    route: "/test",
    component: DummyComponent,
    order: 10,
    defaults: {},
    ...overrides,
  };
}

function makeWorkspace(overrides?: Partial<WorkspaceConfig>): WorkspaceConfig {
  return {
    id: "test.workspace",
    consoleIds: ["test.console"],
    label: "Test Workspace",
    route: "/test/:id",
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
    workspaceId: "test.workspace",
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

  // ── registerConsole ─────────────────────────────────────────────────

  it("registerConsole stores a console config", () => {
    const config = makeConsole({ id: "c1" });
    registry.registerConsole(config);
    expect(registry.getConsoles().get("c1")).toBe(config);
  });

  it("registerConsole throws on duplicate ID", () => {
    registry.registerConsole(makeConsole({ id: "c1" }));
    expect(() => registry.registerConsole(makeConsole({ id: "c1" }))).toThrow(
      "Duplicate console registration",
    );
  });

  // ── registerWorkspace ───────────────────────────────────────────────

  it("registerWorkspace stores a workspace config", () => {
    const config = makeWorkspace({ id: "ws1", consoleIds: ["c1"] });
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(config);
    expect(registry.getWorkspaces().get("ws1")).toBe(config);
  });

  it("registerWorkspace throws on duplicate ID", () => {
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(makeWorkspace({ id: "ws1" }));
    expect(() =>
      registry.registerWorkspace(makeWorkspace({ id: "ws1" })),
    ).toThrow("Duplicate workspace registration");
  });

  it("registerWorkspace throws on empty consoleIds", () => {
    expect(() =>
      registry.registerWorkspace(makeWorkspace({ id: "ws1", consoleIds: [] })),
    ).toThrow("at least one consoleId");
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
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(makeWorkspace({ id: "ws1" }));
    registry.registerSidebarAction(config);
    expect(registry.getSidebarActions().get("a1")).toBe(config);
  });

  it("registerSidebarAction throws on duplicate ID", () => {
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(makeWorkspace({ id: "ws1" }));
    registry.registerSidebarAction(makeSidebarAction({ id: "a1" }));
    expect(() =>
      registry.registerSidebarAction(makeSidebarAction({ id: "a1" })),
    ).toThrow("Duplicate sidebar action registration");
  });

  // ── resolveWorkspaceRenderers ───────────────────────────────────────

  it("returns workspace overrides when present", () => {
    const row = DummyComponent;
    const detail = DummyComponent;
    const ws = DummyComponent;

    registry.registerConsole(
      makeConsole({
        id: "c1",
        defaults: {
          row: DummyComponent,
          detailCard: DummyComponent,
          workspace: DummyComponent,
        },
      }),
    );
    registry.registerWorkspace(
      makeWorkspace({ id: "ws1", row, detailCard: detail, workspace: ws }),
    );

    const resolved = registry.resolveWorkspaceRenderers("ws1", "c1");
    expect(resolved.row).toBe(row);
    expect(resolved.detailCard).toBe(detail);
    expect(resolved.workspace).toBe(ws);
  });

  it("falls back to console defaults when workspace has no overrides", () => {
    const consoleRow = DummyComponent;
    const consoleWorkspace = DummyComponent;

    registry.registerConsole(
      makeConsole({
        id: "c1",
        defaults: { row: consoleRow, workspace: consoleWorkspace },
      }),
    );
    registry.registerWorkspace(makeWorkspace({ id: "ws1" }));

    const resolved = registry.resolveWorkspaceRenderers("ws1", "c1");
    expect(resolved.row).toBe(consoleRow);
    expect(resolved.workspace).toBe(consoleWorkspace);
    expect(resolved.detailCard).toBeUndefined();
  });

  it("returns undefined when neither workspace nor console have a renderer", () => {
    registry.registerConsole(makeConsole({ id: "c1", defaults: {} }));
    registry.registerWorkspace(makeWorkspace({ id: "ws1" }));

    const resolved = registry.resolveWorkspaceRenderers("ws1", "c1");
    expect(resolved.row).toBeUndefined();
    expect(resolved.detailCard).toBeUndefined();
    expect(resolved.workspace).toBeUndefined();
  });

  // ── getWorkspaceForRoute ─────────────────────────────────────────────

  it("matches exact route", () => {
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(
      makeWorkspace({ id: "ws1", route: "/lims/entity" }),
    );

    const ws = registry.getWorkspaceForRoute("/lims/entity");
    expect(ws?.id).toBe("ws1");
  });

  it("matches route with :displayId param", () => {
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(
      makeWorkspace({ id: "ws1", route: "/lims/:displayId" }),
    );

    const ws = registry.getWorkspaceForRoute("/lims/BLOOD1");
    expect(ws?.id).toBe("ws1");
  });

  it("returns undefined for unmatched route", () => {
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(
      makeWorkspace({ id: "ws1", route: "/lims/:displayId" }),
    );

    expect(registry.getWorkspaceForRoute("/eln/entry1")).toBeUndefined();
    expect(registry.getWorkspaceForRoute("/settings")).toBeUndefined();
  });

  it("handles multiple params in route", () => {
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(
      makeWorkspace({
        id: "ws1",
        route: "/compare/:leftId/:rightId",
      }),
    );

    const ws = registry.getWorkspaceForRoute("/compare/BLOOD1/BLOOD2");
    expect(ws?.id).toBe("ws1");
  });

  // ── validate ─────────────────────────────────────────────────────────

  it("passes when all cross-references resolve", () => {
    registry.registerMod("test-mod");
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(makeWorkspace({ id: "ws1", consoleIds: ["c1"] }));
    registry.registerRoute(makeRoute({ id: "r1", modId: "test-mod" }));
    registry.registerSettingsSection(
      makeSettingsSection({ id: "s1", modId: "test-mod" }),
    );
    registry.registerSidebarAction(
      makeSidebarAction({ id: "a1", workspaceId: "ws1" }),
    );

    expect(() => registry.validate()).not.toThrow();
  });

  it("throws when workspace references unregistered console", () => {
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(
      makeWorkspace({ id: "ws1", consoleIds: ["nonexistent"] }),
    );

    expect(() => registry.validate()).toThrow(
      "references console 'nonexistent' which is not registered",
    );
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

  it("throws when sidebar action references unregistered workspace", () => {
    registry.registerSidebarAction(
      makeSidebarAction({ id: "a1", workspaceId: "nonexistent" }),
    );

    expect(() => registry.validate()).toThrow(
      "references workspace 'nonexistent' which is not registered",
    );
  });

  it("allows sidebar action with workspaceId '*' (wildcard)", () => {
    registry.registerMod("test-mod");
    registry.registerSidebarAction(
      makeSidebarAction({ id: "a1", workspaceId: "*" }),
    );

    expect(() => registry.validate()).not.toThrow();
  });

  // ── Read-only getters ───────────────────────────────────────────────

  it("getConsoles returns a read-only view", () => {
    registry.registerConsole(makeConsole({ id: "c1" }));
    const consoles = registry.getConsoles();
    expect(consoles.has("c1")).toBe(true);
    // Verify it's the same map (read-only at the type level)
    expect(consoles.get("c1")?.id).toBe("c1");
  });

  it("getWorkspaces returns a read-only view", () => {
    registry.registerConsole(makeConsole({ id: "c1" }));
    registry.registerWorkspace(makeWorkspace({ id: "ws1" }));
    expect(registry.getWorkspaces().has("ws1")).toBe(true);
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
});
