import { describe, expect, it } from "vitest";
import { ModRegistry } from "../ModRegistry";

describe("public mod entrypoints", () => {
  it("imports the public facade without creating or mutating a registry", async () => {
    ModRegistry._reset();
    await import("@helix/mod-api");
    expect(ModRegistry.getInstance().getBlocks().size).toBe(0);
  });

  it("can consume the compiled ESM artifact", async () => {
    const api = await import("../../../../mod-api/dist/index.js");
    expect(api.entityReference("E1", 3)).toEqual({
      type: "entity-reference",
      displayId: "E1",
      schemaId: 3,
    });
  });
});
