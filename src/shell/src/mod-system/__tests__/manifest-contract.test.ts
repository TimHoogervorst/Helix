import { describe, expect, it } from "vitest";
import fixtures from "../../../../helix_core/mod_system/manifest_fixtures.json";
import { parseJsonManifest } from "../ModLoader";

describe("External Mod manifest 1.0.0 contract", () => {
  it("accepts the shared valid fixture", () => {
    expect(parseJsonManifest(fixtures.valid[0], "fixture").id).toBe("acme.sample-mod");
  });

  it("rejects every shared invalid fixture", () => {
    for (const manifest of fixtures.invalid) {
      expect(() => parseJsonManifest(manifest, "fixture")).toThrow();
    }
  });
});
