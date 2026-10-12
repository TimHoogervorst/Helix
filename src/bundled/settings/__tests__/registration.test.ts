import { beforeAll, describe, expect, it } from "vitest";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";

describe("settings mod registration", () => {
  beforeAll(async () => {
    await import("../index");
    const registry = ModRegistry.getInstance();
    try {
      registry.registerMod("settings");
    } catch {
      // The mod may already be registered by the loader test harness.
    }
  });

  it("owns the developer tools section under the settings namespace", () => {
    const sections = ModRegistry.getInstance().getSettingsSections();

    expect(sections.find((section) => section.id === "settings.dev-tools")).toBeDefined();
    expect(sections.find((section) => section.id.startsWith("core."))).toBeUndefined();
  });
});
