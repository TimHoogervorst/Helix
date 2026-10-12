import { beforeEach, describe, expect, it } from "vitest";
import { Mod } from "../Mod";
import { ModRegistry } from "../ModRegistry";
import type { ModManifest } from "../types";
import {
  ActionReference,
  externalRoutePath,
  legacyWorkspaceUrl,
  ModelReference,
  ObjectReference,
  ServiceReference,
  SlotReference,
  WorkspaceReference,
  workspaceUrl,
} from "../references";

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

  it("uses canonical ownership IDs for public registrations", () => {
    const mod = new Mod(manifest("acme.samples"));
    const button = mod.registerButton("export", { label: "Export", onClick: () => {} });

    expect(button.globalId).toBe("acme.samples:export");
    expect(ModRegistry.getInstance().getButtons().has("acme.samples:export")).toBe(true);
  });

  it("keeps typed reference namespaces distinct", () => {
    const model = new ModelReference("acme.samples", "sample");
    expect(new ObjectReference(model, "42").objectReferenceId).toBe("acme.samples:sample:42");
    expect(new WorkspaceReference("acme.samples", "detail").id).toBe("acme.samples:detail");
    expect(new SlotReference("acme.samples", "toolbar").id).toBe("acme.samples:toolbar");
    expect(new ServiceReference("acme.samples", "lookup").id).toBe("acme.samples:lookup");
    expect(new ActionReference("acme.samples", "updated").id).toBe("acme.samples:updated");
  });

  it("derives collision-safe canonical workspace URLs", () => {
    const workspace = new WorkspaceReference("acme.samples", "detail");

    expect(workspaceUrl(workspace, "SAMPLE1")).toBe(
      "/w/acme/samples/detail/SAMPLE1",
    );
    expect(workspace.urlFor("SAMPLE1")).toBe("/w/acme/samples/detail/SAMPLE1");
    expect(legacyWorkspaceUrl(workspace, "SAMPLE1")).toBe("/detail/SAMPLE1");
  });

  it("namespaces external standalone routes by vendor and mod", () => {
    expect(externalRoutePath("acme.samples", "/reports/:id")).toBe(
      "/mods/acme/samples/reports/:id",
    );
  });
});
