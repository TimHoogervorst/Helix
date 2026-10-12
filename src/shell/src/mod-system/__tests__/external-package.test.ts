import { describe, expect, it } from "vitest";
import { externalJsonManifestModules, externalModLoaders } from "../external";

describe("external package discovery", () => {
  it("discovers frontend artifacts from package manifests rather than a named Mod", () => {
    expect(Object.keys(externalModLoaders).length).toBeGreaterThan(0);
    expect(Object.keys(externalJsonManifestModules).length).toBeGreaterThan(0);
    expect(Object.keys(externalModLoaders).some((path) => path.includes("eln"))).toBe(true);
  });
});
