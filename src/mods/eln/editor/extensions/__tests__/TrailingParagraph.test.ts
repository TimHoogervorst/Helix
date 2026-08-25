import { describe, expect, it } from "vitest";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TrailingParagraph from "../TrailingParagraph";

const block = Node.create({
  name: "testBlock",
  group: "block",
  atom: true,
  parseHTML: () => [{ tag: "test-block" }],
  renderHTML: () => ["test-block"],
});

function createEditor(content: Record<string, unknown>) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [StarterKit, block, TrailingParagraph],
    content,
  });
}

describe("TrailingParagraph", () => {
  it("appends an empty paragraph when loaded content ends in a block", () => {
    const editor = createEditor({
      type: "doc",
      content: [{ type: "testBlock" }],
    });

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [{ type: "testBlock" }, { type: "paragraph" }],
    });
    editor.destroy();
  });

  it("restores the trailing paragraph after a document change", () => {
    const editor = createEditor({
      type: "doc",
      content: [{ type: "paragraph" }],
    });

    editor.commands.insertContent({ type: "testBlock" });

    expect(editor.state.doc.lastChild?.type.name).toBe("paragraph");
    expect(editor.getJSON().content).toHaveLength(2);
    editor.destroy();
  });
});
