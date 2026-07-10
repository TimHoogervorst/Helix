/**
 * Integration tests for TableBlock — the elnTable TipTap node.
 *
 * Covers: node registration, default attributes, serialization round-trip
 * (JSON → HTML → JSON), and insertion via the editor API.
 *
 * Tests use a real (non-React) TipTap editor via createTestEditor — the
 * NodeView is not rendered.  For NodeView rendering tests, see the
 * React component tests.
 */
import { describe, it, expect } from "vitest";
import { createTestEditor } from "../../../test/factories";
import TableBlock from "../blocks/TableBlock";
import type { TableColumn, TableRow } from "../blocks/TableNodeView";
import type { Editor } from "@tiptap/core";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeColumn(overrides?: Partial<TableColumn>): TableColumn {
  return {
    id: "col-1",
    name: "Column A",
    ...overrides,
  };
}

function makeRow(overrides?: Partial<TableRow>): TableRow {
  return {
    id: "row-1",
    cells: { "col-1": "Cell value" },
    ...overrides,
  };
}

function makeTableDoc(
  title = "Table",
  columns: TableColumn[] = [makeColumn()],
  rows: TableRow[] = [makeRow()],
) {
  return {
    type: "doc",
    content: [
      {
        type: "elnTable",
        attrs: { title, columns, rows },
      },
    ],
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("TableBlock TipTap node", () => {
  let editor: Editor;

  const destroy = () => {
    if (editor && !editor.isDestroyed) editor.destroy();
  };

  // ── Node definition ──────────────────────────────────────────────────

  describe("node definition", () => {
    it("has the correct node name", () => {
      expect(TableBlock.name).toBe("elnTable");
    });

    it("is a block-level node", () => {
      expect(TableBlock.config.group).toBe("block");
    });

    it("is an atom (void) node", () => {
      expect(TableBlock.config.atom).toBe(true);
    });

    it("is isolating", () => {
      expect(TableBlock.config.isolating).toBe(true);
    });
  });

  // ── Default attributes ───────────────────────────────────────────────

  describe("default attributes", () => {
    it("defaults title to 'Table'", () => {
      editor = createTestEditor([TableBlock], {
        type: "doc",
        content: [{ type: "elnTable" }],
      });
      const json = editor.getJSON();
      const node = (json as any).content?.[0];
      expect(node?.attrs?.title).toBe("Table");
      destroy();
    });

    it("defaults columns to a 2-column starter array", () => {
      editor = createTestEditor([TableBlock], {
        type: "doc",
        content: [{ type: "elnTable" }],
      });
      const json = editor.getJSON();
      const node = (json as any).content?.[0];
      expect(node?.attrs?.columns).toHaveLength(2);
      expect(node?.attrs?.columns[0].name).toBe("Column 1");
      expect(node?.attrs?.columns[1].name).toBe("Column 2");
      destroy();
    });

    it("defaults rows to a 2-row starter array", () => {
      editor = createTestEditor([TableBlock], {
        type: "doc",
        content: [{ type: "elnTable" }],
      });
      const json = editor.getJSON();
      const node = (json as any).content?.[0];
      expect(node?.attrs?.rows).toHaveLength(2);
      destroy();
    });

    it("default row cells are empty strings keyed by column index", () => {
      editor = createTestEditor([TableBlock], {
        type: "doc",
        content: [{ type: "elnTable" }],
      });
      const json = editor.getJSON();
      const node = (json as any).content?.[0];
      const row0 = node?.attrs?.rows[0];
      // Default columns are col-1, col-2 — cells should be empty strings
      expect(row0.cells).toEqual({ "col-1": "", "col-2": "" });
      destroy();
    });
  });

  // ── Serialization round-trip (JSON → HTML → JSON) ────────────────────

  describe("serialization round-trip", () => {
    it("preserves title, columns, and rows", () => {
      const columns: TableColumn[] = [
        { id: "c1", name: "Reagent" },
        { id: "c2", name: "Volume" },
      ];
      const rows: TableRow[] = [
        { id: "r1", cells: { c1: "Water", c2: "10 mL" } },
        { id: "r2", cells: { c1: "Ethanol", c2: "5 mL" } },
      ];
      editor = createTestEditor(
        [TableBlock],
        makeTableDoc("Reagents", columns, rows),
      );

      const html = editor.getHTML();
      const editor2 = createTestEditor([TableBlock], html);
      const json = editor2.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.type).toBe("elnTable");
      expect(node?.attrs?.title).toBe("Reagents");
      expect(node?.attrs?.columns).toEqual(columns);
      expect(node?.attrs?.rows).toEqual(rows);
      editor2.destroy();
      destroy();
    });

    it("preserves empty columns and rows", () => {
      editor = createTestEditor(
        [TableBlock],
        makeTableDoc("Empty", [], []),
      );

      const html = editor.getHTML();
      const editor2 = createTestEditor([TableBlock], html);
      const json = editor2.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.attrs?.columns).toEqual([]);
      expect(node?.attrs?.rows).toEqual([]);
      editor2.destroy();
      destroy();
    });

    it("preserves empty cell values", () => {
      const columns: TableColumn[] = [{ id: "c1", name: "Notes" }];
      const rows: TableRow[] = [{ id: "r1", cells: { c1: "" } }];
      editor = createTestEditor(
        [TableBlock],
        makeTableDoc("Notes", columns, rows),
      );

      const html = editor.getHTML();
      const editor2 = createTestEditor([TableBlock], html);
      const json = editor2.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.attrs?.rows[0].cells.c1).toBe("");
      editor2.destroy();
      destroy();
    });
  });

  // ── Insertion via editor API ─────────────────────────────────────────

  describe("insertion", () => {
    it("can be inserted via insertContent with JSON", () => {
      editor = createTestEditor([TableBlock]);

      const columns: TableColumn[] = [{ id: "c1", name: "A" }];
      const rows: TableRow[] = [{ id: "r1", cells: { c1: "hello" } }];
      editor
        .chain()
        .focus()
        .insertContent({
          type: "elnTable",
          attrs: { title: "My Table", columns, rows },
        })
        .run();

      const json = editor.getJSON();
      const nodes = (json as any).content ?? [];
      const tableNodes = nodes.filter((n: any) => n.type === "elnTable");

      expect(tableNodes).toHaveLength(1);
      expect(tableNodes[0].attrs.title).toBe("My Table");
      expect(tableNodes[0].attrs.columns).toEqual(columns);
      expect(tableNodes[0].attrs.rows).toEqual(rows);
      destroy();
    });

    it("can be inserted alongside other content", () => {
      editor = createTestEditor([TableBlock]);

      editor
        .chain()
        .focus()
        .insertContent([
          { type: "paragraph", content: [{ type: "text", text: "Before" }] },
          { type: "elnTable" },
          { type: "paragraph", content: [{ type: "text", text: "After" }] },
        ])
        .run();

      const json = editor.getJSON();
      const nodes = (json as any).content ?? [];
      expect(nodes).toHaveLength(3);
      expect(nodes[0].type).toBe("paragraph");
      expect(nodes[1].type).toBe("elnTable");
      expect(nodes[2].type).toBe("paragraph");
      destroy();
    });
  });

  // ── HTML parse ───────────────────────────────────────────────────────

  describe("parseHTML", () => {
    it("parses a div with data-type='eln-table'", () => {
      const columns: TableColumn[] = [{ id: "c1", name: "Col" }];
      const rows: TableRow[] = [{ id: "r1", cells: { c1: "val" } }];
      const html =
        `<div data-type="eln-table" data-title="Test" data-columns='${JSON.stringify(columns)}' data-rows='${JSON.stringify(rows)}'></div>`;
      editor = createTestEditor([TableBlock], html);

      const json = editor.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.type).toBe("elnTable");
      expect(node?.attrs?.title).toBe("Test");
      expect(node?.attrs?.columns).toEqual(columns);
      expect(node?.attrs?.rows).toEqual(rows);
      destroy();
    });

    it("handles malformed columns data gracefully", () => {
      const html =
        '<div data-type="eln-table" data-title="Bad" data-columns="not-json" data-rows="[]"></div>';
      editor = createTestEditor([TableBlock], html);

      const json = editor.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.attrs?.columns).toEqual([]);
      destroy();
    });

    it("handles malformed rows data gracefully", () => {
      const html =
        '<div data-type="eln-table" data-title="Bad" data-columns="[]" data-rows="not-json"></div>';
      editor = createTestEditor([TableBlock], html);

      const json = editor.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.attrs?.rows).toEqual([]);
      destroy();
    });
  });
});
