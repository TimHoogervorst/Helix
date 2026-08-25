import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin } from "prosemirror-state";

function appendParagraph(editor: Editor) {
  const { state } = editor;
  if (state.doc.lastChild?.type.name === "paragraph") return;

  editor.view.dispatch(state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create()));
}

/** Keeps the ELN body valid after loading and after any document change. */
const TrailingParagraph = Extension.create({
  name: "trailingParagraph",

  onBeforeCreate() {
    const content = this.editor.options.content;
    if (
      typeof content !== "object" ||
      content === null ||
      Array.isArray(content) ||
      (content as { type?: string }).type !== "doc"
    ) {
      return;
    }

    const documentContent = (content as { content?: Array<{ type?: string }> }).content ?? [];
    if (documentContent.at(-1)?.type === "paragraph") return;

    this.editor.options.content = {
      ...(content as Record<string, unknown>),
      content: [...documentContent, { type: "paragraph" }],
    };
  },

  onCreate() {
    appendParagraph(this.editor);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          if (newState.doc.lastChild?.type.name === "paragraph") return null;

          return newState.tr.insert(
            newState.doc.content.size,
            newState.schema.nodes.paragraph.create(),
          );
        },
      }),
    ];
  },
});

export default TrailingParagraph;
