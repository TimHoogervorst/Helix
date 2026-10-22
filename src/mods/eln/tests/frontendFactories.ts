import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

/** Minimal DOM-backed editor used by ELN-owned extension integration tests. */
export function createTestEditor(
  extensions: unknown[] = [],
  content?: string | Record<string, unknown>,
): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [StarterKit, ...extensions] as never[],
    content: content ?? { type: "doc", content: [{ type: "paragraph" }] },
  });
}
