import { describe, it, expect, beforeEach } from "vitest";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";

// ── Helpers ──────────────────────────────────────────────────────────────

function resetRegistry(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("lims mod registration", () => {
  beforeEach(() => {
    resetRegistry();
  });

  it("has correct meta", async () => {
    const mod = await import("../index");

    expect(mod.meta.id).toBe("lims");
    expect(mod.meta.displayName).toBe("LIMS");
    expect(mod.meta.dependsOn).toEqual([]);
  });

  it("registers a workspace for LIMS with schemaType", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const workspaces = registry.getWorkspaces();
    expect(workspaces.has("lims")).toBe(true);
    const ws = workspaces.get("lims");
    expect(ws?.displayName).toBe("LIMS");
    expect(ws?.schemaType).toEqual({
      id: "lims.entity",
      displayName: "Entity",
      defaultPrefix: "E",
    });
  });

  it("registers route for /lims/:displayId", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const routes = registry.getRoutes();
    const route = routes.get("lims.entity-page");

    expect(route).toBeDefined();
    expect(route!.modId).toBe("lims");
    expect(route!.path).toBe("/lims/:displayId");
  });

  it("registers schema settings section", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const sections = registry.getSettingsSections();
    const schemaSection = sections.find((s) => s.id === "lims.schema-settings");

    expect(schemaSection).toBeDefined();
    expect(schemaSection!.modId).toBe("lims");
    expect(schemaSection!.label).toBe("Schemas");
  });

  it("passes validation", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    expect(() => registry.validate()).not.toThrow();
  });
});
