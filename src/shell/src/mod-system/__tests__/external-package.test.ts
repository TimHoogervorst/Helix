import { describe, expect, it } from "vitest";
import { externalJsonManifestModules, externalModLoaders } from "../external";

describe("external package discovery", () => {
  it("discovers ELN through its workspace package contract", async () => {
    expect(Object.keys(externalModLoaders)).toEqual(["@helix/eln"]);
    expect(typeof (await externalModLoaders["@helix/eln"]()).register).toBe("function");
    expect(externalJsonManifestModules["@helix/eln/manifest"].default).toMatchObject({
      id: "helix.eln",
      artifacts: ["frontend", "backend"],
    });
  });
});
