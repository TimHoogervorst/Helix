import { describe, it, expect, beforeEach } from "vitest";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
// RegisteredEntityType type is imported only as a type reference in test assertions

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

  it("registers a workspace for LIMS", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const workspaces = registry.getWorkspaces();
    expect(workspaces.has("lims")).toBe(true);
    expect(workspaces.get("lims")?.displayName).toBe("LIMS");
  });

  it("registers the lims.registerEntityType service", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    // Service should be registered
    const result = await registry.call("lims.registerEntityType", {
      prefix: "DNA",
      entityType: "dna_sequence",
      workspaceId: "molBio",
      displayName: "DNA Sequence",
    });
    expect(result).toBeUndefined();
  });

  it("lims.registerEntityType throws on duplicate prefix", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    await registry.call("lims.registerEntityType", {
      prefix: "DNA",
      entityType: "dna_sequence",
      workspaceId: "molBio",
      displayName: "DNA Sequence",
    });

    await expect(
      registry.call("lims.registerEntityType", {
        prefix: "DNA",
        entityType: "plasmid",
        workspaceId: "molBio",
        displayName: "Plasmid",
      }),
    ).rejects.toThrow(
      "Duplicate entity type prefix 'DNA': 'dna_sequence' is already registered",
    );
  });

  it("lims.registerEntityType throws on missing prefix", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    await expect(
      registry.call("lims.registerEntityType", { foo: "bar" }),
    ).rejects.toThrow(
      "lims.registerEntityType: config must have a 'prefix' property.",
    );
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
