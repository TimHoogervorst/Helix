/**
 * Integration tests for CommentBlock — the elnComment TipTap node.
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
import CommentBlock from "../blocks/CommentBlock";
import type { CommentEntry } from "../blocks/CommentNodeView";
import type { Editor } from "@tiptap/core";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeThreadEntry(overrides?: Partial<CommentEntry>): CommentEntry {
  return {
    id: "abc-123",
    authorId: 1,
    authorName: "Alice Smith",
    authorInitials: "AS",
    authorColor: "#4A90D9",
    text: "This is a sample comment.",
    createdAt: "2026-07-10T12:00:00Z",
    ...overrides,
  };
}

function makeCommentDoc(thread: CommentEntry[], resolved = false) {
  return {
    type: "doc",
    content: [
      {
        type: "elnComment",
        attrs: { resolved, thread },
      },
    ],
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("CommentBlock TipTap node", () => {
  let editor: Editor;

  const destroy = () => {
    if (editor && !editor.isDestroyed) editor.destroy();
  };

  // ── Node definition ──────────────────────────────────────────────────

  describe("node definition", () => {
    it("has the correct node name", () => {
      expect(CommentBlock.name).toBe("elnComment");
    });

    it("is a block-level node", () => {
      expect(CommentBlock.config.group).toBe("block");
    });

    it("is an atom (void) node", () => {
      expect(CommentBlock.config.atom).toBe(true);
    });

    it("is isolating", () => {
      expect(CommentBlock.config.isolating).toBe(true);
    });
  });

  // ── Default attributes ───────────────────────────────────────────────

  describe("default attributes", () => {
    it("defaults resolved to false", () => {
      editor = createTestEditor([CommentBlock], makeCommentDoc([]));
      const json = editor.getJSON();
      const node = (json as any).content?.[0];
      expect(node?.attrs?.resolved).toBe(false);
      destroy();
    });

    it("defaults thread to empty array", () => {
      editor = createTestEditor([CommentBlock], makeCommentDoc([]));
      const json = editor.getJSON();
      const node = (json as any).content?.[0];
      expect(node?.attrs?.thread).toEqual([]);
      destroy();
    });
  });

  // ── Serialization round-trip (JSON → HTML → JSON) ────────────────────

  describe("serialization round-trip", () => {
    it("preserves thread with a single comment entry", () => {
      const thread = [makeThreadEntry()];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      // Re-parse: set content from HTML, then read back as JSON
      const editor2 = createTestEditor([CommentBlock], html);
      const json = editor2.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.type).toBe("elnComment");
      expect(node?.attrs?.resolved).toBe(false);
      expect(node?.attrs?.thread).toEqual(thread);
      editor2.destroy();
      destroy();
    });

    it("preserves thread with multiple comment entries (replies)", () => {
      const thread = [
        makeThreadEntry(),
        makeThreadEntry({
          id: "def-456",
          authorId: 2,
          authorName: "Bob Jones",
          authorInitials: "BJ",
          authorColor: "#E74C3C",
          text: "This is a reply.",
          createdAt: "2026-07-10T13:00:00Z",
        }),
      ];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const json = editor2.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.attrs?.thread).toEqual(thread);
      editor2.destroy();
      destroy();
    });

    it("preserves resolved flag", () => {
      const thread = [makeThreadEntry()];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread, true));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const json = editor2.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.attrs?.resolved).toBe(true);
      editor2.destroy();
      destroy();
    });

    it("preserves empty thread", () => {
      editor = createTestEditor([CommentBlock], makeCommentDoc([]));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const json = editor2.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.attrs?.thread).toEqual([]);
      editor2.destroy();
      destroy();
    });

    it("handles thread with empty text field", () => {
      const thread = [makeThreadEntry({ text: "" })];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const json = editor2.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.attrs?.thread[0].text).toBe("");
      editor2.destroy();
      destroy();
    });
  });

  // ── Insertion via editor API ─────────────────────────────────────────

  describe("insertion", () => {
    it("can be inserted via insertContent with JSON", () => {
      editor = createTestEditor([CommentBlock]);

      const thread = [makeThreadEntry()];
      editor
        .chain()
        .focus()
        .insertContent({
          type: "elnComment",
          attrs: { resolved: false, thread },
        })
        .run();

      const json = editor.getJSON();
      const nodes = (json as any).content ?? [];
      const commentNodes = nodes.filter(
        (n: any) => n.type === "elnComment",
      );

      expect(commentNodes).toHaveLength(1);
      expect(commentNodes[0].attrs.resolved).toBe(false);
      expect(commentNodes[0].attrs.thread).toEqual(thread);
      destroy();
    });

    it("can be inserted alongside other content", () => {
      editor = createTestEditor([CommentBlock]);

      const thread = [makeThreadEntry()];
      // Insert a paragraph, then a comment, then another paragraph
      editor
        .chain()
        .focus()
        .insertContent([
          { type: "paragraph", content: [{ type: "text", text: "Before" }] },
          { type: "elnComment", attrs: { resolved: false, thread } },
          { type: "paragraph", content: [{ type: "text", text: "After" }] },
        ])
        .run();

      const json = editor.getJSON();
      const nodes = (json as any).content ?? [];
      expect(nodes).toHaveLength(3);
      expect(nodes[0].type).toBe("paragraph");
      expect(nodes[1].type).toBe("elnComment");
      expect(nodes[2].type).toBe("paragraph");
      destroy();
    });
  });

  // ── HTML parse ───────────────────────────────────────────────────────

  describe("parseHTML", () => {
    it("parses a div with data-type='eln-comment'", () => {
      const thread = [makeThreadEntry()];
      const html = `<div data-type="eln-comment" data-resolved="false" data-thread='${JSON.stringify(thread)}'></div>`;
      editor = createTestEditor([CommentBlock], html);

      const json = editor.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.type).toBe("elnComment");
      expect(node?.attrs?.resolved).toBe(false);
      expect(node?.attrs?.thread).toEqual(thread);
      destroy();
    });

    it("parses resolved attribute from HTML", () => {
      const thread = [makeThreadEntry()];
      const html = `<div data-type="eln-comment" data-resolved="true" data-thread='${JSON.stringify(thread)}'></div>`;
      editor = createTestEditor([CommentBlock], html);

      const json = editor.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.attrs?.resolved).toBe(true);
      destroy();
    });

    it("handles malformed thread data gracefully", () => {
      const html =
        '<div data-type="eln-comment" data-resolved="false" data-thread="not-json"></div>';
      editor = createTestEditor([CommentBlock], html);

      const json = editor.getJSON();
      const node = (json as any).content?.[0];

      expect(node?.attrs?.thread).toEqual([]);
      destroy();
    });
  });
});
