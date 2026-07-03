import { describe, it, expect, beforeEach } from "vitest";
import { ModRegistry } from "../../../core/mod-system/ModRegistry";

// ── Helpers ──────────────────────────────────────────────────────────────

function resetRegistry(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("pins mod registration", () => {
  beforeEach(() => {
    resetRegistry();
  });

  it("registers a sidebar action with workspaceId '*' and inline position", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    const actions = registry.getSidebarActions();
    const action = actions.get("pins.sidebar");

    expect(action).toBeDefined();
    expect(action!.workspaceId).toBe("*");
    expect(action!.position).toBe("inline");
    expect(typeof action!.component).toBe("function");
  });

  it("has correct meta", async () => {
    const mod = await import("../index");

    expect(mod.meta.id).toBe("pins");
    expect(mod.meta.displayName).toBe("Pinned Workspaces");
    expect(mod.meta.dependsOn).toEqual([]);
  });

  it("passes registry validation after registration", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod(mod.meta.id);
    mod.register();

    // Wildcard sidebar actions should validate without registered workspaces
    expect(() => registry.validate()).not.toThrow();
  });
});
