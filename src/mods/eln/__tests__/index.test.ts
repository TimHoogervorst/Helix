import { describe, it, expect, beforeEach } from "vitest";
import {
  ModRegistry,
  type SlotDeclaration,
  type ButtonRegistration,
  type SlotBinding,
} from "../../../core/mod-system";

// ── Helpers ──────────────────────────────────────────────────────────────

function resetRegistry(): void {
  ModRegistry._reset();
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("eln mod registration", () => {
  beforeEach(() => {
    resetRegistry();
  });

  it("has correct meta", async () => {
    const mod = await import("../index");

    expect(mod.meta.id).toBe("eln");
    expect(mod.meta.displayName).toBe("ELN");
    expect(mod.meta.dependsOn).toEqual(["lims", "tags"]);
  });

  it("registers a workspace for ELN", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const workspaces = registry.getWorkspaces();
    expect(workspaces.has("eln")).toBe(true);
    expect(workspaces.get("eln")?.displayName).toBe("ELN");
  });

  it("registers route for /eln/:id (no longer registers /eln/new)", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const routes = registry.getRoutes();
    const newEntryRoute = routes.get("eln.new-entry");
    const detailRoute = routes.get("eln.entry-page");

    // The /eln/new route has been removed — entries are now created
    // server-side via immediate POST before navigation.
    expect(newEntryRoute).toBeUndefined();

    expect(detailRoute).toBeDefined();
    expect(detailRoute!.modId).toBe("eln");
    expect(detailRoute!.component).toBeTruthy();
  });

  it("registers a library item for eln.entry", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const items = registry.getLibraryItems();
    const item = items.get("eln.entry");

    expect(item).toBeDefined();
  });

  it("no longer registers a settings section — tags moved to tags mod", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const sections = registry.getSettingsSections();
    const tagSection = sections.find((s) => s.id === "eln.tags");
    expect(tagSection).toBeUndefined();
  });

  it("passes validation (no console/workspace cross-references to validate)", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    // No more workspace → console cross-references. Validation should pass.
    expect(() => registry.validate()).not.toThrow();
  });

  // ── Slot System — Header Toolbar Dogfood (#227) ─────────────────────────

  it("declares the eln.header.actions slot with ButtonGroupRenderer", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const slots = registry.getSlots();
    const headerSlot = slots.get("eln.header.actions") as
      | SlotDeclaration
      | undefined;

    expect(headerSlot).toBeDefined();
    expect(headerSlot!.id).toBe("eln.header.actions");
    expect(headerSlot!.accepts).toBe("button");
    expect(headerSlot!.layout).toBe("horizontal");
    expect(headerSlot!.order).toBe(0);
    expect(headerSlot!.defaults).toEqual({});
    // renderer must be a function (component)
    expect(typeof headerSlot!.renderer).toBe("function");
  });

  it("registers the eln.export button with correct metadata", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const buttons = registry.getButtons();
    const exportBtn = buttons.get("eln.export") as
      | ButtonRegistration
      | undefined;

    expect(exportBtn).toBeDefined();
    expect(exportBtn!.id).toBe("eln.export");
    expect(exportBtn!.label).toBe("Export");
    expect(typeof exportBtn!.onClick).toBe("function");
  });

  it("binds eln.export into eln.header.actions slot", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const bindings = registry.getBindings();
    const headerBindings = bindings.get("eln.header.actions") as
      | SlotBinding[]
      | undefined;

    expect(headerBindings).toBeDefined();
    expect(headerBindings!.length).toBe(1);

    const exportBinding = headerBindings!.find(
      (b) => b.targetId === "eln.export",
    );
    expect(exportBinding).toBeDefined();
    expect(exportBinding!.slotId).toBe("eln.header.actions");
    expect(exportBinding!.order).toBe(0);
    expect(exportBinding!.overrides).toEqual({});
  });

  it("eln.export button onClick calls bus.collect(\"eln.data.exported\")", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const buttons = registry.getButtons();
    const exportBtn = buttons.get("eln.export") as
      | ButtonRegistration
      | undefined;

    expect(exportBtn).toBeDefined();

    // Create a mock bus to verify onClick calls bus.collect("eln.data.exported")
    const collectCalls: string[] = [];
    const mockBus = {
      collect: (event: string) => {
        collectCalls.push(event);
        return Promise.resolve([]);
      },
    };

    exportBtn!.onClick({
      bus: mockBus as any,
      context: {
        workspaceId: "eln",
        user: { id: "u1" },
        viewMode: "edit",
        entryId: "e1",
      },
    });

    expect(collectCalls).toEqual(["eln.data.exported"]);
  });
});
