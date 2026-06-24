/**
 * TipTap ``reference`` inline node — an atomic badge that links to another entry.
 *
 * Schema: { type: "reference", attrs: { displayId: "E1" } }
 *
 * The node is atom-level (cursor cannot enter it, Backspace deletes the whole badge).
 * An input rule auto-converts ``#E1 `` (display ID + space) into a reference node.
 */
import { Node } from "@tiptap/core";
import { InputRule } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ReferenceNode from "../components/ReferenceNode";

const Reference = Node.create({
  name: "reference",

  group: "inline",

  inline: true,

  atom: true, // cursor cannot enter; Backspace deletes the entire node

  addAttributes() {
    return {
      displayId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-display-id") || "",
        renderHTML: (attributes) => ({
          "data-display-id": attributes.displayId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-display-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", { "data-display-id": HTMLAttributes["data-display-id"] }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ReferenceNode);
  },

  addInputRules() {
    return [
      new InputRule({
        // Matches #E1 followed by a space — captures the display ID.
        find: /#([A-Z]\d+) $/,
        handler: ({ state, range, match }) => {
          const displayId = match[1];
          const { tr } = state;

          // Replace the matched text (#E1 + space) with a reference node
          // followed by a space so the user can continue typing.
          tr.replaceRangeWith(
            range.from,
            range.to,
            state.schema.nodes.reference.create({ displayId })
          );
          // Insert a space after the node so typing continues naturally
          tr.insertText(" ", range.from + 1);
        },
      }),
    ];
  },
});

export default Reference;
