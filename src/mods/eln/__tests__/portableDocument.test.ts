// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import {
  portableAttributeNodeTypes,
  preparePortableDocument,
  restorePortableDocument,
} from "../portableDocument";
import { PortableNodeAttributes } from "../editor/portableBlockExtensions";
import { elnExtensions } from "../editor/extensions/elnExtensions";

describe("ELN portable document bridge", () => {
  it("preserves unknown nested Blocks and their exact bindings when editing a sibling", () => {
    const saved = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "known sibling" }] },
        {
          type: "lab.future-widget",
          attrs: {
            id: "block-17",
            bindings: { contract: { kind: "data", id: "lab.measurement", version: "2.1.0" } },
          },
          content: [{ type: "lab.future-child", attrs: { opaque: [1, { keep: true }] } }],
        },
      ],
    };

    const editable = preparePortableDocument(saved, new Set());
    expect(editable.content[1]).toMatchObject({ type: "elnPortableBlock" });

    const edited = structuredClone(editable);
    edited.content[0].content[0].text = "edited sibling";
    expect(restorePortableDocument(edited)).toEqual({
      ...saved,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "edited sibling" }] },
        saved.content[1],
      ],
    });
  });

  it("keeps registered Blocks as editable nodes", () => {
    const saved = { type: "doc", content: [{ type: "lab.registry-table", attrs: { content: "{}" } }] };
    const prepared = preparePortableDocument(saved, new Set(["lab.registry-table"]));
    expect(prepared.content[0].type).toBe("lab.registry-table");
    expect(restorePortableDocument(prepared)).toEqual(saved);
  });

  it("retains unavailable inline nodes and marks around editable text", () => {
    const saved = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text: "retained", marks: [
          { type: "lab.calibrated", attrs: { unit: "mL", confidence: 0.98 } },
        ] }, { type: "lab.inline-result", attrs: { result: { value: 7 } } }],
      }],
    };
    const prepared = preparePortableDocument(saved, new Set());
    expect(prepared.content[0].content[0].marks?.[0].type).toBe("elnPortableMark");
    expect(prepared.content[0].content[1].type).toBe("elnPortableInline");
    expect(restorePortableDocument(prepared)).toEqual(saved);
  });

  it("round trips through the real TipTap schema while a supported paragraph is edited", () => {
    const saved = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "before" }] },
        { type: "lab.removed-block", attrs: { binding: { version: "1" } }, content: [
          { type: "lab.removed-child", attrs: { value: [1, 2] } },
        ] },
      ],
    };
    const known = new Set<string>();
    const editor = new Editor({
      extensions: [
        StarterKit,
        ...elnExtensions,
        PortableNodeAttributes.configure({ types: portableAttributeNodeTypes(known) }),
      ],
      content: preparePortableDocument(saved, known),
    });
    editor.commands.setTextSelection(7);
    editor.commands.insertContent(" edited");
    const roundTrip = restorePortableDocument(editor.getJSON() as Record<string, unknown>);
    expect(roundTrip).toEqual({
      ...saved,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "before edited" }] },
        saved.content[1],
        { type: "paragraph" },
      ],
    });
    editor.destroy();
  });
});
