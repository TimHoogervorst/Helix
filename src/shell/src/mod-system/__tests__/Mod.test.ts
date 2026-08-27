import { describe, it, expect, beforeEach } from "vitest";
import { Mod } from "../Mod";
import { BlockEvent } from "../BlockEvent";
import { ModRegistry } from "../ModRegistry";
import type {
  ModManifest,
  BlockRegistration,
} from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Dummy React component for use in test configs. */
function DummyComponent() {
  return null;
}

function makeTestManifest(
  overrides?: Partial<ModManifest>,
): ModManifest {
  return {
    vendor: "helix",
    name: "test-mod",
    displayName: "Test Mod",
    version: "0.1.0",
    dependsOn: [],
    ...overrides,
  };
}

function makeBlockConfig(
  overrides?: Partial<Omit<BlockRegistration, "id">>,
): Omit<BlockRegistration, "id"> {
  return {
    label: "Test Block",
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

function resetRegistry(): ModRegistry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
  return ModRegistry.getInstance();
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Mod", () => {
  let registry: ModRegistry;

  beforeEach(() => {
    registry = resetRegistry();
  });

  // ── Constructor & identity ────────────────────────────────────────────

  describe("constructor & identity", () => {
    it("stores the manifest", () => {
      const manifest = makeTestManifest();
      const mod = new Mod(manifest);
      expect(mod.manifest).toBe(manifest);
    });

    it("derives id as vendor.name", () => {
      const mod = new Mod(makeTestManifest({ vendor: "acme", name: "widget" }));
      expect(mod.id).toBe("acme.widget");
    });

    it("derives id for default helix vendor", () => {
      const mod = new Mod(makeTestManifest({ vendor: "helix", name: "eln" }));
      expect(mod.id).toBe("helix.eln");
    });
  });

  // ── registerBlock ─────────────────────────────────────────────────────

  describe("registerBlock", () => {
    it("derives global ID from manifest.name + local name", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      const handle = mod.registerBlock("table", makeBlockConfig());

      expect(handle.globalId).toBe("eln.table");
      expect(handle.modId).toBe("helix.eln");
      expect(handle.__brand).toBe("BlockHandle");
    });

    it("delegates to ModRegistry.registerBlock with derived global ID", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      mod.registerBlock("table", makeBlockConfig());

      const blocks = registry.getBlocks();
      expect(blocks.has("eln.table")).toBe(true);
      expect(blocks.get("eln.table")?.label).toBe("Test Block");
    });

    it("returns a BlockHandle with empty emits when no emits in config", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      const handle = mod.registerBlock("table", makeBlockConfig());

      expect(handle.emits).toEqual({});
    });

    it("returns a BlockHandle with typed emitters for each emits entry", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      const handle = mod.registerBlock(
        "table",
        makeBlockConfig({
          emits: [
            BlockEvent.action({ id: "row-added", core: "created" }),
            BlockEvent.action({ id: "entities-registered", core: "created" }),
          ],
        }),
      );

      expect(Object.keys(handle.emits)).toEqual([
        "row-added",
        "entities-registered",
      ]);
      expect(handle.emits["row-added"]).toBeDefined();
      expect(typeof handle.emits["row-added"].fire).toBe("function");
      expect(handle.emits["entities-registered"]).toBeDefined();
      expect(typeof handle.emits["entities-registered"].fire).toBe("function");
    });

    it("passes through all block config fields to ModRegistry", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      mod.registerBlock(
        "chart",
        makeBlockConfig({
          label: "Chart",
          tags: ["data", "visualization"],
          listensTo: ["data.refresh"],
          onEvent: { "data.refresh": () => {} },
        }),
      );

      const block = registry.getBlocks().get("eln.chart");
      expect(block).toBeDefined();
      expect(block?.label).toBe("Chart");
      expect(block?.tags).toEqual(["data", "visualization"]);
      expect(block?.listensTo).toEqual(["data.refresh"]);
    });

    it("uses the correct modId for different vendor/name combinations", () => {
      const mod = new Mod(makeTestManifest({ vendor: "acme", name: "lims" }));
      const handle = mod.registerBlock("sample-viewer", makeBlockConfig());

      expect(handle.globalId).toBe("lims.sample-viewer");
      expect(handle.modId).toBe("acme.lims");
    });
  });

  // ── declareSlot ───────────────────────────────────────────────────────

  describe("declareSlot", () => {
    it("derives global slot ID and returns SlotHandle", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      const handle = mod.declareSlot("editor", {
        accepts: "block",
        renderer: DummyComponent,
        layout: "vertical",
        order: 0,
        defaults: {},
      });

      expect(handle.__brand).toBe("SlotHandle");
      expect(handle.globalId).toBe("eln.editor");
      expect(handle.modId).toBe("helix.eln");
      expect(handle.accepts).toBe("block");
    });

    it("delegates to ModRegistry.declareSlot", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      mod.declareSlot("editor", {
        accepts: "block" as const,
        renderer: DummyComponent,
        layout: "vertical" as const,
        order: 0,
        defaults: {},
      });

      const slot = registry.getSlots().get("eln.editor");
      expect(slot).toBeDefined();
      expect(slot?.accepts).toBe("block");
    });

    it("returns SlotHandle with correct accepts for button slots", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      const handle = mod.declareSlot("header-actions", {
        accepts: "button",
        renderer: DummyComponent,
        layout: "horizontal",
        order: 0,
        defaults: {},
      });

      expect(handle.accepts).toBe("button");
    });
  });

  // ── registerButton ────────────────────────────────────────────────────

  describe("registerButton", () => {
    it("derives global button ID and returns ButtonHandle", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      const handle = mod.registerButton("export", {
        label: "Export",
        onClick: () => {},
      });

      expect(handle.__brand).toBe("ButtonHandle");
      expect(handle.globalId).toBe("eln.export");
      expect(handle.modId).toBe("helix.eln");
    });

    it("delegates to ModRegistry.registerButton", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      mod.registerButton("export", {
        label: "Export",
        icon: DummyComponent,
        onClick: () => {},
      });

      const button = registry.getButtons().get("eln.export");
      expect(button).toBeDefined();
      expect(button?.label).toBe("Export");
    });
  });

  // ── registerIntoSlot ─────────────────────────────────────────────────

  describe("registerIntoSlot", () => {
    it("binds a block into a slot using handles", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));

      const slot = mod.declareSlot("editor", {
        accepts: "block",
        renderer: DummyComponent,
        layout: "vertical",
        order: 0,
        defaults: {},
      });

      const block = mod.registerBlock("table", makeBlockConfig());

      mod.registerIntoSlot(slot, block);

      const bindings = registry.getBindings().get("eln.editor");
      expect(bindings).toBeDefined();
      expect(bindings).toHaveLength(1);
      expect(bindings![0].targetId).toBe("eln.table");
    });

    it("binds a button into a button slot using handles", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));

      const slot = mod.declareSlot("header-actions", {
        accepts: "button",
        renderer: DummyComponent,
        layout: "horizontal",
        order: 0,
        defaults: {},
      });

      const button = mod.registerButton("export", {
        label: "Export",
        onClick: () => {},
      });

      mod.registerIntoSlot(slot, button);

      const bindings = registry.getBindings().get("eln.header-actions");
      expect(bindings).toBeDefined();
      expect(bindings![0].targetId).toBe("eln.export");
    });

    it("passes overrides and order through to ModRegistry", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));

      const slot = mod.declareSlot("editor", {
        accepts: "block",
        renderer: DummyComponent,
        layout: "vertical",
        order: 0,
        defaults: {},
      });

      const block = mod.registerBlock("table", makeBlockConfig());

      mod.registerIntoSlot(slot, block, { nodeType: "inline" }, 5);

      const binding = registry.getBindings().get("eln.editor")![0];
      expect(binding.overrides).toEqual({ nodeType: "inline" });
      expect(binding.order).toBe(5);
    });

    it("binds multiple targets into the same slot", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));

      const slot = mod.declareSlot("editor", {
        accepts: "block",
        renderer: DummyComponent,
        layout: "vertical",
        order: 0,
        defaults: {},
      });

      const table = mod.registerBlock("table", makeBlockConfig());
      const chart = mod.registerBlock("chart", makeBlockConfig());

      mod.registerIntoSlot(slot, table, {}, 0);
      mod.registerIntoSlot(slot, chart, {}, 1);

      const bindings = registry.getBindings().get("eln.editor");
      expect(bindings).toHaveLength(2);
    });
  });

  // ── registerHub ───────────────────────────────────────────────────────

  describe("registerHub", () => {
    it("derives global hub ID and delegates", () => {
      const mod = new Mod(makeTestManifest({ name: "lims" }));
      mod.registerHub("entities", {
        label: "Entities",
        icon: DummyComponent,
        route: "/entities",
        component: DummyComponent,
        order: 20,
      });

      const hub = registry.getHubs().get("lims.entities");
      expect(hub).toBeDefined();
      expect(hub?.label).toBe("Entities");
      expect(hub?.route).toBe("/entities");
    });
  });

  // ── registerRoute ─────────────────────────────────────────────────────

  describe("registerRoute", () => {
    it("derives global route ID and auto-sets modId from manifest.name", () => {
      const mod = new Mod(makeTestManifest({ name: "eln" }));
      mod.registerRoute("entry-page", {
        path: "/eln/:id",
        component: DummyComponent,
      });

      const route = registry.getRoutes().get("eln.entry-page");
      expect(route).toBeDefined();
      expect(route?.modId).toBe("eln");
      expect(route?.path).toBe("/eln/:id");
    });
  });

  // ── registerSettingsSection ───────────────────────────────────────────

  describe("registerSettingsSection", () => {
    it("derives global section ID and auto-sets modId from manifest.name", () => {
      const mod = new Mod(makeTestManifest({ name: "tags" }));
      mod.registerSettingsSection("manage", {
        label: "Labelling",
        component: DummyComponent,
        order: 20,
      });

      const sections = registry.getSettingsSections();
      const section = sections.find((s) => s.id === "tags.manage");
      expect(section).toBeDefined();
      expect(section?.modId).toBe("tags");
      expect(section?.label).toBe("Labelling");
    });
  });

  describe("registerSchemaComponent", () => {
    it("derives a namespaced component ID", () => {
      const mod = new Mod(makeTestManifest({ name: "lims" }));
      mod.registerSchemaComponent("results", {
        label: "Results",
        icon: DummyComponent,
        component: DummyComponent,
        order: 10,
      });

      expect(registry.getSchemaComponents()[0]).toMatchObject({
        id: "lims.results",
        label: "Results",
      });
    });
  });

  // ── Cross-mod isolation ──────────────────────────────────────────────

  describe("cross-mod isolation", () => {
    it("two Mod instances with different manifests produce isolated global IDs", () => {
      const elnMod = new Mod(makeTestManifest({ name: "eln" }));
      const limsMod = new Mod(makeTestManifest({ name: "lims" }));

      const elnBlock = elnMod.registerBlock("table", makeBlockConfig());
      const limsBlock = limsMod.registerBlock("table", makeBlockConfig());

      expect(elnBlock.globalId).toBe("eln.table");
      expect(limsBlock.globalId).toBe("lims.table");
      expect(elnBlock.modId).toBe("helix.eln");
      expect(limsBlock.modId).toBe("helix.lims");

      // Both should exist in registry
      expect(registry.getBlocks().has("eln.table")).toBe(true);
      expect(registry.getBlocks().has("lims.table")).toBe(true);
    });
  });
});
