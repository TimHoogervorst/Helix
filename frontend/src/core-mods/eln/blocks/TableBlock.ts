/**
 * TipTap ``elnTable`` block node — a simple editable data table.
 *
 * Schema (stored in ``attrs`` as JSON):
 *   {
 *     title: string;
 *     columns: Array<{ id: string; name: string }>;
 *     rows: Array<{ id: string; cells: Record<string, string> }>;
 *   }
 *
 * This is a void node — no TipTap children.  All rendering and editing
 * is handled by the React NodeView (TableNodeView).
 */
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import TableNodeView from "./TableNodeView";

const TableBlock = Node.create({
  name: "elnTable",

  group: "block",

  // Void node — no TipTap-editable children.  Editing is handled inside the NodeView.
  atom: true,
  isolating: true,
  selectable: false,

  addAttributes() {
    return {
      title: {
        default: "Table",
        parseHTML: (element) => {
          const v = element.getAttribute("data-title");
          return v ?? "Table";
        },
        renderHTML: (attributes) => ({
          "data-title": attributes.title,
        }),
      },
      columns: {
        default: [
          { id: "col-1", name: "Column 1" },
          { id: "col-2", name: "Column 2" },
        ],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-columns");
          if (!raw) return [{ id: "col-1", name: "Column 1" }, { id: "col-2", name: "Column 2" }];
          try {
            return JSON.parse(raw);
          } catch {
            return [{ id: "col-1", name: "Column 1" }, { id: "col-2", name: "Column 2" }];
          }
        },
        renderHTML: (attributes) => ({
          "data-columns": JSON.stringify(attributes.columns),
        }),
      },
      rows: {
        default: [
          { id: "row-1", cells: { "col-1": "", "col-2": "" } },
          { id: "row-2", cells: { "col-1": "", "col-2": "" } },
        ],
        parseHTML: (element) => {
          const raw = element.getAttribute("data-rows");
          if (!raw) return [
            { id: "row-1", cells: { "col-1": "", "col-2": "" } },
            { id: "row-2", cells: { "col-1": "", "col-2": "" } },
          ];
          try {
            return JSON.parse(raw);
          } catch {
            return [
              { id: "row-1", cells: { "col-1": "", "col-2": "" } },
              { id: "row-2", cells: { "col-1": "", "col-2": "" } },
            ];
          }
        },
        renderHTML: (attributes) => ({
          "data-rows": JSON.stringify(attributes.rows),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='eln-table']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-type": "eln-table",
        ...HTMLAttributes,
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableNodeView);
  },
});

export default TableBlock;
