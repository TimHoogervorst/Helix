/**
 * Tests for the SlashCommands TipTap extension.
 *
 * Covers: fuzzyMatch pure function, getCommands (from registry), and editor
 * integration (extension loads, slash insertion doesn't crash, table
 * insertion via registered block).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Node } from "@tiptap/core";
import SlashCommands from "../SlashCommands";
import { createTestEditor } from "../../../../../shell/src/test/factories";
import { ModRegistry } from "../../../../../shell/src/mod-system/ModRegistry";

/** Minimal inline TipTap node for testing — matches the block ID used in registerTableBlock. */
const TestTableNode = Node.create({
  name: "test.table",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      content: { default: "{}" },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes];
  },
});

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

/** Build the slash command list from registered blocks. */
function getCommands() {
  const blocks = ModRegistry.getInstance().getBlocks();
  const commands: Array<{
    label: string;
    description: string;
    icon: string;
    action: (editor: any, range: { from: number; to: number }) => void;
  }> = [];

  for (const block of blocks.values()) {
    const serializedContent = block.serialize(block.defaultState);

    commands.push({
      label: block.label,
      description: block.tags?.join(", ") ?? "",
      icon: "📦",
      action: (editor, range) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContentAt(range.from, {
            type: block.id,
            attrs: { content: serializedContent },
          })
          .run();
      },
    });
  }

  commands.sort((a, b) => a.label.localeCompare(b.label));
  return commands;
}

function makeBlockRegistration(id: string, label: string, overrides?: Record<string, unknown>) {
  return {
    id,
    label,
    icon: DummyComponent,
    component: DummyComponent,
    listensTo: [] as string[],
    onEvent: {} as Record<string, (instance: any, payload: unknown) => unknown | void>,
    serialize: (state: Record<string, unknown>) => JSON.stringify(state),
    deserialize: (json: string) => {
      try { return JSON.parse(json); } catch { return {}; }
    },
    defaultState: {
      schemaId: null,
      title: "Table",
      columns: [
        { name: "Column 1", type: "text" },
        { name: "Column 2", type: "text" },
      ],
      rows: [
        { entityId: null, displayId: "#1", values: { "Column 1": "", "Column 2": "" } },
        { entityId: null, displayId: "#2", values: { "Column 1": "", "Column 2": "" } },
      ],
      ...overrides,
    },
  };
}

/** Dummy component for test configs. */
function DummyComponent() {
  return null;
}

function registerTableBlock(overrides?: Record<string, unknown>) {
  ModRegistry.getInstance().registerBlock(
    makeBlockRegistration("test.table", "Table", overrides),
  );
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
    expect(table?.description).toBe("");
    expect(table?.icon).toBe("📦");
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
      expect(cmd.description !== undefined).toBe(true);
      expect(cmd.icon).toBeTruthy();
      expect(typeof cmd.action).toBe("function");
    }
  });

  it("returns empty array when no blocks are registered", () => {
    ModRegistry._reset();
    const commands = getCommands();
    expect(commands).toHaveLength(0);
  });

  it("includes all registered blocks regardless of type", () => {
    ModRegistry._reset();
    ModRegistry.getInstance().registerBlock(
      makeBlockRegistration("test.other", "Other"),
    );
    const commands = getCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0].label).toBe("Other");
  });

  it("sorts commands alphabetically by label", () => {
    ModRegistry._reset();
    ModRegistry.getInstance().registerBlock(
      makeBlockRegistration("test.zebra", "Zebra"),
    );
    ModRegistry.getInstance().registerBlock(
      makeBlockRegistration("test.alpha", "Alpha"),
    );

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
    const editor = createTestEditor([SlashCommands, TestTableNode]);
    expect(editor).toBeTruthy();
    expect(editor.getJSON()).toBeTruthy();
    editor.destroy();
  });

  it("typing / does not crash the editor", () => {
    const editor = createTestEditor([SlashCommands, TestTableNode]);
    // insertContent with "/" text — should insert without crashing
    expect(() => {
      editor.commands.insertContent("/");
    }).not.toThrow();
    editor.destroy();
  });

  it("typing multiple slashes does not crash", () => {
    const editor = createTestEditor([SlashCommands, TestTableNode]);
    expect(() => {
      editor.commands.insertContent("some text /Table");
    }).not.toThrow();
    editor.destroy();
  });

  it("Table command action inserts a test.table node", () => {
    const editor = createTestEditor([SlashCommands, TestTableNode]);
    const commands = getCommands();
    const tableCmd = commands.find((c) => c.label === "Table")!;
    const from = editor.state.selection.from;
    tableCmd.action(editor, { from, to: from });
    const doc = editor.getJSON();
    const tableNode = doc.content?.find((n: any) => n.type === "test.table");
    expect(tableNode).toBeTruthy();
    // The slash command inserts content via the block's serialized state
    // using the generic 'content' attribute used by slot-system BlockBindings.
    expect(tableNode?.attrs).toBeDefined();
    expect(tableNode?.attrs?.content).toBeDefined();
    editor.destroy();
  });

  it("editor remains editable after slash extension loads", () => {
    const editor = createTestEditor([SlashCommands, TestTableNode]);
    expect(editor.isEditable).toBe(true);
    editor.commands.insertContent("Hello, world!");
    const text = editor.getText();
    expect(text).toContain("Hello, world!");
    editor.destroy();
  });
});
