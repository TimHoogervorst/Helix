import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { Node } from "@tiptap/core";
import type { BlockBinding } from "../../mod-system/types";
import {
  deleteTopLevelBlock,
  deleteTopLevelBlocks,
  duplicateTopLevelBlock,
  duplicateTopLevelBlocks,
  moveTopLevelBlock,
  moveTopLevelBlocks,
} from "../TipTapRenderer/moveTopLevelBlock";

function createEditor(content: Record<string, unknown>[] = [
  { type: "paragraph", content: [{ type: "text", text: "one" }] },
  { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "two" }] },
  { type: "paragraph", content: [{ type: "text", text: "three" }] },
  { type: "paragraph" },
], extensions: Extensions = [StarterKit]) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions,
    content: { type: "doc", content },
  });
}

describe("moveTopLevelBlock", () => {
  it.each([
    [0, 2, ["two", "one", "three", undefined]],
    [2, 0, ["three", "one", "two", undefined]],
  ])("moves root child %i to gap %i", (sourceIndex, targetIndex, expected) => {
    const editor = createEditor();
    expect(moveTopLevelBlock(editor, sourceIndex, targetIndex)).toBe(true);
    expect(editor.state.doc.content.content.map((node) => node.textContent || undefined)).toEqual(expected);
    editor.destroy();
  });

  it("does not dispatch for the source block's own gaps", () => {
    const editor = createEditor();
    let updates = 0;
    editor.on("update", () => updates += 1);
    expect(moveTopLevelBlock(editor, 1, 1)).toBe(false);
    expect(moveTopLevelBlock(editor, 1, 2)).toBe(false);
    expect(updates).toBe(0);
    editor.destroy();
  });

  it("dispatches one transaction for each neighbor move", () => {
    const editor = createEditor();
    let updates = 0;
    editor.on("update", () => updates += 1);

    expect(moveTopLevelBlock(editor, 1, 0)).toBe(true);
    expect(moveTopLevelBlock(editor, 1, 3)).toBe(true);
    expect(updates).toBe(2);
    editor.destroy();
  });

  it("moves a complete node without changing its content", () => {
    const editor = createEditor();
    const original = editor.getJSON().content?.[1];
    moveTopLevelBlock(editor, 1, 3);
    expect(editor.getJSON().content?.[2]).toEqual(original);
    editor.destroy();
  });

  it("moves nested lists and tables as whole root nodes", () => {
    const editor = createEditor([
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }] }],
      },
      { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "cell" }] }] }] }] },
      { type: "paragraph" },
    ], [StarterKit, TableKit]);

    moveTopLevelBlock(editor, 0, 2);

    expect(editor.state.doc.child(1).type.name).toBe("bulletList");
    expect(editor.state.doc.child(1).firstChild?.firstChild?.textContent).toBe("item");
    expect(editor.state.doc.child(0).type.name).toBe("table");
    editor.destroy();
  });

  it("deletes one complete root node in one transaction", () => {
    const editor = createEditor();
    let updates = 0;
    editor.on("update", () => updates += 1);

    expect(deleteTopLevelBlock(editor, 1)).toBe(true);
    expect(editor.state.doc.content.content.map((node) => node.textContent || undefined)).toEqual([
      "one",
      "three",
      undefined,
    ]);
    expect(updates).toBe(1);
    editor.destroy();
  });

  it("moves non-adjacent root children as one ordered transaction", () => {
    const editor = createEditor();
    let updates = 0;
    editor.on("update", () => updates += 1);

    expect(moveTopLevelBlocks(editor, [0, 2], 4)).toBe(true);
    expect(editor.state.doc.content.content.map((node) => node.textContent || undefined)).toEqual([
      "two", undefined, "one", "three",
    ]);
    expect(updates).toBe(1);
    editor.destroy();
  });

  it("deletes selected root children in one transaction", () => {
    const editor = createEditor();
    let updates = 0;
    editor.on("update", () => updates += 1);

    expect(deleteTopLevelBlocks(editor, [0, 2])).toBe(true);
    expect(editor.state.doc.content.content.map((node) => node.textContent || undefined)).toEqual(["two", undefined]);
    expect(updates).toBe(1);
    editor.destroy();
  });

  it("duplicates the complete serialized root node directly after the original", () => {
    const editor = createEditor();
    const original = editor.getJSON().content?.[1];
    let updates = 0;
    editor.on("update", () => updates += 1);

    expect(duplicateTopLevelBlock(editor, 1)).toBe(true);
    expect(editor.getJSON().content?.[1]).toEqual(original);
    expect(editor.getJSON().content?.[2]).toEqual(original);
    expect(updates).toBe(1);
    editor.destroy();
  });

  it("duplicates a policy-aware block from defaults with only preserved fields", () => {
    const policyBlock = Node.create({
      name: "policyBlock",
      group: "block",
      atom: true,
      addAttributes: () => ({ content: { default: "{}" } }),
      parseHTML: () => [{ tag: "div[data-policy-block]" }],
      renderHTML: ({ HTMLAttributes }) => ["div", { "data-policy-block": "true", ...HTMLAttributes }],
    });
    const editor = createEditor([
      {
        type: "policyBlock",
        attrs: {
          content: JSON.stringify({
            schemaId: 7,
            schemaName: "Old schema",
            rows: [{ entityId: 12, displayId: "SAMPLE1" }],
          }),
        },
      },
      { type: "paragraph" },
    ], [StarterKit, policyBlock]);
    const binding = {
      id: "policyBlock",
      label: "Policy block",
      component: () => null,
      icon: () => null,
      listensTo: [],
      onEvent: {},
      serialize: (state: Record<string, unknown>) => JSON.stringify(state),
      deserialize: (json: string) => JSON.parse(json) as Record<string, unknown>,
      defaultState: { schemaId: null, schemaName: "Fresh schema", rows: [] },
      preserve: ["schemaId"],
      overrides: {},
      order: 0,
      type: "block",
    } satisfies BlockBinding;

    expect(duplicateTopLevelBlock(editor, 0, binding)).toBe(true);
    expect(JSON.parse(editor.state.doc.child(1).attrs.content)).toEqual({
      schemaId: 7,
      schemaName: "Fresh schema",
      rows: [],
    });
    editor.destroy();
  });

  it("duplicates selected blocks in document order in one transaction", () => {
    const editor = createEditor();
    let updates = 0;
    editor.on("update", () => updates += 1);

    expect(duplicateTopLevelBlocks(editor, [0, 2], () => undefined)).toBe(true);
    expect(editor.state.doc.content.content.map((node) => node.textContent || undefined)).toEqual([
      "one", "one", "two", "three", "three", undefined,
    ]);
    expect(updates).toBe(1);
    editor.destroy();
  });
});
