import { describe, expect, it } from "vitest";
import fixtures from "../../../../helix_core/mod_system/manifest_fixtures.json";
import { parseJsonManifest } from "../ModLoader";

describe("External Mod manifest 1.0.0 contract", () => {
  it("accepts and preserves every shared valid fixture", () => {
    for (const manifest of fixtures.valid) {
      expect(parseJsonManifest(manifest, "fixture")).toMatchObject(manifest);
    }
  });

  it("rejects every shared invalid fixture", () => {
    for (const manifest of fixtures.invalid) {
      expect(() => parseJsonManifest(manifest, "fixture")).toThrow();
    }
  });
});
