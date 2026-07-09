/**
 * Tests for the SlashCommands TipTap extension.
 *
 * Covers: fuzzyMatch pure function, getCommands factory, and editor
 * integration (extension loads, slash insertion doesn't crash).
 */
import { describe, it, expect } from "vitest";
import SlashCommands, {
  fuzzyMatch,
  getCommands,
} from "../SlashCommands";
import LimsTable from "../../../blocks/LimsTable";
import { createTestEditor } from "../../../../../test/factories";

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

// ── getCommands ───────────────────────────────────────────────────────────

describe("getCommands", () => {
  it("returns at least one command", () => {
    const commands = getCommands();
    expect(commands.length).toBeGreaterThan(0);
  });

  it("includes a Table command with expected shape", () => {
    const commands = getCommands();
    const table = commands.find((c) => c.label === "Table");
    expect(table).toBeTruthy();
    expect(table?.description).toBeTruthy();
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
});

// ── Editor integration ────────────────────────────────────────────────────

describe("SlashCommands editor integration", () => {
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
