/**
 * TipTap ``elnComment`` block node — a threaded comment card.
 *
 * Schema (stored in ``attrs`` as JSON):
 *   { resolved: boolean, thread: CommentEntry[] }
 *
 *   CommentEntry = {
 *     id: string;
 *     authorId: number;
 *     authorName: string;
 *     authorInitials: string;
 *     authorColor: string;
 *     text: string;
 *     createdAt: string; // ISO 8601
 *   }
 *
 * This is a void node — no TipTap children.  All rendering is done by the
 * React NodeView (CommentNodeView).
 */
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import CommentNodeView from "./CommentNodeView";

const CommentBlock = Node.create({
  name: "elnComment",

  group: "block",

  // Void node — no TipTap-editable children.  Editing is handled inside the NodeView.
  atom: true,
  isolating: true,
  selectable: false,

  addAttributes() {
    return {
      resolved: {
        default: false,
        parseHTML: (element) => {
          const v = element.getAttribute("data-resolved");
          return v === "true";
        },
        renderHTML: (attributes) => ({
          "data-resolved": String(attributes.resolved),
        }),
      },
      thread: {
        default: [],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-thread");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          "data-thread": JSON.stringify(attributes.thread),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='eln-comment']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "eln-comment",
        ...HTMLAttributes,
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CommentNodeView);
  },
});

export default CommentBlock;
