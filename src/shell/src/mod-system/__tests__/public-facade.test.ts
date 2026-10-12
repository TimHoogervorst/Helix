import { beforeEach, describe, expect, it } from "vitest";
import { Mod } from "../Mod";
import { ModRegistry } from "../ModRegistry";
import type { ModManifest } from "../types";

const manifest = (id: string): ModManifest => ({
  id,
  displayName: id,
  version: "0.1.0",
  requiresHelix: ">=1.0.0",
  artifacts: ["frontend"],
  dependsOn: [],
});

describe("frontend public mod facade", () => {
  beforeEach(() => ModRegistry._reset());

  it("derives and stamps owner provenance for every public registration", () => {
    const mod = new Mod(manifest("acme.samples"));
    mod.registerButton("export", { label: "Export", onClick: () => {} });

    expect(ModRegistry.getInstance().getButtons().get("samples.export")).toMatchObject({
      provider: "acme.samples",
    });
  });

  it("rejects binding handles owned by another mod", () => {
    const owner = new Mod(manifest("acme.samples"));
    const other = new Mod(manifest("other.samples"));
    const slot = owner.declareSlot("toolbar", {
      accepts: "button",
      renderer: () => null,
      layout: "horizontal",
      order: 0,
      defaults: {},
    });
    const button = other.registerButton("export", {
      label: "Export",
      onClick: () => {},
    });

    expect(() => owner.registerIntoSlot(slot, button)).toThrow(
      "cannot register a handle owned by another mod",
    );
  });
});
