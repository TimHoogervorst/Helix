import { beforeAll, describe, expect, it } from "vitest";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { Mod } from "../../../shell/src/mod-system/Mod";
import manifest from "../modManifest.json";
import { register } from "../index";

describe("settings mod registration", () => {
  beforeAll(async () => {
    const registry = ModRegistry.getInstance();
    registry.registerMod(manifest.id);
    register(new Mod(manifest));
  });

  it("owns the developer tools section under the settings namespace", () => {
    const sections = ModRegistry.getInstance().getSettingsSections();

    expect(sections.find((section) => section.id === "helix.settings:dev-tools")).toBeDefined();
    expect(sections.find((section) => section.id.startsWith("core."))).toBeUndefined();
  });
});
