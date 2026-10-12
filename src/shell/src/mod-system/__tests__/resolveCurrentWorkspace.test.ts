import { beforeEach, describe, expect, it } from "vitest";
import { ModRegistry } from "../ModRegistry";
import { resolveCurrentWorkspace } from "../resolveCurrentWorkspace";

describe("resolveCurrentWorkspace", () => {
  beforeEach(() => ModRegistry._reset());

  it("resolves canonical workspace URLs by typed vendor/mod identity", () => {
    const registry = ModRegistry.getInstance();
    registry.hydrateFromBackend(
      {
        samples: {
          workspaceId: "samples",
          vendor: "acme",
          mod: "samples",
          workspace: "detail",
          schemaTypes: [],
          actions: [],
        },
      },
      new Map(),
    );

    expect(resolveCurrentWorkspace("/w/acme/samples/detail/SAMPLE1?tab=activity")).toMatchObject({
      displayId: "SAMPLE1",
      reference: { id: "acme.samples:detail" },
      url: "/w/acme/samples/detail/SAMPLE1?tab=activity",
    });
  });

  it("still resolves legacy first-party workspace paths for redirect handling", () => {
    const registry = ModRegistry.getInstance();
    registry.hydrateFromBackend(
      {
        eln: { workspaceId: "eln", schemaTypes: [], actions: [] },
      },
      new Map(),
    );

    expect(resolveCurrentWorkspace("/eln/E1")?.reference.id).toBe("helix.eln:eln");
  });
});
