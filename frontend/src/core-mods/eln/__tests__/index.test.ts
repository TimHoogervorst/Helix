import { describe, it, expect, beforeEach } from "vitest";
import { ModRegistry } from "../../../core/mod-system/ModRegistry";

// ── Helpers ──────────────────────────────────────────────────────────────

function resetRegistry(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
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

  it("does NOT register a console or workspace (both removed)", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    // No consoles or workspaces — only hubs, routes, library items,
    // and settings sections remain.
    const hubs = registry.getHubs();
    expect(hubs.has("eln")).toBe(false);
  });

  it("registers routes for /eln/new and /eln/:id", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const routes = registry.getRoutes();
    const newEntryRoute = routes.get("eln.new-entry");
    const detailRoute = routes.get("eln.entry-page");

    expect(newEntryRoute).toBeDefined();
    expect(newEntryRoute!.modId).toBe("eln");
    expect(newEntryRoute!.component).toBeTruthy();

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
});
