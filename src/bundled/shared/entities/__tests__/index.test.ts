import { beforeAll, describe, expect, it } from "vitest";
import { ModRegistry } from "../../../../shell/src/mod-system/ModRegistry";

describe("entities mod registration", () => {
  beforeAll(async () => {
    await import("../index");
    const registry = ModRegistry.getInstance();
    try {
      registry.registerMod("entities");
    } catch {
      // The mod may already be registered by the loader test harness.
    }
  });

  it("owns the Entities hub and its /entities route", () => {
    const registry = ModRegistry.getInstance();
    const hub = registry.getHubs().get("entities.entities");

    expect(hub).toBeDefined();
    expect(hub?.route).toBe("/entities");
    expect(registry.getRoutes().has("lims.entities")).toBe(false);
  });
});
