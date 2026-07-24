import { describe, it, expect, beforeEach, vi } from "vitest";

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
    serialize: (state) => JSON.stringify(state),
    deserialize: (json) => JSON.parse(json),
    defaultState: {},
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
    registry.registerIntoSlot("eln.header.actions", "eln.export");
    expect(registry.getBindings().get("eln.editor")).toHaveLength(1);
    expect(registry.getBindings().get("eln.header.actions")).toHaveLength(1);
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
    registry.declareSlot(makeSlotDeclaration({ id: "eln.header.actions", accepts: "button" }));
    registry.registerBlock(makeBlockRegistration({ id: "eln.table" }));
    registry.registerIntoSlot("eln.header.actions", "eln.table");
    registry.validate();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("accepts 'button' but target"),
    );
    expect(registry.getBindings().has("eln.header.actions")).toBe(false);
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
    registry.registerBlock(makeBlockRegistration({ id: "eln.legacy-block" }));
    registry.registerIntoSlot("eln.editor", "eln.legacy-block");

    const result = registry.resolveSlot("eln.editor");
    // All BlockRegistration entries participate in the slot system
    expect(result).not.toBeNull();
    expect(result!.bindings).toHaveLength(1);
    expect(result!.bindings[0].id).toBe("eln.legacy-block");
  });

  it("resolveSlot resolves a button binding", () => {
    registry.declareSlot(
      makeSlotDeclaration({
        id: "eln.header.actions",
        accepts: "button",
        defaults: { size: "sm" },
      }),
    );
    registry.registerButton(
      makeButtonRegistration({ id: "eln.export", label: "Export" }),
    );
    registry.registerIntoSlot("eln.header.actions", "eln.export", {}, 0);

    const result = registry.resolveSlot("eln.header.actions");
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
        id: "eln.header.actions",
        accepts: "button",
      }),
    );
    registry.registerButton(
      makeButtonRegistration({ id: "eln.export" }),
    );
    registry.registerIntoSlot("eln.header.actions", "eln.export");
    registry.registerIntoSlot("eln.header.actions", "nonexistent.button");

    const result = registry.resolveSlot("eln.header.actions");
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
        messages: { edited: "spreadsheet updated" },
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
      expect(binding.messages).toEqual({ edited: "spreadsheet updated" });
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

    function makeManifest(overrides?: Partial<ModManifest>): ModManifest {
      return {
        id: "lims",
        displayName: "LIMS",
        dependsOn: [],
        ...overrides,
      };
    }

    it("populates workspaces from backend payload", () => {
      const payload = {
        lims: {
          workspaceId: "lims",
          schemaTypes: [
            {
              id: "lims.entity",
              displayName: "Entity",
              prefix: "BLOOD",
              columns: [{ name: "Name", type: "Text" as const }],
            },
          ],
          actions: [
            { id: "created", label: "Created", core: true },
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
        columns: [{ name: "Name", type: "Text" }],
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
        ["lims", makeManifest({ id: "lims", displayName: "LIMS" })],
        ["eln", makeManifest({ id: "eln", displayName: "ELN" })],
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
              columns: [{ name: "Col1", type: "Number" as const }],
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
        { id: "c1", name: "Patient ID", type: "Text" as const, required: true },
        { name: "Hemoglobin", type: "Number" as const, units: "g/dL" },
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
});
