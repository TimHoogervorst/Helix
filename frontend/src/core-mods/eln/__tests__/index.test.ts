import { describe, it, expect, beforeEach } from "vitest";
import { ModRegistry, BLOCK_TYPE_TIPTAP_NODE } from "../../../core/mod-system";

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

  it("registers the table block with correct metadata", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const blocks = registry.getBlocks();
    const tableBlock = blocks.get("eln.table");

    expect(tableBlock).toBeDefined();
    expect(tableBlock!.label).toBe("Table");
    expect(tableBlock!.description).toBe("Insert a schema-backed LIMS table");
    expect(tableBlock!.icon).toBe("📊");
    expect(tableBlock!.type).toBe(BLOCK_TYPE_TIPTAP_NODE);
    expect(tableBlock!.payload).toBeDefined();

    const payload = tableBlock!.payload as Record<string, unknown>;
    expect(payload.node).toBeDefined();
    expect(payload.defaultAttrs).toBeDefined();

    const defaultAttrs = payload.defaultAttrs as Record<string, unknown>;
    expect(defaultAttrs.title).toBe("Table");
    expect(defaultAttrs.schemaId).toBeNull();
    expect((defaultAttrs.columns as unknown[])).toHaveLength(2);
    expect((defaultAttrs.rows as unknown[])).toHaveLength(2);
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
