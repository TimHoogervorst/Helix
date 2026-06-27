/**
 * TipTap ``limsTable`` block node — a Notion-style table backed by AG Grid.
 *
 * Schema (stored in ``attrs`` as JSON):
 *   { schemaId, title, columns: GridColumn[], rows: GridRow[] }
 *
 * This is a void node — no TipTap children.  All rendering is done by the
 * React NodeView (LimsTableNode) which embeds an AG Grid instance.
 */
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import LimsTableNode from "./LimsTableNode";

const LimsTable = Node.create({
  name: "limsTable",

  group: "block",

  // Void node — no TipTap-editable children.  AG Grid handles all editing.
  atom: true,
  isolating: true,
  selectable: false,

  addAttributes() {
    return {
      schemaId: {
        default: null,
        parseHTML: (element) => {
          const v = element.getAttribute("data-schema-id");
          if (v === null || v === "") return null;
          const parsed = parseInt(v, 10);
          return isNaN(parsed) ? null : parsed;
        },
        renderHTML: (attributes) => ({
          "data-schema-id": attributes.schemaId ?? "",
        }),
      },
      schemaName: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-schema-name") || null,
        renderHTML: (attributes) => ({
          "data-schema-name": attributes.schemaName ?? "",
        }),
      },
      title: {
        default: "Table",
        parseHTML: (element) =>
          element.getAttribute("data-title") || "Table",
        renderHTML: (attributes) => ({
          "data-title": attributes.title,
        }),
      },
      columns: {
        default: [],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-columns");
          if (!raw) return [];
          try { return JSON.parse(raw); } catch { return []; }
        },
        renderHTML: (attributes) => ({
          "data-columns": JSON.stringify(attributes.columns),
        }),
      },
      rows: {
        default: [],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-rows");
          if (!raw) return [];
          try { return JSON.parse(raw); } catch { return []; }
        },
        renderHTML: (attributes) => ({
          "data-rows": JSON.stringify(attributes.rows),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='lims-table']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "lims-table",
        ...HTMLAttributes,
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LimsTableNode);
  },
});

export default LimsTable;
