import { describe, expect, it } from "vitest";
import { assertFreshCatalog, parseCatalog, type ModCatalog } from "../catalog";

const catalog: ModCatalog = {
  catalogVersion: 1,
  installationFingerprint: "installed-at-build",
  mods: [],
};

describe("Mod Catalog fingerprint", () => {
  it("accepts the installed catalog fingerprint", () => {
    expect(() => assertFreshCatalog(catalog, "installed-at-build")).not.toThrow();
  });

  it("rejects a stale installation", () => {
    expect(() => assertFreshCatalog(catalog, "different-installation")).toThrow(
      "stale",
    );
  });

  it("rejects malformed catalog data before boot", () => {
    expect(() => parseCatalog({ mods: [] }, "installed-at-build")).toThrow(
      "Unsupported",
    );
  });
});
