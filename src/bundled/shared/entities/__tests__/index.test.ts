import { beforeAll, describe, expect, it } from "vitest";
import { ModRegistry } from "../../../../shell/src/mod-system/ModRegistry";
import { Mod } from "../../../../shell/src/mod-system/Mod";
import manifest from "../modManifest.json";
import { register } from "../index";

describe("entities mod registration", () => {
  beforeAll(async () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod(manifest.id);
    register(new Mod(manifest));
  });

  it("owns the Entities hub and its /entities route", () => {
    const registry = ModRegistry.getInstance();
    const hub = registry.getHubs().get("helix.entities:entities");

    expect(hub).toBeDefined();
    expect(hub?.route).toBe("/entities");
    expect(registry.getRoutes().has("helix.lims:entities")).toBe(false);
  });
});
