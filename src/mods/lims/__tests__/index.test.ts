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

  it("does not export inline meta", async () => {
    const mod = await import("../index");
    expect((mod as Record<string, unknown>).meta).toBeUndefined();
  });

  it("does not populate workspaces during register()", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod("lims");
    mod.register();

    // Workspaces are now hydrated from GET /api/mod-registry/, not from
    // registerWorkspace() calls inside register().
    const workspaces = registry.getWorkspaces();
    expect(workspaces.has("lims")).toBe(false);
  });

  it("registers route for /lims/:displayId", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod("lims");
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
    registry.registerMod("lims");
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
    registry.registerMod("lims");
    mod.register();

    expect(() => registry.validate()).not.toThrow();
  });
});
