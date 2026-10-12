import { describe, it, expect, beforeEach } from "vitest";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";

// ── Helpers ──────────────────────────────────────────────────────────────

function resetRegistry(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ModRegistry as any).instance = null;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("tabs mod registration", () => {
  beforeEach(() => {
    resetRegistry();
  });

  it("registers without side effects (no-op registration)", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod("tabs");

    // Should not throw — registration is a no-op
    expect(() => mod.register()).not.toThrow();
  });

  it("does not export inline meta", async () => {
    const mod = await import("../index");
    expect((mod as Record<string, unknown>).meta).toBeUndefined();
  });

  it("passes registry validation after registration", async () => {
    const mod = await import("../index");

    const registry = ModRegistry.getInstance();
    registry.registerMod("tabs");
    mod.register();

    // No-op registration should validate without issues
    expect(() => registry.validate()).not.toThrow();
  });
});
