import { describe, expect, it } from "vitest";
import { decodeBlockContent, getTypedPath } from "../workspace/portableInput";
import { resolvePortableActionContext } from "../../../mod-api/src/portableBlocks";
import contract from "../../../bundled/lims/contracts/register-rows.json";

describe("registry table action inputs", () => {
  it("decodes serialized table attributes without altering the saved document", () => {
    const attrs = { id: "table-1", rows: [{ __name: "Sample" }], actionSequence: { steps: [] } };
    const document = { type: "doc", content: [{ type: "helix.lims:registry-table", attrs: { content: JSON.stringify(attrs) } }] };
    expect(decodeBlockContent(document)).toEqual({ type: "doc", content: [{ type: "helix.lims:registry-table", attrs }] });
    expect(typeof document.content[0].attrs.content).toBe("string");
    const malformed = { attrs: { content: "invalid JSON" } };
    expect(decodeBlockContent(malformed)).toEqual(malformed);
  });
  it("resolves saved row arrays against the registration contract", () => {
    const rows = [{ displayId: "row-1", __name: "Sample", values: {} }];
    const context = resolvePortableActionContext({
      id: "table-1",
      actionSequence: { fingerprint: "sequence", steps: [{
        id: "register", action: { kind: "action", id: contract.id, version: contract.version },
        inputs: { rows: { kind: "block", blockId: "table-1", path: ["rows"] } },
        parameters: {
          schemaId: { type: { type: "number" }, value: 1 },
          fieldMapping: { type: { type: "json" }, value: {} },
          blockId: { type: { type: "string" }, value: "table-1" },
        }, targets: { record: "record" },
      }] },
    }, "register", { [`action:${contract.id}@${contract.version}`]: contract.definition },
    { available: true }, { block: (source) => getTypedPath({ rows }, source.path) });
    expect(context.available, context.reason).toBe(true);
    expect(context.inputs.rows.value).toEqual(rows);
  });

  it("preserves typed values and rejects absent paths", () => {
    const typed = { type: { type: "number" }, value: 2 };
    expect(getTypedPath({ typed }, ["typed"])).toEqual(typed);
    expect(getTypedPath({ rows: [] }, ["rows"])).toEqual({ type: { type: "json" }, value: [] });
    expect(getTypedPath({}, ["rows"])).toBeUndefined();
  });
});
