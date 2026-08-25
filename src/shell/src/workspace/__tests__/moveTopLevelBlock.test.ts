import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import { moveTopLevelBlock } from "../TipTapRenderer/moveTopLevelBlock";

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
});
