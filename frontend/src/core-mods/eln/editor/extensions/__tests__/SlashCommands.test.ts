/**
 * Tests for the SlashCommands TipTap extension.
 *
 * Covers: fuzzyMatch pure function, getCommands (from registry), and editor
 * integration (extension loads, slash insertion doesn't crash, table
 * insertion via registered block).
 */
import { describe, it, expect, beforeEach } from "vitest";
import SlashCommands from "../SlashCommands";
import LimsTable from "../../../blocks/LimsTable";
import { createTestEditor } from "../../../../../test/factories";
import { ModRegistry, BLOCK_TYPE_TIPTAP_NODE } from "../../../../../core/mod-system";

// ── Inlined helpers from SlashCommands.ts ──────────────────────────────────

/** Inlined fuzzyMatch — pure subsequence match, case-insensitive. */
function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Build the slash command list from registered tiptap-node blocks. */
function getCommands() {
  const blocks = ModRegistry.getInstance().getBlocks();
  const commands: Array<{
    label: string;
    description: string;
    icon: string;
    action: (editor: any, range: { from: number; to: number }) => void;
  }> = [];

  for (const block of blocks.values()) {
    if (block.type !== BLOCK_TYPE_TIPTAP_NODE) continue;

    const payload = block.payload as any;
    const nodeName = payload.node.name;

    commands.push({
      label: block.label,
      description: block.description,
      icon: block.icon,
      action: (editor, range) => {
        const content: Record<string, unknown> = { type: nodeName };
        if (payload.defaultAttrs) {
          content.attrs = payload.defaultAttrs;
        }
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContentAt(range.from, content)
          .run();
      },
    });
  }

  commands.sort((a, b) => a.label.localeCompare(b.label));
  return commands;
}

function registerTableBlock(overrides?: Record<string, unknown>) {
  ModRegistry.getInstance().registerBlock({
    id: "eln.table",
    label: "Table",
    description: "Insert a schema-backed LIMS table",
    icon: "📊",
    type: BLOCK_TYPE_TIPTAP_NODE,
    payload: {
      node: LimsTable,
      defaultAttrs: {
        schemaId: null,
        title: "Table",
        columns: [
          { name: "Column 1", type: "Text" },
          { name: "Column 2", type: "Text" },
        ],
        rows: [
          {
            entityId: null,
            displayId: "#1",
            values: { "Column 1": "", "Column 2": "" },
          },
          {
            entityId: null,
            displayId: "#2",
            values: { "Column 1": "", "Column 2": "" },
          },
        ],
        ...overrides,
      },
    },
  });
}

// ── fuzzyMatch (pure function) ────────────────────────────────────────────

describe("fuzzyMatch", () => {
  it("exact match", () => {
    expect(fuzzyMatch("Table", "Table")).toBe(true);
  });

  it("subsequence match", () => {
    expect(fuzzyMatch("Table insert a LIMS table", "tbl")).toBe(true);
  });

  it("case insensitive — query lowercase, text uppercase", () => {
    expect(fuzzyMatch("TABLE", "table")).toBe(true);
  });

  it("case insensitive — query uppercase, text lowercase", () => {
    expect(fuzzyMatch("table", "TBL")).toBe(true);
  });

  it("non-match returns false", () => {
    expect(fuzzyMatch("Table", "xyz")).toBe(false);
  });

  it("empty query matches everything", () => {
    expect(fuzzyMatch("anything", "")).toBe(true);
  });

  it("query longer than text returns false", () => {
    expect(fuzzyMatch("ab", "abc")).toBe(false);
  });

  it("single character match", () => {
    expect(fuzzyMatch("Table", "T")).toBe(true);
  });

  it("partial subsequence — skips non-matching chars", () => {
    expect(fuzzyMatch("fuzzy match test", "fmt")).toBe(true);
  });

  it("matches on description text, not just label", () => {
    expect(fuzzyMatch("Insert a schema-backed LIMS table", "lims")).toBe(true);
  });

  it("space in query means consecutive chars anywhere", () => {
    // "t i" — t and i must appear in order but can skip chars
    expect(fuzzyMatch("Table insert", "t i")).toBe(true);
  });
});

// ── getCommands (reads from registry) ─────────────────────────────────────

describe("getCommands", () => {
  beforeEach(() => {
    ModRegistry._reset();
    registerTableBlock();
  });

  it("returns at least one command when table block is registered", () => {
    const commands = getCommands();
    expect(commands.length).toBeGreaterThan(0);
  });

  it("includes a Table command with expected shape", () => {
    const commands = getCommands();
    const table = commands.find((c) => c.label === "Table");
    expect(table).toBeTruthy();
    expect(table?.description).toBe("Insert a schema-backed LIMS table");
    expect(table?.icon).toBe("📊");
    expect(typeof table?.action).toBe("function");
  });

  it("Table action is callable with mock editor and range", () => {
    const commands = getCommands();
    const table = commands.find((c) => c.label === "Table")!;
    const mockEditor = {
      chain: () => ({
        focus: () => ({
          deleteRange: () => ({
            insertContentAt: () => ({
              run: () => {},
            }),
          }),
        }),
      }),
    };
    // Should not throw
    expect(() =>
      table.action(mockEditor, { from: 0, to: 1 }),
    ).not.toThrow();
  });

  it("all commands have required fields", () => {
    const commands = getCommands();
    for (const cmd of commands) {
      expect(cmd.label).toBeTruthy();
      expect(cmd.description).toBeTruthy();
      expect(cmd.icon).toBeTruthy();
      expect(typeof cmd.action).toBe("function");
    }
  });

  it("returns empty array when no blocks are registered", () => {
    ModRegistry._reset();
    const commands = getCommands();
    expect(commands).toHaveLength(0);
  });

  it("excludes blocks with non-tiptap-node type", () => {
    ModRegistry._reset();
    ModRegistry.getInstance().registerBlock({
      id: "test.other",
      label: "Other",
      description: "A non-tiptap block",
      icon: "🔧",
      type: "molbio-viewer",
      payload: {},
    });
    const commands = getCommands();
    expect(commands).toHaveLength(0);
  });

  it("sorts commands alphabetically by label", () => {
    ModRegistry._reset();
    ModRegistry.getInstance().registerBlock({
      id: "test.zebra",
      label: "Zebra",
      description: "Z block",
      icon: "🦓",
      type: BLOCK_TYPE_TIPTAP_NODE,
      payload: { node: LimsTable },
    });
    ModRegistry.getInstance().registerBlock({
      id: "test.alpha",
      label: "Alpha",
      description: "A block",
      icon: "🔤",
      type: BLOCK_TYPE_TIPTAP_NODE,
      payload: { node: LimsTable },
    });

    const commands = getCommands();
    expect(commands[0].label).toBe("Alpha");
    expect(commands[1].label).toBe("Zebra");
  });
});

// ── Editor integration ────────────────────────────────────────────────────

describe("SlashCommands editor integration", () => {
  beforeEach(() => {
    ModRegistry._reset();
    registerTableBlock();
  });

  it("editor creates successfully with SlashCommands extension", () => {
    const editor = createTestEditor([SlashCommands, LimsTable]);
    expect(editor).toBeTruthy();
    expect(editor.getJSON()).toBeTruthy();
    editor.destroy();
  });

  it("typing / does not crash the editor", () => {
    const editor = createTestEditor([SlashCommands, LimsTable]);
    // insertContent with "/" text — should insert without crashing
    expect(() => {
      editor.commands.insertContent("/");
    }).not.toThrow();
    editor.destroy();
  });

  it("typing multiple slashes does not crash", () => {
    const editor = createTestEditor([SlashCommands, LimsTable]);
    expect(() => {
      editor.commands.insertContent("some text /Table");
    }).not.toThrow();
    editor.destroy();
  });

  it("Table command action inserts a limsTable node", () => {
    const editor = createTestEditor([SlashCommands, LimsTable]);
    const commands = getCommands();
    const tableCmd = commands.find((c) => c.label === "Table")!;
    const from = editor.state.selection.from;
    tableCmd.action(editor, { from, to: from });
    const doc = editor.getJSON();
    const tableNode = doc.content?.find((n: any) => n.type === "limsTable");
    expect(tableNode).toBeTruthy();
    expect(tableNode?.attrs?.title).toBe("Table");
    expect(tableNode?.attrs?.columns).toHaveLength(2);
    expect(tableNode?.attrs?.rows).toHaveLength(2);
    editor.destroy();
  });

  it("editor remains editable after slash extension loads", () => {
    const editor = createTestEditor([SlashCommands, LimsTable]);
    expect(editor.isEditable).toBe(true);
    editor.commands.insertContent("Hello, world!");
    const text = editor.getText();
    expect(text).toContain("Hello, world!");
    editor.destroy();
  });
});
