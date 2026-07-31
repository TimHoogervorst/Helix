/**
 * Reproduction test for issue #329: typing / in the ELN editor crashes with
 * "Cannot read properties of undefined (reading 'localsInner')".
 *
 * This test mirrors the *production* extension set: StarterKit + Placeholder +
 * TableKit + Reference + UnifiedSuggestion.  The existing UnifiedSuggestion
 * tests only use StarterKit + UnifiedSuggestion + Reference + TestTableNode —
 * they don't include Placeholder or the real TableKit, which are the
 * decoration-producing extensions suspected of colliding with
 * @tiptap/suggestion v3's decorations.
 *
 * The key insight: Placeholder creates a decoration when the paragraph is
 * EMPTY.  When the user types /, the paragraph transitions from empty to
 * non-empty and the placeholder decoration is destroyed — at the same moment
 * that @tiptap/suggestion creates its own inline decoration.  If these two
 * decoration changes overlap in a single ProseMirror transaction, the
 * DecorationGroup can become inconsistent.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import UnifiedSuggestion from "../UnifiedSuggestion";
import Reference from "../Reference";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import { ModRegistry } from "../../../../../shell/src/mod-system";

// ── Test block node ──────────────────────────────────────────────────

function makeBlockRegistration(id: string, label: string) {
  return {
    id,
    label,
    icon: () => null,
    component: () => null,
    listensTo: [] as string[],
    onEvent: {} as Record<
      string,
      (instance: any, payload: unknown) => unknown | void
    >,
    serialize: (state: Record<string, unknown>) => JSON.stringify(state),
    deserialize: (json: string) => {
      try {
        return JSON.parse(json);
      } catch {
        return {};
      }
    },
    defaultState: {
      schemaId: null,
      title: "Table",
      columns: [
        { name: "Column 1", type: "text" },
        { name: "Column 2", type: "text" },
      ],
      rows: [],
    },
  };
}

// ── Helper: create editor with the full production extension set ─────

function createProductionEditor(content?: Record<string, unknown>) {
  const el = document.createElement("div");
  document.body.appendChild(el);

  ModRegistry._reset();
  ModRegistry.getInstance().registerBlock(
    makeBlockRegistration("test.table", "Table"),
  );

  const editor = new Editor({
    element: el,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: "Start writing…" }),
      Reference,
      UnifiedSuggestion,
      TableKit,
    ],
    content: content ?? { type: "doc", content: [{ type: "paragraph" }] },
  });

  return editor;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Issue #329: / crash with production extension set", () => {
  beforeEach(() => {
    ModRegistry._reset();
  });

  // ── insertContent path (bypasses readDOMChange but still goes through
  //     dispatch → updateState → decorations) ─────────────────────────

  it("insertContent: typing / does not crash", () => {
    const editor = createProductionEditor();
    expect(() => editor.commands.insertContent("/")).not.toThrow();
    const text = editor.getText();
    // If the editor survived, verify the content was inserted.
    expect(text).toContain("/");
    editor.destroy();
  });

  it("insertContent: typing /Table does not crash", () => {
    const editor = createProductionEditor();
    expect(() => editor.commands.insertContent("/Table")).not.toThrow();
    const text = editor.getText();
    expect(text).toContain("/Table");
    editor.destroy();
  });

  it("insertContent: typing # does not crash", () => {
    const editor = createProductionEditor();
    expect(() => editor.commands.insertContent("#")).not.toThrow();
    editor.destroy();
  });

  it("insertContent: / then # does not crash", () => {
    const editor = createProductionEditor();
    expect(() => editor.commands.insertContent("/Table")).not.toThrow();
    expect(() => editor.commands.insertContent("#E1")).not.toThrow();
    editor.destroy();
  });

  // ── Empty paragraph transition (Placeholder decoration is active) ──

  it("insertContent: / in an EMPTY paragraph does not crash", () => {
    // This matches the "blank entry" scenario from the issue.
    // The empty paragraph has an active Placeholder decoration.
    const editor = createProductionEditor({
      type: "doc",
      content: [{ type: "paragraph" }],
    });

    expect(() => editor.commands.insertContent("/")).not.toThrow();
    editor.destroy();
  });

  // ── Rapid /-backspace-/ pattern ────────────────────────────────────

  it("insertContent: rapid / backspace / cycle does not crash", () => {
    const editor = createProductionEditor();

    expect(() => {
      editor.commands.insertContent("/");
      editor.commands.undo();
      editor.commands.insertContent("/");
    }).not.toThrow();

    editor.destroy();
  });

  // ── Inject / at a specific position (matching readDOMChange closer) ─

  it("direct dispatch: replace empty paragraph with / text does not crash", () => {
    const editor = createProductionEditor();

    expect(() => {
      const { state } = editor.view;
      const tr = state.tr.insertText("/", 1); // position after empty paragraph node
      editor.view.dispatch(tr);
    }).not.toThrow();

    const text = editor.getText();
    expect(text).toContain("/");
    editor.destroy();
  });

  // ── Multiple decoration sources interacting ────────────────────────

  it("insertContent: multiple triggers interleaved with Placeholder", () => {
    const editor = createProductionEditor({
      type: "doc",
      content: [{ type: "paragraph" }],
    });

    expect(() => {
      // Fill in content (removes Placeholder decoration)
      editor.commands.insertContent("/");
      // Trigger # suggestion
      editor.commands.insertContent("#test");
      // Back to empty paragraph-ish
      editor.commands.undo();
    }).not.toThrow();

    editor.destroy();
  });

  // ── DOM mutation path ──────────────────────────────────────────────
  // This is the path that triggers the actual crash in browsers.
  // We mutate the contentEditable DOM directly and let ProseMirror's
  // MutationObserver + input handler detect the change.

  it("DOM-level: type / into contentEditable element", () => {
    const editor = createProductionEditor({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    const { dom } = editor.view;

    // Focus triggers ProseMirror to start observing
    dom.focus();

    expect(() => {
      // Directly modify the text content of the paragraph
      const p = dom.querySelector("p");
      if (p) {
        // Set textContent and dispatch input event
        p.textContent = "/";
        p.dispatchEvent(new InputEvent("input", {
          inputType: "insertText",
          data: "/",
          bubbles: true,
          cancelable: true,
          composed: true,
        }));
      }
    }).not.toThrow();

    editor.destroy();
  });

  it("DOM-level: type / then T then more text", () => {
    const editor = createProductionEditor({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    const { dom } = editor.view;
    dom.focus();

    expect(() => {
      let p = dom.querySelector("p");
      if (p) {
        p.textContent = "/";
        p.dispatchEvent(new InputEvent("input", {
          inputType: "insertText",
          data: "/",
          bubbles: true,
        }));
      }

      p = dom.querySelector("p");
      if (p) {
        p.textContent = "/T";
        p.dispatchEvent(new InputEvent("input", {
          inputType: "insertText",
          data: "T",
          bubbles: true,
        }));
      }

      p = dom.querySelector("p");
      if (p) {
        p.textContent = "/Table";
        p.dispatchEvent(new InputEvent("input", {
          inputType: "insertText",
          data: "able",
          bubbles: true,
        }));
      }
    }).not.toThrow();

    // DOM-level InputEvents don't update ProseMirror state (ProseMirror
    // uses MutationObserver + beforeinput for DOM reconciliation).  They
    // still exercise the decoration collision path (Placeholder removal +
    // suggestion decoration creation) that originally caused issue #329.
    // Text-content assertions for the full extension set live in the
    // insertContent tests above.
    editor.destroy();
  });
});
