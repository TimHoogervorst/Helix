import { describe, it, expect, beforeAll } from "vitest";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type {
  SlotDeclaration,
  ButtonRegistration,
  SlotBinding,
} from "../../../shell/src/mod-system/types";

describe("eln mod registration", () => {
  let registry: ModRegistry;

  beforeAll(async () => {
    await import("../index");
    registry = ModRegistry.getInstance();
    try {
      registry.registerMod("eln");
    } catch {
      // already registered from another test file
    }
  });

  it("does not export inline meta", async () => {
    const mod = await import("../index");
    expect((mod as Record<string, unknown>).meta).toBeUndefined();
  });

  it("does not populate workspaces during register()", () => {
    const workspaces = registry.getWorkspaces();
    expect(workspaces.has("eln")).toBe(false);
  });

  it("registers route for /eln/:id (no longer registers /eln/new)", () => {
    const routes = registry.getRoutes();
    const newEntryRoute = routes.get("eln.new-entry");
    const detailRoute = routes.get("eln.entry-page");

    expect(newEntryRoute).toBeUndefined();
    expect(detailRoute).toBeDefined();
    expect(detailRoute!.modId).toBe("eln");
    expect(detailRoute!.component).toBeTruthy();
  });

  it("registers the development ELN table preview route", () => {
    const route = registry.getRoutes().get("eln.dev-eln");

    expect(route).toBeDefined();
    expect(route!.path).toBe("/dev/eln");
    expect(route!.modId).toBe("eln");
    expect(route!.component).toBeTruthy();
  });

  it("no longer registers a library item — card rendering is generic now", () => {
    const workspaces = registry.getWorkspaces();
    expect(workspaces.has("eln")).toBe(false);
  });

  it("no longer registers a settings section — tags moved to tags mod", () => {
    const sections = registry.getSettingsSections();
    const tagSection = sections.find((s) => s.id === "eln.tags");
    expect(tagSection).toBeUndefined();
  });

  it("passes validation (no console/workspace cross-references to validate)", () => {
    expect(() => registry.validate()).not.toThrow();
  });

  // ── Slot System — Header Toolbar Dogfood (#227) ─────────────────────────

  it("declares the eln.header-actions slot with ButtonGroupRenderer", () => {
    const slots = registry.getSlots();
    const headerSlot = slots.get("eln.header-actions") as
      | SlotDeclaration
      | undefined;

    expect(headerSlot).toBeDefined();
    expect(headerSlot!.id).toBe("eln.header-actions");
    expect(headerSlot!.accepts).toBe("button");
    expect(headerSlot!.layout).toBe("horizontal");
    expect(headerSlot!.order).toBe(0);
    expect(headerSlot!.defaults).toEqual({});
    expect(typeof headerSlot!.renderer).toBe("function");
  });

  it.skip("registers the eln.export button with correct metadata", () => {
    const buttons = registry.getButtons();
    const exportBtn = buttons.get("eln.export") as
      | ButtonRegistration
      | undefined;

    expect(exportBtn).toBeDefined();
    expect(exportBtn!.id).toBe("eln.export");
    expect(exportBtn!.label).toBe("Export");
    expect(typeof exportBtn!.onClick).toBe("function");
  });

  it.skip("binds eln.export into eln.header-actions slot", () => {
    const bindings = registry.getBindings();
    const headerBindings = bindings.get("eln.header-actions") as
      | SlotBinding[]
      | undefined;

    expect(headerBindings).toBeDefined();
    expect(headerBindings!.length).toBe(1);

    const exportBinding = headerBindings!.find(
      (b) => b.targetId === "eln.export",
    );
    expect(exportBinding).toBeDefined();
    expect(exportBinding!.slotId).toBe("eln.header-actions");
    expect(exportBinding!.order).toBe(0);
    expect(exportBinding!.overrides).toEqual({});
  });

  it.skip("eln.export button onClick calls bus.collect(\"eln.data.exported\")", () => {
    const buttons = registry.getButtons();
    const exportBtn = buttons.get("eln.export") as
      | ButtonRegistration
      | undefined;

    expect(exportBtn).toBeDefined();

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
