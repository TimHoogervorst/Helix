/**
 * Integration tests for CommentBlock — the elnComment TipTap node.
 *
 * Covers: node registration, default attributes, serialization round-trip
 * (JSON → HTML → JSON), insertion via the editor API, reply mutations,
 * resolve mutations, and thread state persistence.
 *
 * Tests use a real (non-React) TipTap editor via createTestEditor — the
 * NodeView is not rendered.  For NodeView rendering tests, see the
 * React component tests.
 */
import { describe, it, expect } from "vitest";
import { createTestEditor } from "../../../shell/src/test/factories";
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

function makeReplyEntry(overrides?: Partial<CommentEntry>): CommentEntry {
  return {
    id: "def-456",
    authorId: 2,
    authorName: "Bob Jones",
    authorInitials: "BJ",
    authorColor: "#E74C3C",
    text: "This is a reply.",
    createdAt: "2026-07-10T13:00:00Z",
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

/** Shape of a parsed elnComment node in TipTap JSON output. */
interface CommentNodeJson {
  type: string;
  attrs: {
    resolved: boolean;
    thread: CommentEntry[];
  };
}

/** Get the first elnComment node from the editor's JSON output. */
function getCommentNode(editor: Editor): CommentNodeJson | null {
  const json = editor.getJSON() as any;
  const nodes: any[] = json?.content ?? [];
  return (nodes.find((n: any) => n.type === "elnComment") ?? null) as CommentNodeJson | null;
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
      const node = getCommentNode(editor);
      expect(node?.attrs?.resolved).toBe(false);
      destroy();
    });

    it("defaults thread to empty array", () => {
      editor = createTestEditor([CommentBlock], makeCommentDoc([]));
      const node = getCommentNode(editor);
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
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.type).toBe("elnComment");
      expect(node?.attrs?.resolved).toBe(false);
      expect(node?.attrs?.thread).toEqual(thread);
      editor2.destroy();
      destroy();
    });

    it("preserves thread with multiple comment entries (replies)", () => {
      const thread = [
        makeThreadEntry(),
        makeReplyEntry(),
      ];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread).toEqual(thread);
      editor2.destroy();
      destroy();
    });

    it("preserves resolved flag", () => {
      const thread = [makeThreadEntry()];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread, true));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.resolved).toBe(true);
      editor2.destroy();
      destroy();
    });

    it("preserves resolved flag alongside multiple replies", () => {
      const thread = [
        makeThreadEntry(),
        makeReplyEntry(),
        makeReplyEntry({ id: "ghi-789", text: "Second reply", createdAt: "2026-07-10T14:00:00Z" }),
      ];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread, true));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.resolved).toBe(true);
      expect(node?.attrs?.thread).toEqual(thread);
      editor2.destroy();
      destroy();
    });

    it("preserves empty thread", () => {
      editor = createTestEditor([CommentBlock], makeCommentDoc([]));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread).toEqual([]);
      editor2.destroy();
      destroy();
    });

    it("handles thread with empty text field", () => {
      const thread = [makeThreadEntry({ text: "" })];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread[0].text).toBe("");
      editor2.destroy();
      destroy();
    });

    it("handles thread with only a reply having empty text", () => {
      const thread = [
        makeThreadEntry(),
        makeReplyEntry({ text: "" }),
      ];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread).toHaveLength(2);
      expect(node?.attrs?.thread[1].text).toBe("");
      editor2.destroy();
      destroy();
    });

    it("handles thread with three or more entries", () => {
      const thread = [
        makeThreadEntry(),
        makeReplyEntry(),
        makeReplyEntry({ id: "jkl-012", text: "Third entry", createdAt: "2026-07-10T15:00:00Z" }),
        makeReplyEntry({ id: "mno-345", text: "Fourth entry", createdAt: "2026-07-10T16:00:00Z" }),
      ];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread).toHaveLength(4);
      expect(node?.attrs?.thread).toEqual(thread);
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

      const nodes = editor.getJSON() as any;
      const commentNodes = (nodes.content ?? []).filter(
        (n: any) => n.type === "elnComment",
      );

      expect(commentNodes).toHaveLength(1);
      expect(commentNodes[0].attrs.resolved).toBe(false);
      expect(commentNodes[0].attrs.thread).toEqual(thread);
      destroy();
    });

    it("can be inserted with a thread including replies", () => {
      editor = createTestEditor([CommentBlock]);

      const thread = [makeThreadEntry(), makeReplyEntry()];
      editor
        .chain()
        .focus()
        .insertContent({
          type: "elnComment",
          attrs: { resolved: false, thread },
        })
        .run();

      const node = getCommentNode(editor);
      expect(node?.attrs?.thread).toEqual(thread);
      destroy();
    });

    it("can be inserted alongside other content", () => {
      editor = createTestEditor([CommentBlock]);

      const thread = [makeThreadEntry()];
      editor
        .chain()
        .focus()
        .insertContent([
          { type: "paragraph", content: [{ type: "text", text: "Before" }] },
          { type: "elnComment", attrs: { resolved: false, thread } },
          { type: "paragraph", content: [{ type: "text", text: "After" }] },
        ])
        .run();

      const json = editor.getJSON() as any;
      const nodes = json.content ?? [];
      expect(nodes).toHaveLength(3);
      expect(nodes[0].type).toBe("paragraph");
      expect(nodes[1].type).toBe("elnComment");
      expect(nodes[2].type).toBe("paragraph");
      destroy();
    });
  });

  // ── Reply operations ──────────────────────────────────────────────────

  describe("reply", () => {
    it("adds a reply to the thread array via updateAttributes", () => {
      const originalThread = [makeThreadEntry()];
      editor = createTestEditor(
        [CommentBlock],
        makeCommentDoc(originalThread),
      );

      // Simulate what the NodeView does when the user submits a reply
      const reply = makeReplyEntry();
      const updatedThread = [...originalThread, reply];
      editor.commands.updateAttributes("elnComment", { thread: updatedThread });

      const node = getCommentNode(editor);
      expect(node?.attrs?.thread).toHaveLength(2);
      expect(node?.attrs?.thread[0]).toEqual(originalThread[0]);
      expect(node?.attrs?.thread[1]).toEqual(reply);
      destroy();
    });

    it("adds multiple replies to the thread array", () => {
      const originalThread = [makeThreadEntry()];
      editor = createTestEditor(
        [CommentBlock],
        makeCommentDoc(originalThread),
      );

      const reply1 = makeReplyEntry();
      const reply2 = makeReplyEntry({
        id: "ghi-789",
        text: "Second reply",
        createdAt: "2026-07-10T14:00:00Z",
      });

      editor.commands.updateAttributes("elnComment", {
        thread: [...originalThread, reply1, reply2],
      });

      const node = getCommentNode(editor);
      expect(node?.attrs?.thread).toHaveLength(3);
      expect(node?.attrs?.thread[1].text).toBe("This is a reply.");
      expect(node?.attrs?.thread[2].text).toBe("Second reply");
      destroy();
    });

    it("does not mutate the original comment when adding a reply", () => {
      const originalThread = [makeThreadEntry({ text: "Original text" })];
      editor = createTestEditor(
        [CommentBlock],
        makeCommentDoc(originalThread),
      );

      const reply = makeReplyEntry();
      editor.commands.updateAttributes("elnComment", {
        thread: [...originalThread, reply],
      });

      const node = getCommentNode(editor);
      expect(node?.attrs?.thread[0].text).toBe("Original text");
      expect(node?.attrs?.thread).toHaveLength(2);
      destroy();
    });

    it("preserves replies through serialization round-trip", () => {
      const thread = [
        makeThreadEntry(),
        makeReplyEntry(),
        makeReplyEntry({
          id: "ghi-789",
          authorId: 3,
          authorName: "Carol White",
          authorInitials: "CW",
          authorColor: "#2ECC71",
          text: "Another reply.",
          createdAt: "2026-07-10T14:00:00Z",
        }),
      ];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread).toHaveLength(3);
      expect(node?.attrs?.thread).toEqual(thread);
      editor2.destroy();
      destroy();
    });
  });

  // ── Resolve operations ───────────────────────────────────────────────

  describe("resolve", () => {
    it("sets resolved to true via updateAttributes", () => {
      const thread = [makeThreadEntry()];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread, false));

      editor.commands.updateAttributes("elnComment", { resolved: true });

      const node = getCommentNode(editor);
      expect(node?.attrs?.resolved).toBe(true);
      destroy();
    });

    it("persists resolved state through serialization", () => {
      const thread = [makeThreadEntry()];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread, false));

      // Simulate clicking "Resolve"
      editor.commands.updateAttributes("elnComment", { resolved: true });

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.resolved).toBe(true);
      editor2.destroy();
      destroy();
    });

    it("preserves thread data when resolved", () => {
      const thread = [makeThreadEntry(), makeReplyEntry()];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread, false));

      editor.commands.updateAttributes("elnComment", { resolved: true });

      const node = getCommentNode(editor);
      expect(node?.attrs?.resolved).toBe(true);
      expect(node?.attrs?.thread).toEqual(thread);
      expect(node?.attrs?.thread).toHaveLength(2);
      destroy();
    });

    it("resolved thread with replies survives round-trip", () => {
      const thread = [makeThreadEntry(), makeReplyEntry()];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread, false));

      editor.commands.updateAttributes("elnComment", { resolved: true });

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.resolved).toBe(true);
      expect(node?.attrs?.thread).toHaveLength(2);
      expect(node?.attrs?.thread).toEqual(thread);
      editor2.destroy();
      destroy();
    });
  });

  // ── Thread state integrity ──────────────────────────────────────────

  describe("thread state integrity", () => {
    it("all CommentEntry fields survive round-trip", () => {
      const entry: CommentEntry = {
        id: "test-id-001",
        authorId: 42,
        authorName: "Dr. Jane Doe",
        authorInitials: "JD",
        authorColor: "#8E44AD",
        text: "This method needs optimization — the yield is too low for scale-up.",
        createdAt: "2026-07-09T08:30:00Z",
      };
      const thread = [entry];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread[0]).toEqual(entry);
      editor2.destroy();
      destroy();
    });

    it("handles special characters in comment text", () => {
      const thread = [
        makeThreadEntry({
          text: 'Text with "quotes", <angles>, & ampersands, and emoji 🔬🧪.',
        }),
      ];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread[0].text).toBe(thread[0].text);
      editor2.destroy();
      destroy();
    });

    it("handles special characters in reply text", () => {
      const thread = [
        makeThreadEntry(),
        makeReplyEntry({
          text: 'Re: <script>alert("xss")</script> & more — with em dashes and unicode ✓.',
        }),
      ];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread[1].text).toBe(thread[1].text);
      editor2.destroy();
      destroy();
    });

    it("handles newlines in comment text", () => {
      const thread = [
        makeThreadEntry({
          text: "Line one.\nLine two.\nLine three.",
        }),
      ];
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread[0].text).toBe(thread[0].text);
      editor2.destroy();
      destroy();
    });

    it("handles very long thread (many replies)", () => {
      const thread = [makeThreadEntry()];
      for (let i = 0; i < 20; i++) {
        thread.push(
          makeReplyEntry({
            id: `reply-${i}`,
            text: `Reply number ${i + 1}`,
            createdAt: `2026-07-10T${String(i).padStart(2, "0")}:00:00Z`,
          }),
        );
      }
      editor = createTestEditor([CommentBlock], makeCommentDoc(thread));

      const html = editor.getHTML();
      const editor2 = createTestEditor([CommentBlock], html);
      const node = getCommentNode(editor2);

      expect(node?.attrs?.thread).toHaveLength(21);
      expect(node?.attrs?.thread[0].id).toBe("abc-123");
      expect(node?.attrs?.thread[20].id).toBe("reply-19");
      editor2.destroy();
      destroy();
    });
  });

  // ── HTML parse ───────────────────────────────────────────────────────

  describe("parseHTML", () => {
    it("parses a div with data-type='eln-comment'", () => {
      const thread = [makeThreadEntry()];
      const html = `<div data-type="eln-comment" data-resolved="false" data-thread='${JSON.stringify(thread)}'></div>`;
      editor = createTestEditor([CommentBlock], html);

      const node = getCommentNode(editor);

      expect(node?.type).toBe("elnComment");
      expect(node?.attrs?.resolved).toBe(false);
      expect(node?.attrs?.thread).toEqual(thread);
      destroy();
    });

    it("parses resolved attribute from HTML", () => {
      const thread = [makeThreadEntry()];
      const html = `<div data-type="eln-comment" data-resolved="true" data-thread='${JSON.stringify(thread)}'></div>`;
      editor = createTestEditor([CommentBlock], html);

      const node = getCommentNode(editor);

      expect(node?.attrs?.resolved).toBe(true);
      destroy();
    });

    it("parses thread with replies from HTML", () => {
      const thread = [makeThreadEntry(), makeReplyEntry()];
      const html = `<div data-type="eln-comment" data-resolved="false" data-thread='${JSON.stringify(thread)}'></div>`;
      editor = createTestEditor([CommentBlock], html);

      const node = getCommentNode(editor);

      expect(node?.attrs?.thread).toEqual(thread);
      expect(node?.attrs?.thread).toHaveLength(2);
      destroy();
    });

    it("handles malformed thread data gracefully", () => {
      const html =
        '<div data-type="eln-comment" data-resolved="false" data-thread="not-json"></div>';
      editor = createTestEditor([CommentBlock], html);

      const node = getCommentNode(editor);

      expect(node?.attrs?.thread).toEqual([]);
      destroy();
    });
  });
});
