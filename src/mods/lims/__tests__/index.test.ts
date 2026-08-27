import { describe, it, expect, beforeAll } from "vitest";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";

describe("lims mod registration", () => {
  let registry: ModRegistry;

  beforeAll(async () => {
    await import("../index");
    registry = ModRegistry.getInstance();
    try {
      registry.registerMod("lims");
    } catch {
      // already registered from another test file
    }
  });

  it("does not export inline meta", async () => {
    const mod = await import("../index");
    expect((mod as Record<string, unknown>).meta).toBeUndefined();
  });

  it("registers route for /lims/:displayId", () => {
    const routes = registry.getRoutes();
    const route = routes.get("lims.entity-page");

    expect(route).toBeDefined();
    expect(route!.modId).toBe("lims");
    expect(route!.path).toBe("/lims/:displayId");
  });

  it("does not populate workspaces during register()", () => {
    const workspaces = registry.getWorkspaces();
    expect(workspaces.has("lims")).toBe(false);
  });

  it("registers schema settings section", () => {
    const sections = registry.getSettingsSections();
    const schemaSection = sections.find((s) => s.id === "lims.schema-settings");

    expect(schemaSection).toBeDefined();
    expect(schemaSection!.modId).toBe("lims");
    expect(schemaSection!.label).toBe("Schemas");
  });

  it("registers a fetch-only activity feed block", () => {
    const block = registry.getBlocks().get("lims.activity-feed");

    expect(block).toBeDefined();
    expect(block!.listensTo).toEqual([]);
  });

  it("passes validation", () => {
    expect(() => registry.validate()).not.toThrow();
  });
});
