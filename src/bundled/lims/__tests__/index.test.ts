import { describe, it, expect, beforeAll } from "vitest";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { Mod } from "../../../shell/src/mod-system/Mod";
import manifest from "../modManifest.json";

describe("lims mod registration", () => {
  let registry: ModRegistry;

  beforeAll(async () => {
    const mod = await import("../index");
    registry = ModRegistry.getInstance();
    registry.registerMod(manifest.id);
    mod.register(new Mod(manifest));
  });

  it("does not export inline meta", async () => {
    const mod = await import("../index");
    expect((mod as Record<string, unknown>).meta).toBeUndefined();
  });

  it("registers route for /lims/:displayId", () => {
    const routes = registry.getRoutes();
    const route = routes.get("helix.lims:lims-workspace");

    expect(route).toBeDefined();
    expect(route!.modId).toBe("helix.lims");
    expect(route!.path).toBe("/w/helix/lims/lims/:displayId");
  });

  it("does not populate workspaces during register()", () => {
    const workspaces = registry.getWorkspaces();
    expect(workspaces.get("lims")?.reference.modId).toBe("helix.lims");
  });

  it("registers schema settings section", () => {
    const sections = registry.getSettingsSections();
    const schemaSection = sections.find((s) => s.id === "helix.lims:schema-settings");

    expect(schemaSection).toBeDefined();
    expect(schemaSection!.modId).toBe("helix.lims");
    expect(schemaSection!.label).toBe("Schemas");
  });

  it("does not own the cross-workspace Entities hub", () => {
    expect(registry.getHubs().has("lims.entities")).toBe(false);
  });

  it("registers a fetch-only activity feed block", () => {
    const block = registry.getBlocks().get("helix.lims:activity-feed");

    expect(block).toBeDefined();
    expect(block!.listensTo).toEqual([]);
  });

  it("passes validation", () => {
    expect(() => registry.validate()).not.toThrow();
  });
});
