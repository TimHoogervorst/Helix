/**
 * TipTap ``elnProtocol`` block node — a reusable protocol card.
 *
 * Schema (stored in ``attrs`` as JSON):
 *   { protocolId: number | null, name: string, items: ProtocolItem[],
 *     stepStates: Record<number, { completed: boolean, completedAt?: string }>,
 *     editable: boolean }
 *
 *   ProtocolItem = { type: "step" | "note", text: string }
 *
 * This is a void node — no TipTap children.  All rendering is done by the
 * React NodeView (ProtocolBlockNode).
 */
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ProtocolBlockNode from "./ProtocolBlockNode";

const ProtocolBlock = Node.create({
  name: "elnProtocol",

  group: "block",

  // Void node — no TipTap-editable children.  The NodeView manages
  // check-off state and protocol selection.
  atom: true,
  isolating: true,
  selectable: false,

  addAttributes() {
    return {
      protocolId: {
        default: null,
        parseHTML: (element) => {
          const v = element.getAttribute("data-protocol-id");
          if (v === null || v === "") return null;
          const parsed = parseInt(v, 10);
          return isNaN(parsed) ? null : parsed;
        },
        renderHTML: (attributes) => ({
          "data-protocol-id": attributes.protocolId ?? "",
        }),
      },
      name: {
        default: "Protocol",
        parseHTML: (element) =>
          element.getAttribute("data-name") || "Protocol",
        renderHTML: (attributes) => ({
          "data-name": attributes.name,
        }),
      },
      items: {
        default: [],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-items");
          if (!raw) return [];
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({
          "data-items": JSON.stringify(attributes.items),
        }),
      },
      stepStates: {
        default: {},
        parseHTML: (element) => {
          const raw = element.getAttribute("data-step-states");
          if (!raw) return {};
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        },
        renderHTML: (attributes) => ({
          "data-step-states": JSON.stringify(attributes.stepStates),
        }),
      },
      editable: {
        default: false,
        parseHTML: (element) => {
          const v = element.getAttribute("data-editable");
          return v === "true";
        },
        renderHTML: (attributes) => ({
          "data-editable": String(attributes.editable),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='eln-protocol']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "eln-protocol",
        ...HTMLAttributes,
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ProtocolBlockNode);
  },
});

export default ProtocolBlock;
