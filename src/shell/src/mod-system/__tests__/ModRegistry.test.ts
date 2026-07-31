import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { BlockEvent } from "../BlockEvent";
import { ModRegistry } from "../ModRegistry";
import type {
  HubConfig,
  SettingsSectionConfig,
  RouteConfig,
  SlotDeclaration,
  ButtonRegistration,
  BlockRegistration,
  ModManifest,
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
    description: "A test hub for unit tests.",
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

function makeSlotDeclaration(
  overrides?: Partial<SlotDeclaration>,
): SlotDeclaration {
  return {
    id: "eln.editor",
    accepts: "block",
    renderer: DummyComponent,
    layout: "vertical",
    order: 0,
    defaults: {},
    ...overrides,
  };
}

function makeButtonRegistration(
  overrides?: Partial<ButtonRegistration>,
): ButtonRegistration {
  return {
    id: "eln.export",
    label: "Export",
    onClick: () => {},
    ...overrides,
  };
}

function makeBlockRegistration(
  overrides?: Partial<BlockRegistration>,
): BlockRegistration {
  return {
    id: "eln.table",
    label: "Table",
    icon: DummyComponent,
    component: DummyComponent,
    listensTo: [],
    onEvent: {},
    emits: [],
    serialize: (state) => JSON.stringify(state),
    deserialize: (json) => JSON.parse(json),
    defaultState: {},
    ...overrides,
  };
}

function makeManifest(overrides?: Partial<ModManifest>): ModManifest {
  return {
    vendor: "helix",
    name: "lims",
    displayName: "LIMS",
    dependsOn: [],
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

  it("registerHub stores and returns a hub with a description", () => {
    const config = makeHub({ id: "h1", description: "A test hub." });
    registry.registerHub(config);
    const hub = registry.getHubs().get("h1");
    expect(hub).toBeDefined();
    expect(hub?.description).toBe("A test hub.");
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

  // ── registerBlock ────────────────────────────────────────────────────────

  it("registerBlock stores a block registration", () => {
    const config = makeBlockRegistration({ id: "eln.table" });
    registry.registerBlock(config);
    expect(registry.getBlocks().get("eln.table")).toBe(config);
  });

  it("registerBlock throws on duplicate ID", () => {
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    expect(() =>
      registry.registerBlock(makeBlockRegistration({ id: "eln.table" })),
    ).toThrow("Duplicate block registration");
  });

  it("getBlocks returns a read-only view", () => {
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    const blocks = registry.getBlocks();
    expect(blocks.has("eln.table")).toBe(true);
    expect(blocks.get("eln.table")?.id).toBe("eln.table");
  });

  it("getBlocks returns empty map when no blocks registered", () => {
    const blocks = registry.getBlocks();
    expect(blocks.size).toBe(0);
  });

  // ── declareSlot ─────────────────────────────────────────────────────

  it("declareSlot stores a slot declaration", () => {
    const config = makeSlotDeclaration({ id: "eln.editor" });
    registry.declareSlot(config);
    expect(registry.getSlots().get("eln.editor")).toBe(config);
  });

  it("declareSlot throws on duplicate ID", () => {
    registry.declareSlot(makeSlotDeclaration({ id: "eln.editor" }));
    expect(() =>
      registry.declareSlot(makeSlotDeclaration({ id: "eln.editor" })),
    ).toThrow("Duplicate slot declaration");
  });

  it("getSlots returns a read-only view", () => {
    registry.declareSlot(makeSlotDeclaration({ id: "eln.editor" }));
    expect(registry.getSlots().has("eln.editor")).toBe(true);
    expect(registry.getSlots().get("eln.editor")?.id).toBe("eln.editor");
  });

  it("getSlots returns empty map when no slots declared", () => {
    expect(registry.getSlots().size).toBe(0);
  });

  // ── registerButton ──────────────────────────────────────────────────

  it("registerButton stores a button registration", () => {
    const config = makeButtonRegistration({ id: "eln.export" });
    registry.registerButton(config);
    expect(registry.getButtons().get("eln.export")).toBe(config);
  });

  it("registerButton throws on duplicate ID", () => {
    registry.registerButton(makeButtonRegistration({ id: "eln.export" }));
    expect(() =>
      registry.registerButton(makeButtonRegistration({ id: "eln.export" })),
    ).toThrow("Duplicate button registration");
  });

  it("getButtons returns a read-only view", () => {
    registry.registerButton(makeButtonRegistration({ id: "eln.export" }));
    expect(registry.getButtons().has("eln.export")).toBe(true);
    expect(registry.getButtons().get("eln.export")?.id).toBe("eln.export");
  });

  it("getButtons returns empty map when no buttons registered", () => {
    expect(registry.getButtons().size).toBe(0);
  });

  // ── registerIntoSlot ────────────────────────────────────────────────

  it("registerIntoSlot stores a binding keyed by slotId", () => {
    registry.registerIntoSlot("eln.editor", "eln.table");
    const bindings = registry.getBindings().get("eln.editor");
    expect(bindings).toBeDefined();
    expect(bindings).toHaveLength(1);
    expect(bindings![0].slotId).toBe("eln.editor");
    expect(bindings![0].targetId).toBe("eln.table");
  });

  it("registerIntoSlot stores multiple bindings for the same slot", () => {
    registry.registerIntoSlot("eln.editor", "eln.table", {}, 0);
    registry.registerIntoSlot("eln.editor", "eln.chart", {}, 1);
    const bindings = registry.getBindings().get("eln.editor");
    expect(bindings).toHaveLength(2);
    expect(bindings![0].targetId).toBe("eln.table");
    expect(bindings![1].targetId).toBe("eln.chart");
  });

  it("registerIntoSlot stores bindings with overrides and order", () => {
    registry.registerIntoSlot("eln.editor", "eln.table", { nodeType: "inline" }, 5);
    const binding = registry.getBindings().get("eln.editor")![0];
    expect(binding.overrides).toEqual({ nodeType: "inline" });
    expect(binding.order).toBe(5);
  });

  it("registerIntoSlot defaults overrides to {} and order to 0", () => {
    registry.registerIntoSlot("eln.editor", "eln.table");
    const binding = registry.getBindings().get("eln.editor")![0];
    expect(binding.overrides).toEqual({});
    expect(binding.order).toBe(0);
  });

  it("registerIntoSlot stores bindings for different slots independently", () => {
    registry.registerIntoSlot("eln.editor", "eln.table");
    registry.registerIntoSlot("eln.header-actions", "eln.export");
    expect(registry.getBindings().get("eln.editor")).toHaveLength(1);
    expect(registry.getBindings().get("eln.header-actions")).toHaveLength(1);
  });

  it("getBindings returns empty map when no bindings registered", () => {
    expect(registry.getBindings().size).toBe(0);
  });

  // ── validate (slot binding validation) ──────────────────────────────

  it("validate passes when all slot bindings are valid", () => {
    registry.declareSlot(makeSlotDeclaration({ id: "eln.editor", accepts: "block" }));
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerIntoSlot("eln.editor", "eln.table");
    expect(() => registry.validate()).not.toThrow();
  });

  it("validate warns and removes binding when slot is not declared", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerIntoSlot("eln.editor", "eln.table");
    registry.validate();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("slot 'eln.editor' is not declared"),
    );
    expect(registry.getBindings().has("eln.editor")).toBe(false);
    warnSpy.mockRestore();
  });

  it("validate warns and skips binding when target does not exist", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.declareSlot(makeSlotDeclaration({ id: "eln.editor", accepts: "block" }));
    registry.registerIntoSlot("eln.editor", "nonexistent.block");
    registry.validate();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not a registered block or button"),
    );
    expect(registry.getBindings().has("eln.editor")).toBe(false);
    warnSpy.mockRestore();
  });

  it("validate warns and skips binding when target type does not match slot accepts", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.declareSlot(makeSlotDeclaration({ id: "eln.header-actions", accepts: "button" }));
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerIntoSlot("eln.header-actions", "eln.table");
    registry.validate();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("accepts 'button' but target"),
    );
    expect(registry.getBindings().has("eln.header-actions")).toBe(false);
    warnSpy.mockRestore();
  });

  it("validate warns and skips binding when button bound to block-only slot", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.declareSlot(makeSlotDeclaration({ id: "eln.editor", accepts: "block" }));
    registry.registerButton(makeButtonRegistration({ id: "eln.export" }));
    registry.registerIntoSlot("eln.editor", "eln.export");
    registry.validate();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("accepts 'block' but target"),
    );
    expect(registry.getBindings().has("eln.editor")).toBe(false);
    warnSpy.mockRestore();
  });

  it("validate keeps valid bindings while removing invalid ones", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    registry.declareSlot(makeSlotDeclaration({ id: "eln.editor", accepts: "block" }));
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerBlock(makeBlockRegistration({ id: "eln.chart" }));
    registry.registerIntoSlot("eln.editor", "eln.table");
    registry.registerIntoSlot("eln.editor", "nonexistent.block");

    registry.validate();

    const bindings = registry.getBindings().get("eln.editor");
    expect(bindings).toHaveLength(1);
    expect(bindings![0].targetId).toBe("eln.table");
    // Warning was logged for the bad binding
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("validate does not crash when there are no bindings to validate", () => {
    expect(() => registry.validate()).not.toThrow();
  });

  // ── resolveSlot ──────────────────────────────────────────────────────

  it("resolveSlot returns null for undeclared slot", () => {
    const result = registry.resolveSlot("nonexistent.slot");
    expect(result).toBeNull();
  });

  it("resolveSlot returns null when slot has no bindings", () => {
    registry.declareSlot(makeSlotDeclaration({ id: "eln.editor", accepts: "block" }));
    expect(registry.resolveSlot("eln.editor")).toBeNull();
  });

  it("resolveSlot resolves a block binding with merged defaults", () => {
    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        defaults: { nodeType: "block", atom: true },
      }),
    );
    registry.registerBlock(
      makeBlockRegistration({ id: "eln.table", label: "Table" }),
    );
    registry.registerIntoSlot("eln.editor", "eln.table");

    const result = registry.resolveSlot("eln.editor");
    expect(result).not.toBeNull();
    expect(result!.bindings).toHaveLength(1);

    const binding = result!.bindings[0];
    expect(binding.type).toBe("block");
    expect(binding.id).toBe("eln.table");
    expect(binding.label).toBe("Table");
    expect(binding.order).toBe(0);
    // Slot defaults are present
    if (binding.type === "block") {
      expect(binding.overrides).toEqual({
        nodeType: "block",
        atom: true,
      });
    }
  });

  it("resolveSlot merges slot defaults with binding overrides (binding wins per-key)", () => {
    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        defaults: { nodeType: "block", atom: true, group: "content" },
      }),
    );
    registry.registerBlock(
      makeBlockRegistration({ id: "eln.mention" }),
    );
    // Override nodeType → "inline", keep atom, keep group
    registry.registerIntoSlot("eln.editor", "eln.mention", {
      nodeType: "inline",
      atom: false,
    });

    const result = registry.resolveSlot("eln.editor");
    expect(result).not.toBeNull();

    const binding = result!.bindings[0];
    // Binding overrides win for nodeType and atom; group comes from slot defaults
    if (binding.type === "block") {
      expect(binding.overrides).toEqual({
        nodeType: "inline",
        atom: false,
        group: "content",
      });
    }
  });

  it("resolveSlot skips bindings whose block target doesn't exist", () => {
    registry.declareSlot(
      makeSlotDeclaration({ id: "eln.editor", accepts: "block" }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerIntoSlot("eln.editor", "eln.table");
    registry.registerIntoSlot("eln.editor", "nonexistent.block");

    const result = registry.resolveSlot("eln.editor");
    expect(result).not.toBeNull();
    expect(result!.bindings).toHaveLength(1);
    expect(result!.bindings[0].id).toBe("eln.table");
  });

  it("resolveSlot resolves all registered blocks (no legacy discrimination)", () => {
    registry.declareSlot(
      makeSlotDeclaration({ id: "eln.editor", accepts: "block" }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.legacy" }));
    registry.registerIntoSlot("eln.editor", "eln.legacy");

    const result = registry.resolveSlot("eln.editor");
    // All BlockRegistration entries participate in the slot system
    expect(result).not.toBeNull();
    expect(result!.bindings).toHaveLength(1);
    expect(result!.bindings[0].id).toBe("eln.legacy");
  });

  it("resolveSlot resolves a button binding", () => {
    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.header-actions",
        accepts: "button",
        defaults: { size: "sm" },
      }),
    );
    registry.registerButton(
      makeButtonRegistration({ id: "eln.export", label: "Export" }),
    );
    registry.registerIntoSlot("eln.header-actions", "eln.export", {}, 0);

    const result = registry.resolveSlot("eln.header-actions");
    expect(result).not.toBeNull();
    expect(result!.bindings).toHaveLength(1);

    const binding = result!.bindings[0];
    expect(binding.type).toBe("button");
    expect(binding.id).toBe("eln.export");
    expect(binding.label).toBe("Export");
    expect(binding.order).toBe(0);
  });

  it("resolveSlot skips bindings whose button target doesn't exist", () => {
    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.header-actions",
        accepts: "button",
      }),
    );
    registry.registerButton(
      makeButtonRegistration({ id: "eln.export" }),
    );
    registry.registerIntoSlot("eln.header-actions", "eln.export");
    registry.registerIntoSlot("eln.header-actions", "nonexistent.button");

    const result = registry.resolveSlot("eln.header-actions");
    expect(result).not.toBeNull();
    expect(result!.bindings).toHaveLength(1);
    expect(result!.bindings[0].id).toBe("eln.export");
  });

  it("resolveSlot returns bindings sorted by order ascending", () => {
    registry.declareSlot(
      makeSlotDeclaration({ id: "eln.editor", accepts: "block" }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerBlock(makeBlockRegistration({ id: "eln.chart" }));
    registry.registerBlock(makeBlockRegistration({ id: "eln.comment" }));

    registry.registerIntoSlot("eln.editor", "eln.chart", {}, 5);
    registry.registerIntoSlot("eln.editor", "eln.table", {}, 0);
    registry.registerIntoSlot("eln.editor", "eln.comment", {}, 10);

    const result = registry.resolveSlot("eln.editor");
    expect(result).not.toBeNull();
    expect(result!.bindings).toHaveLength(3);
    expect(result!.bindings[0].id).toBe("eln.table"); // order 0
    expect(result!.bindings[1].id).toBe("eln.chart");  // order 5
    expect(result!.bindings[2].id).toBe("eln.comment"); // order 10
  });

  it("resolveSlot includes the slot's renderer in the result", () => {
    function TestRenderer() {
      return null;
    }
    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.editor",
        accepts: "block",
        renderer: TestRenderer,
      }),
    );
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerIntoSlot("eln.editor", "eln.table");

    const result = registry.resolveSlot("eln.editor");
    expect(result).not.toBeNull();
    expect(result!.renderer).toBe(TestRenderer);
  });

  it("resolveSlot copies all BlockRegistration fields into BlockBinding", () => {
    registry.declareSlot(
      makeSlotDeclaration({ id: "eln.editor", accepts: "block" }),
    );
    registry.registerBlock(
      makeBlockRegistration({
        id: "eln.table",
        label: "Table",
        listensTo: ["data.export"],
        onEvent: { "data.export": () => "exported" },
        getDisplayName: (attrs) => String(attrs.name ?? ""),
        tags: ["data", "table"],
      }),
    );
    registry.registerIntoSlot("eln.editor", "eln.table");

    const result = registry.resolveSlot("eln.editor");
    const binding = result!.bindings[0];
    if (binding.type === "block") {
      expect(binding.listensTo).toEqual(["data.export"]);
      expect(binding.onEvent).toBeDefined();
      expect(binding.onEvent["data.export"]).toBeDefined();
      expect(binding.getDisplayName).toBeDefined();
      expect(binding.tags).toEqual(["data", "table"]);
      expect(binding.serialize).toBeDefined();
      expect(binding.deserialize).toBeDefined();
      expect(binding.defaultState).toEqual({});
    }
  });

  // ── hydrateFromBackend ─────────────────────────────────────────────

  describe("hydrateFromBackend", () => {
    let registry: ModRegistry;

    beforeEach(() => {
      registry = resetRegistry();
    });

    it("populates workspaces from backend payload", () => {
      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [
            {
              id: "lims.entity",
              displayName: "Entity",
              prefix: "BLOOD",
              columns: [{ name: "Name", type: "text" as const }],
            },
          ],
          actions: [
            { id: "created", label: "Created", action_type: "created" },
          ],
        },
      };

      const manifests = new Map([["lims", makeManifest()]]);

      registry.hydrateFromBackend(payload, manifests);

      const workspaces = registry.getWorkspaces();
      expect(workspaces.has("lims")).toBe(true);

      const ws = workspaces.get("lims")!;
      expect(ws.id).toBe("lims");
      expect(ws.displayName).toBe("LIMS");
      expect(ws.icon).toBeUndefined();
      expect(ws.schemaType).toEqual({
        id: "lims.entity",
        displayName: "Entity",
        defaultPrefix: "BLOOD",
        columns: [{ name: "Name", type: "text" }],
      });
    });

    it("hydrates multiple workspaces from backend payload", () => {
      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [
            {
              id: "lims.entity",
              displayName: "Entity",
              prefix: "BLOOD",
              columns: [],
            },
          ],
          actions: [],
        },
        eln: {
          workspaceId: "eln",
          schemaTypes: [
            {
              id: "eln.entry",
              displayName: "ELN Entry",
              prefix: "E",
              columns: [],
            },
          ],
          actions: [],
        },
      };

      const manifests = new Map([
        ["lims", makeManifest({ name: "lims", displayName: "LIMS" })],
        ["eln", makeManifest({ name: "eln", displayName: "ELN" })],
      ]);

      registry.hydrateFromBackend(payload, manifests);

      const workspaces = registry.getWorkspaces();
      expect(workspaces.size).toBe(2);
      expect(workspaces.get("lims")?.displayName).toBe("LIMS");
      expect(workspaces.get("eln")?.displayName).toBe("ELN");
    });

    it("falls back to workspaceId as displayName when manifest is missing", () => {
      const payload = {
        external: {
          workspaceId: "external",
          schemaTypes: [
            {
              id: "external.thing",
              displayName: "Thing",
              prefix: "X",
              columns: [],
            },
          ],
          actions: [],
        },
      };

      registry.hydrateFromBackend(payload, new Map());

      const ws = registry.getWorkspaces().get("external")!;
      expect(ws.displayName).toBe("external");
    });

    it("uses the first schemaType from the array", () => {
      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [
            {
              id: "lims.entity",
              displayName: "Entity",
              prefix: "E",
              columns: [{ name: "Col1", type: "number" as const }],
            },
            {
              id: "lims.sample",
              displayName: "Sample",
              prefix: "S",
              columns: [],
            },
          ],
          actions: [],
        },
      };

      registry.hydrateFromBackend(payload, new Map([["lims", makeManifest()]]));

      const ws = registry.getWorkspaces().get("lims")!;
      expect(ws.schemaType?.id).toBe("lims.entity");
      expect(ws.schemaType?.defaultPrefix).toBe("E");
    });

    it("handles empty schemaTypes array gracefully", () => {
      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [],
          actions: [],
        },
      };

      registry.hydrateFromBackend(payload, new Map([["lims", makeManifest()]]));

      const ws = registry.getWorkspaces().get("lims")!;
      expect(ws.schemaType).toBeUndefined();
    });

    it("handles empty payload gracefully", () => {
      registry.hydrateFromBackend({}, new Map());

      const workspaces = registry.getWorkspaces();
      expect(workspaces.size).toBe(0);
    });

    it("correctly maps backend 'prefix' to SchemaTypeConfig 'defaultPrefix'", () => {
      // Regression: verify the backend prefix → frontend defaultPrefix
      // mapping so the LIMS prefix drift ("E" vs "BLOOD") is structurally
      // eliminated.
      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [
            {
              id: "lims.entity",
              displayName: "Entity",
              prefix: "BLOOD",
              columns: [],
            },
          ],
          actions: [],
        },
      };

      registry.hydrateFromBackend(payload, new Map([["lims", makeManifest()]]));

      const ws = registry.getWorkspaces().get("lims")!;
      expect(ws.schemaType?.defaultPrefix).toBe("BLOOD");
    });

    it("passes columns through from backend to schemaType", () => {
      const columns = [
        { id: "c1", name: "Patient ID", type: "text" as const, required: true },
        { name: "Hemoglobin", type: "number" as const, units: "g/dL" },
      ];

      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [
            {
              id: "lims.entity",
              displayName: "Entity",
              prefix: "BLOOD",
              columns,
            },
          ],
          actions: [],
        },
      };

      registry.hydrateFromBackend(payload, new Map([["lims", makeManifest()]]));

      const ws = registry.getWorkspaces().get("lims")!;
      expect(ws.schemaType?.columns).toEqual(columns);
    });

    it("overwrites workspaces on subsequent hydration calls (last write wins)", () => {
      // First hydration
      registry.hydrateFromBackend(
        {
          lims: {
            workspaceId: "lims",
            schemaTypes: [],
            actions: [],
          },
        },
        new Map([["lims", makeManifest({ displayName: "Old LIMS" })]]),
      );

      expect(registry.getWorkspaces().get("lims")?.displayName).toBe("Old LIMS");

      // Second hydration with updated display name
      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [
            {
              id: "lims.entity",
              displayName: "Entity",
              prefix: "BLOOD",
              columns: [],
            },
          ],
          actions: [],
        },
      };

      registry.hydrateFromBackend(payload, new Map([["lims", makeManifest()]]));

      // Hydration overwrites (last write wins)
      expect(registry.getWorkspaces().get("lims")?.displayName).toBe("LIMS");
    });
  });

  // ── Action catalog hydration ────────────────────────────────────────

  describe("action catalog hydration", () => {
    let registry: ModRegistry;

    beforeEach(() => {
      registry = resetRegistry();
    });

    it("stores actions from backend payload", () => {
      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [],
          actions: [
            { id: "created", label: "Created", action_type: "created" },
            { id: "edited", label: "Edited", action_type: "edited" },
            { id: "deleted", label: "Deleted", action_type: "deleted" },
          ],
        },
      };

      registry.hydrateFromBackend(payload, new Map([["lims", makeManifest()]]));

      const actions = registry.getActions("lims");
      expect(actions).toHaveLength(3);
      expect(actions[0]).toEqual({ id: "created", label: "Created", action_type: "created" });
      expect(actions[1]).toEqual({ id: "edited", label: "Edited", action_type: "edited" });
      expect(actions[2]).toEqual({ id: "deleted", label: "Deleted", action_type: "deleted" });
    });

    it("stores both core and custom actions from backend payload", () => {
      const payload = {
        eln: {
          workspaceId: "eln",
          schemaTypes: [],
          actions: [
            { id: "created", label: "Created", action_type: "created" },
            { id: "eln.entry.status-changed", label: "Status Changed", action_type: "edited" },
          ],
        },
      };

      registry.hydrateFromBackend(payload, new Map([["eln", makeManifest({ name: "eln" })]]));

      const actions = registry.getActions("eln");
      expect(actions).toHaveLength(2);

      const coreAction = actions.find((a) => a.id === "created");
      expect(coreAction).toBeDefined();
      expect(coreAction!.action_type).toBe("created");

      const customAction = actions.find((a) => a.id === "eln.entry.status-changed");
      expect(customAction).toBeDefined();
      expect(customAction!.action_type).toBe("edited");
      expect(customAction!.label).toBe("Status Changed");
    });

    it("stores actions for multiple workspaces", () => {
      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [],
          actions: [{ id: "created", label: "Created", action_type: "created" }],
        },
        eln: {
          workspaceId: "eln",
          schemaTypes: [],
          actions: [{ id: "created", label: "Created", action_type: "created" }],
        },
      };

      registry.hydrateFromBackend(
        payload,
        new Map([
          ["lims", makeManifest()],
          ["eln", makeManifest({ name: "eln" })],
        ]),
      );

      expect(registry.getActions("lims")).toHaveLength(1);
      expect(registry.getActions("eln")).toHaveLength(1);
    });

    it("getActions returns empty array for unknown workspace", () => {
      const actions = registry.getActions("nonexistent");
      expect(actions).toEqual([]);
    });

    it("getActions returns empty array before hydration", () => {
      const actions = registry.getActions("lims");
      expect(actions).toEqual([]);
    });

    it("clears actions when backend returns empty actions array", () => {
      // First hydration with actions.
      registry.hydrateFromBackend(
        {
          lims: {
            workspaceId: "lims",
            schemaTypes: [],
            actions: [{ id: "created", label: "Created", action_type: "created" }],
          },
        },
        new Map([["lims", makeManifest()]]),
      );
      expect(registry.getActions("lims")).toHaveLength(1);

      // Second hydration with empty actions — must clear stale data.
      registry.hydrateFromBackend(
        {
          lims: {
            workspaceId: "lims",
            schemaTypes: [],
            actions: [],
          },
        },
        new Map([["lims", makeManifest()]]),
      );

      const actions = registry.getActions("lims");
      expect(actions).toEqual([]);
    });

    it("overwrites actions on subsequent hydration calls (last write wins)", () => {
      // First hydration
      registry.hydrateFromBackend(
        {
          lims: {
            workspaceId: "lims",
            schemaTypes: [],
            actions: [{ id: "created", label: "Created", action_type: "created" }],
          },
        },
        new Map([["lims", makeManifest()]]),
      );

      expect(registry.getActions("lims")).toHaveLength(1);

      // Second hydration with different actions
      registry.hydrateFromBackend(
        {
          lims: {
            workspaceId: "lims",
            schemaTypes: [],
            actions: [
              { id: "created", label: "Created", action_type: "created" },
              { id: "lims.sample.registered", label: "Sample Registered", action_type: "edited" },
            ],
          },
        },
        new Map([["lims", makeManifest()]]),
      );

      expect(registry.getActions("lims")).toHaveLength(2);
    });
  });

  // ── Column type hydration ────────────────────────────────────────────

  describe("column type hydration", () => {
    let registry: ModRegistry;

    beforeEach(() => {
      registry = resetRegistry();
    });

    it("stores column types from backend payload", () => {
      const columnTypes = [
        {
          id: "text",
          displayName: "Text",
          icon: "type",
          operandShape: "text",
          defaultValue: "",
          operators: [
            { id: "eq", label: "Equals", operandShape: "text", djangoLookupName: "exact" },
            { id: "contains", label: "Contains", operandShape: "text", djangoLookupName: "icontains" },
          ],
        },
        {
          id: "number",
          displayName: "Number",
          icon: "hash",
          operandShape: "number",
          defaultValue: 0,
          operators: [
            { id: "eq", label: "Equals", operandShape: "number", djangoLookupName: "exact" },
          ],
        },
      ];

      const payload = {
        columnTypes,
        lims: {
          workspaceId: "lims",
          schemaTypes: [],
          actions: [],
        },
      };

      registry.hydrateFromBackend(payload, new Map([["lims", makeManifest()]]));

      // Column types are stored.
      expect(registry.getColumnTypes().size).toBe(2);
      expect(registry.getColumnType("text")).toEqual(columnTypes[0]);
      expect(registry.getColumnType("number")).toEqual(columnTypes[1]);
    });

    it("getColumnType returns undefined for unknown type", () => {
      expect(registry.getColumnType("nonexistent")).toBeUndefined();
    });

    it("getColumnType returns undefined before hydration", () => {
      expect(registry.getColumnType("text")).toBeUndefined();
    });

    it("getColumnTypes returns empty map before hydration", () => {
      expect(registry.getColumnTypes().size).toBe(0);
    });

    it("column types are looked up by type ID (lowercase)", () => {
      const columnTypes = [
        {
          id: "boolean",
          displayName: "Boolean",
          icon: "toggle-left",
          operandShape: "boolean",
          defaultValue: false,
          operators: [],
        },
      ];

      const payload = {
        columnTypes,
        lims: {
          workspaceId: "lims",
          schemaTypes: [],
          actions: [],
        },
      };

      registry.hydrateFromBackend(payload, new Map([["lims", makeManifest()]]));

      const ct = registry.getColumnType("boolean");
      expect(ct).toBeDefined();
      expect(ct!.id).toBe("boolean");
      expect(ct!.displayName).toBe("Boolean");
    });

    it("column types do not interfere with workspace hydration", () => {
      const columnTypes = [
        { id: "text", displayName: "Text", icon: "type", operandShape: "text", defaultValue: "", operators: [] },
      ];

      const payload = {
        columnTypes,
        lims: {
          workspaceId: "lims",
          schemaTypes: [
            {
              id: "lims.entity",
              displayName: "Entity",
              prefix: "BLOOD",
              columns: [],
            },
          ],
          actions: [],
        },
      };

      registry.hydrateFromBackend(payload, new Map([["lims", makeManifest()]]));

      // Workspaces still hydrated correctly.
      expect(registry.getWorkspaces().has("lims")).toBe(true);
      expect(registry.getWorkspaces().get("lims")?.displayName).toBe("LIMS");

      // Column types hydrated.
      expect(registry.getColumnTypes().size).toBe(1);
    });

    it("clears column types on subsequent hydration", () => {
      const firstTypes = [
        { id: "text", displayName: "Text", icon: "type", operandShape: "text", defaultValue: "", operators: [] },
      ];

      registry.hydrateFromBackend(
        { columnTypes: firstTypes, lims: { workspaceId: "lims", schemaTypes: [], actions: [] } },
        new Map([["lims", makeManifest()]]),
      );

      expect(registry.getColumnTypes().size).toBe(1);

      const secondTypes = [
        { id: "number", displayName: "Number", icon: "hash", operandShape: "number", defaultValue: 0, operators: [] },
        { id: "date", displayName: "Date", icon: "calendar", operandShape: "date", defaultValue: null, operators: [] },
      ];

      registry.hydrateFromBackend(
        { columnTypes: secondTypes },
        new Map(),
      );

      // Old types are cleared, new types are stored.
      expect(registry.getColumnTypes().size).toBe(2);
      expect(registry.getColumnType("text")).toBeUndefined();
      expect(registry.getColumnType("number")).toBeDefined();
      expect(registry.getColumnType("date")).toBeDefined();
    });

    it("payload with only columnTypes and no workspaces works", () => {
      const columnTypes = [
        { id: "text", displayName: "Text", icon: "type", operandShape: "text", defaultValue: "", operators: [] },
      ];

      registry.hydrateFromBackend({ columnTypes }, new Map());

      expect(registry.getColumnTypes().size).toBe(1);
      expect(registry.getColumnType("text")).toBeDefined();
      // Workspaces remain empty.
      expect(registry.getWorkspaces().size).toBe(0);
    });
  });

  // ── loadFromBackend ──────────────────────────────────────────────────

  describe("loadFromBackend", () => {
    let registry: ModRegistry;

    beforeEach(() => {
      registry = resetRegistry();
    });

    it("fetches and hydrates the registry from the API", async () => {
      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [],
          actions: [
            { id: "created", label: "Created", action_type: "created" },
            { id: "edited", label: "Edited", action_type: "edited" },
            { id: "deleted", label: "Deleted", action_type: "deleted" },
          ],
        },
      };

      // Mock fetch to return the payload.
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
      });

      try {
        const manifests = new Map([["lims", makeManifest()]]);
        await ModRegistry.loadFromBackend(manifests);

        // Workspaces are hydrated.
        expect(registry.getWorkspaces().has("lims")).toBe(true);

        // Actions are hydrated.
        const actions = registry.getActions("lims");
        expect(actions).toHaveLength(3);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("handles non-ok response gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      try {
        const manifests = new Map([["lims", makeManifest()]]);
        await ModRegistry.loadFromBackend(manifests);

        // Workspaces are NOT hydrated on failure.
        expect(registry.getWorkspaces().size).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Failed to fetch /api/mod-registry/"),
        );
      } finally {
        globalThis.fetch = originalFetch;
        warnSpy.mockRestore();
      }
    });

    it("handles network error gracefully", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      try {
        const manifests = new Map([["lims", makeManifest()]]);
        await ModRegistry.loadFromBackend(manifests);

        // Workspaces are NOT hydrated on error.
        expect(registry.getWorkspaces().size).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(
          "Failed to fetch /api/mod-registry/. Workspaces won't be hydrated from backend.",
          expect.any(Error),
        );
      } finally {
        globalThis.fetch = originalFetch;
        warnSpy.mockRestore();
      }
    });
  });

  // ── syncActions ──────────────────────────────────────────────────────

  describe("syncActions", () => {
    let registry: ModRegistry;
    let fetchSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      registry = resetRegistry();
      fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "ok" }),
      });
      globalThis.fetch = fetchSpy;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function TipTapRenderer() {
      return null;
    }
    function SidebarRenderer() {
      return null;
    }

    it("sends lifecycle actions for editor-slot-bound blocks", async () => {
      // Register an editor slot with TipTapRenderer.
      registry.declareSlot({
        id: "eln.editor",
        accepts: "block",
        renderer: TipTapRenderer,
        layout: "vertical",
        order: 0,
        defaults: {},
      });
      registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
      registry.registerIntoSlot("eln.editor", "eln.table");

      await registry.syncActions();

      // Should POST to sync-actions endpoint.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("/api/mod-registry/sync-actions/");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.mod_id).toBe("eln");

      // Should include lifecycle actions.
      const actionIds = body.actions.map(
        (a: { id: string }) => a.id,
      );
      expect(actionIds).toContain("eln.table.created");
      expect(actionIds).toContain("eln.table.edited");
      expect(actionIds).toContain("eln.table.deleted");
    });

    it("sends custom emit actions from block emits", async () => {
      registry.declareSlot({
        id: "eln.editor",
        accepts: "block",
        renderer: TipTapRenderer,
        layout: "vertical",
        order: 0,
        defaults: {},
      });
      registry.registerBlock(
        makeBlockRegistration({
          id: "eln.registry-table",
          emits: [
            BlockEvent.action({
              id: "entities-registered",
              core: "edited",
            }),
            BlockEvent.action({ id: "row-added", core: "edited" }),
          ],
        }),
      );
      registry.registerIntoSlot("eln.editor", "eln.registry-table");

      await registry.syncActions();

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const actionIds = body.actions.map(
        (a: { id: string }) => a.id,
      );

      // Lifecycle actions present (editor-slot-bound).
      expect(actionIds).toContain("eln.registry-table.created");
      expect(actionIds).toContain("eln.registry-table.edited");
      expect(actionIds).toContain("eln.registry-table.deleted");

      // Custom emit actions present.
      expect(actionIds).toContain("eln.registry-table.entities-registered");
      expect(actionIds).toContain("eln.registry-table.row-added");
    });

    it("skips UI-only emits", async () => {
      registry.declareSlot({
        id: "eln.editor",
        accepts: "block",
        renderer: TipTapRenderer,
        layout: "vertical",
        order: 0,
        defaults: {},
      });
      registry.registerBlock(
        makeBlockRegistration({
          id: "eln.registry-table",
          emits: [
            BlockEvent.action({
              id: "entities-registered",
              core: "edited",
            }),
            BlockEvent.ui({ id: "column-resized" }),
          ],
        }),
      );
      registry.registerIntoSlot("eln.editor", "eln.registry-table");

      await registry.syncActions();

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const actionIds = body.actions.map(
        (a: { id: string }) => a.id,
      );

      // Action events are included.
      expect(actionIds).toContain(
        "eln.registry-table.entities-registered",
      );
      // UI events are excluded.
      expect(actionIds).not.toContain(
        "eln.registry-table.column-resized",
      );
    });

    it("skips lifecycle actions for non-editor slots", async () => {
      // Sidebar slot uses a non-TipTap renderer.
      registry.declareSlot({
        id: "eln.sidebar",
        accepts: "block",
        renderer: SidebarRenderer,
        layout: "vertical",
        order: 0,
        defaults: {},
      });
      registry.registerBlock(makeBlockRegistration({ id: "eln.metadata" }));
      registry.registerIntoSlot("eln.sidebar", "eln.metadata");

      await registry.syncActions();

      // No POST should be made — no actions to sync.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("includes custom emits for non-editor blocks", async () => {
      // A sidebar block that has emits — custom emit actions should
      // still be synced even though the block isn't in an editor slot.
      registry.declareSlot({
        id: "eln.sidebar",
        accepts: "block",
        renderer: SidebarRenderer,
        layout: "vertical",
        order: 0,
        defaults: {},
      });
      registry.registerBlock(
        makeBlockRegistration({
          id: "eln.sidebar-widget",
          emits: [
            BlockEvent.action({ id: "widget-clicked", core: "edited" }),
          ],
        }),
      );
      registry.registerIntoSlot("eln.sidebar", "eln.sidebar-widget");

      await registry.syncActions();

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const actionIds = body.actions.map(
        (a: { id: string }) => a.id,
      );

      // Custom emit is synced regardless of slot type.
      expect(actionIds).toContain("eln.sidebar-widget.widget-clicked");
      // But NO lifecycle actions (sidebar, not editor).
      expect(actionIds).not.toContain(
        "eln.sidebar-widget.created",
      );
      expect(actionIds).not.toContain(
        "eln.sidebar-widget.edited",
      );
      expect(actionIds).not.toContain(
        "eln.sidebar-widget.deleted",
      );
    });

    it("hard-fails when backend returns validation error", async () => {
      registry.declareSlot({
        id: "eln.editor",
        accepts: "block",
        renderer: TipTapRenderer,
        layout: "vertical",
        order: 0,
        defaults: {},
      });
      registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
      registry.registerIntoSlot("eln.editor", "eln.table");

      fetchSpy.mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            status: "error",
            missing: ["eln.table.created"],
          }),
      });

      await expect(registry.syncActions()).rejects.toThrow(
        "Action sync failed for mod 'eln': Missing actions: eln.table.created",
      );
    });

    it("hard-fails when backend returns unexpected error", async () => {
      registry.declareSlot({
        id: "eln.editor",
        accepts: "block",
        renderer: TipTapRenderer,
        layout: "vertical",
        order: 0,
        defaults: {},
      });
      registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
      registry.registerIntoSlot("eln.editor", "eln.table");

      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await expect(registry.syncActions()).rejects.toThrow(
        "Action sync failed for mod 'eln': HTTP 500",
      );
    });

    it("groups actions by mod and sends separate requests", async () => {
      // Register two mods' blocks in the same editor slot.
      registry.declareSlot({
        id: "eln.editor",
        accepts: "block",
        renderer: TipTapRenderer,
        layout: "vertical",
        order: 0,
        defaults: {},
      });
      registry.declareSlot({
        id: "lims.editor",
        accepts: "block",
        renderer: TipTapRenderer,
        layout: "vertical",
        order: 0,
        defaults: {},
      });

      registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
      registry.registerBlock(makeBlockRegistration({ id: "lims.sample" }));
      registry.registerIntoSlot("eln.editor", "eln.table");
      registry.registerIntoSlot("lims.editor", "lims.sample");

      await registry.syncActions();

      // Two requests — one per mod.
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const modIds = fetchSpy.mock.calls.map(
        (call: [string, RequestInit]) =>
          JSON.parse(call[1].body as string).mod_id,
      );
      expect(modIds).toContain("eln");
      expect(modIds).toContain("lims");
    });

    it("syncs nothing when no blocks are registered", async () => {
      await registry.syncActions();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("includes correct core verb in each action", async () => {
      registry.declareSlot({
        id: "eln.editor",
        accepts: "block",
        renderer: TipTapRenderer,
        layout: "vertical",
        order: 0,
        defaults: {},
      });
      registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
      registry.registerIntoSlot("eln.editor", "eln.table");

      await registry.syncActions();

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const actionMap = new Map(
        body.actions.map((a: { id: string; core: string }) => [
          a.id,
          a.core,
        ]),
      );

      expect(actionMap.get("eln.table.created")).toBe("created");
      expect(actionMap.get("eln.table.edited")).toBe("edited");
      expect(actionMap.get("eln.table.deleted")).toBe("deleted");
    });
  });
});
