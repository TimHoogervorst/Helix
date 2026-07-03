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
    expect(mod.meta.dependsOn).toEqual(["lims"]);
  });

  it("registers a console with id 'eln' at route /eln", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const consoles = registry.getConsoles();
    const elnConsole = consoles.get("eln");

    expect(elnConsole).toBeDefined();
    expect(elnConsole!.route).toBe("/eln");
    expect(elnConsole!.accepts).toEqual({ only: ["eln.entry"] });
    expect(elnConsole!.component).toBeTruthy();
  });

  it("registers a workspace with id 'eln.entry'", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const workspaces = registry.getWorkspaces();
    const ws = workspaces.get("eln.entry");

    expect(ws).toBeDefined();
    expect(ws!.consoleIds).toContain("eln");
    expect(ws!.consoleIds).toContain("library");
    expect(ws!.workspace).toBeTruthy();
    expect(ws!.detailCard).toBeDefined();
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

  it("registers a settings section for tags", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const sections = registry.getSettingsSections();
    const tagSection = sections.find((s) => s.id === "eln.tags");

    expect(tagSection).toBeDefined();
    expect(tagSection!.modId).toBe("eln");
    expect(tagSection!.label).toBe("Tags");
    expect(tagSection!.component).toBeTruthy();
  });

  it("throws validation error referencing unregistered library console", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    // The ELN workspace references console 'library' which isn't registered
    // in this isolated test — this is expected behaviour.
    expect(() => registry.validate()).toThrow(
      /references console 'library' which is not registered/,
    );
  });
});
