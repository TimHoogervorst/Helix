/**
 * Tests for the LimsTable TipTap extension.
 *
 * Covers: schemaId parsing (valid, empty, invalid), columns/rows JSON
 * parsing with malformed fallback, HTML round-trip, and parseHTML tag.
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import LimsTable from "../LimsTable";

function createEditor(content?: any) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const editor = new Editor({
    element: el,
    extensions: [StarterKit, LimsTable],
    content: content || { type: "doc", content: [{ type: "paragraph" }] },
  });
  return editor;
}

describe("LimsTable", () => {
  // ── schemaId parsing ─────────────────────────────────────────────────

  describe("schemaId attribute parsing", () => {
    it("parses a valid integer schemaId", () => {
      const editor = createEditor(
        '<div data-type="lims-table" data-schema-id="42"></div>',
      );
      const doc = editor.getJSON();
      const table = doc.content?.find((n: any) => n.type === "limsTable");
      expect(table?.attrs?.schemaId).toBe(42);
      editor.destroy();
    });

    it("returns null for empty schemaId", () => {
      const editor = createEditor(
        '<div data-type="lims-table" data-schema-id=""></div>',
      );
      const doc = editor.getJSON();
      const table = doc.content?.find((n: any) => n.type === "limsTable");
      expect(table?.attrs?.schemaId).toBeNull();
      editor.destroy();
    });

    it("returns null for missing schemaId attribute", () => {
      const editor = createEditor(
        '<div data-type="lims-table"></div>',
      );
      const doc = editor.getJSON();
      const table = doc.content?.find((n: any) => n.type === "limsTable");
      expect(table?.attrs?.schemaId).toBeNull();
      editor.destroy();
    });

    it("returns null for non-numeric schemaId", () => {
      const editor = createEditor(
        '<div data-type="lims-table" data-schema-id="abc"></div>',
      );
      const doc = editor.getJSON();
      const table = doc.content?.find((n: any) => n.type === "limsTable");
      expect(table?.attrs?.schemaId).toBeNull();
      editor.destroy();
    });
  });

  // ── JSON parsing (columns / rows) ────────────────────────────────────

  describe("columns JSON parsing", () => {
    it("parses valid columns JSON", () => {
      const columns = [
        { name: "Col A", type: "Text" },
        { name: "Volume", type: "Number", units: "mL" },
      ];
      const html = `<div data-type="lims-table" data-columns='${JSON.stringify(columns)}'></div>`;
      const editor = createEditor(html);
      const doc = editor.getJSON();
      const table = doc.content?.find((n: any) => n.type === "limsTable");
      expect(table?.attrs?.columns).toEqual(columns);
      editor.destroy();
    });

    it("returns empty array for missing columns", () => {
      const editor = createEditor(
        '<div data-type="lims-table"></div>',
      );
      const doc = editor.getJSON();
      const table = doc.content?.find((n: any) => n.type === "limsTable");
      expect(table?.attrs?.columns).toEqual([]);
      editor.destroy();
    });

    it("returns empty array for malformed columns JSON", () => {
      const editor = createEditor(
        '<div data-type="lims-table" data-columns="{invalid json}"></div>',
      );
      const doc = editor.getJSON();
      const table = doc.content?.find((n: any) => n.type === "limsTable");
      expect(table?.attrs?.columns).toEqual([]);
      editor.destroy();
    });
  });

  describe("rows JSON parsing", () => {
    it("parses valid rows JSON", () => {
      const rows = [
        { entityId: null, displayId: "#1", values: { "Col A": "hello" } },
        { entityId: 42, displayId: "E1", values: { "Col A": "world" } },
      ];
      const html = `<div data-type="lims-table" data-rows='${JSON.stringify(rows)}'></div>`;
      const editor = createEditor(html);
      const doc = editor.getJSON();
      const table = doc.content?.find((n: any) => n.type === "limsTable");
      expect(table?.attrs?.rows).toEqual(rows);
      editor.destroy();
    });

    it("returns empty array for missing rows", () => {
      const editor = createEditor(
        '<div data-type="lims-table"></div>',
      );
      const doc = editor.getJSON();
      const table = doc.content?.find((n: any) => n.type === "limsTable");
      expect(table?.attrs?.rows).toEqual([]);
      editor.destroy();
    });

    it("returns empty array for malformed rows JSON", () => {
      const editor = createEditor(
        '<div data-type="lims-table" data-rows="{{bad}}"></div>',
      );
      const doc = editor.getJSON();
      const table = doc.content?.find((n: any) => n.type === "limsTable");
      expect(table?.attrs?.rows).toEqual([]);
      editor.destroy();
    });
  });

  // ── HTML round-trip ──────────────────────────────────────────────────

  it("HTML round-trip: render → parse preserves all attributes", () => {
    const editor = createEditor();
    const columns = [
      { name: "Name", type: "Text" },
      { name: "Count", type: "Number" },
    ];
    const rows = [
      { entityId: 1, displayId: "E1", values: { Name: "Alpha", Count: 10 } },
    ];

    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            schemaId: 7,
            schemaName: "Samples",
            title: "My Table",
            columns,
            rows,
          },
        },
      ],
    });

    const html = editor.getHTML();
    // Parse the HTML back
    editor.commands.setContent(html);
    const doc = editor.getJSON();
    const table = doc.content?.find((n: any) => n.type === "limsTable");

    expect(table?.attrs?.schemaId).toBe(7);
    expect(table?.attrs?.schemaName).toBe("Samples");
    expect(table?.attrs?.title).toBe("My Table");
    expect(table?.attrs?.columns).toEqual(columns);
    expect(table?.attrs?.rows).toEqual(rows);
    editor.destroy();
  });

  it("HTML round-trip with null schemaId", () => {
    const editor = createEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: { schemaId: null, title: "Untyped", columns: [], rows: [] },
        },
      ],
    });
    const html = editor.getHTML();
    editor.commands.setContent(html);
    const doc = editor.getJSON();
    const table = doc.content?.find((n: any) => n.type === "limsTable");
    expect(table?.attrs?.schemaId).toBeNull();
    expect(table?.attrs?.title).toBe("Untyped");
    editor.destroy();
  });

  // ── parseHTML tag matching ───────────────────────────────────────────

  it("matches div[data-type='lims-table']", () => {
    const editor = createEditor(
      '<div data-type="lims-table" data-title="Test"></div>',
    );
    const doc = editor.getJSON();
    const table = doc.content?.find((n: any) => n.type === "limsTable");
    expect(table).toBeTruthy();
    expect(table?.attrs?.title).toBe("Test");
    editor.destroy();
  });

  // ── Default values ───────────────────────────────────────────────────

  it("default title is 'Table'", () => {
    const editor = createEditor(
      '<div data-type="lims-table"></div>',
    );
    const doc = editor.getJSON();
    const table = doc.content?.find((n: any) => n.type === "limsTable");
    expect(table?.attrs?.title).toBe("Table");
    editor.destroy();
  });

  it("default columns and rows are empty arrays", () => {
    const editor = createEditor(
      '<div data-type="lims-table"></div>',
    );
    const doc = editor.getJSON();
    const table = doc.content?.find((n: any) => n.type === "limsTable");
    expect(table?.attrs?.columns).toEqual([]);
    expect(table?.attrs?.rows).toEqual([]);
    expect(table?.attrs?.schemaId).toBeNull();
    expect(table?.attrs?.schemaName).toBeNull();
    editor.destroy();
  });
});
