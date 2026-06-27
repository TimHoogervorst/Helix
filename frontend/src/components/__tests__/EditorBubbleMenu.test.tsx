/**
 * Tests for EditorBubbleMenu — the floating formatting toolbar.
 *
 * The BubbleMenu plugin uses a 250ms updateDelay setTimeout to debounce
 * show/hide. We use fake timers so we can flush the debounce synchronously.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Editor } from "@tiptap/core";
import EditorBubbleMenu from "../EditorBubbleMenu";

describe("EditorBubbleMenu", () => {
  const editors: Editor[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom doesn't implement getClientRects on Range, which ProseMirror
    // needs for posToDOMRect → coordsAtPos → singleRect during BubbleMenu positioning.
    if (!Range.prototype.getClientRects) {
      Object.defineProperty(Range.prototype, "getClientRects", {
        value: () => ({
          length: 1,
          item: () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }),
          0: { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 },
        }),
        configurable: true,
      });
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const editor of editors.splice(0)) {
      editor.destroy();
    }
  });

  function makeEditor() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const editor = new Editor({
      element: el,
      extensions: [StarterKit],
      content: "<p>Hello World</p>",
    });
    editors.push(editor);
    return editor;
  }

  function renderMenu(editor: Editor) {
    return render(
      <>
        <EditorBubbleMenu editor={editor} />
        <EditorContent editor={editor} />
      </>,
    );
  }

  /** Focus the editor DOM element and set a non-empty selection so the BubbleMenu appears. */
  function selectText(editor: Editor) {
    act(() => {
      // Focus via DOM (avoids ProseMirror's scrollIntoView which needs getClientRects)
      const dom = editor.view.dom;
      dom.focus();
      editor.commands.setTextSelection({ from: 1, to: 6 });
    });
    // Flush the BubbleMenu plugin's 250ms updateDelay setTimeout
    act(() => {
      vi.advanceTimersByTime(300);
    });
  }

  it("renders without crashing", () => {
    const editor = makeEditor();
    const { container } = renderMenu(editor);
    expect(container).toBeTruthy();
  });

  it("renders buttons when text is selected", () => {
    const editor = makeEditor();
    renderMenu(editor);
    selectText(editor);

    expect(screen.getByTitle("Bold")).toBeDefined();
    expect(screen.getByTitle("Italic")).toBeDefined();
  });

  it("toggles bold when Bold button is clicked", () => {
    const editor = makeEditor();
    renderMenu(editor);
    selectText(editor);

    const boldBtn = screen.getByTitle("Bold");
    fireEvent.click(boldBtn);

    expect(editor.isActive("bold")).toBe(true);

    fireEvent.click(boldBtn);
    expect(editor.isActive("bold")).toBe(false);
  });

  it("toggles italic when Italic button is clicked", () => {
    const editor = makeEditor();
    renderMenu(editor);
    selectText(editor);

    const italicBtn = screen.getByTitle("Italic");
    fireEvent.click(italicBtn);

    expect(editor.isActive("italic")).toBe(true);
  });

  it("toggles heading 1 when H1 button is clicked", () => {
    const editor = makeEditor();
    renderMenu(editor);
    selectText(editor);

    const h1Btn = screen.getByTitle("Heading 1");
    fireEvent.click(h1Btn);

    expect(editor.isActive("heading", { level: 1 })).toBe(true);
  });

  it("toggles heading 2 when H2 button is clicked", () => {
    const editor = makeEditor();
    renderMenu(editor);
    selectText(editor);

    const h2Btn = screen.getByTitle("Heading 2");
    fireEvent.click(h2Btn);

    expect(editor.isActive("heading", { level: 2 })).toBe(true);
  });

  it("toggles heading 3 when H3 button is clicked", () => {
    const editor = makeEditor();
    renderMenu(editor);
    selectText(editor);

    const h3Btn = screen.getByTitle("Heading 3");
    fireEvent.click(h3Btn);

    expect(editor.isActive("heading", { level: 3 })).toBe(true);
  });

  it("toggles bullet list when bullet list button is clicked", () => {
    const editor = makeEditor();
    renderMenu(editor);
    selectText(editor);

    const bulletBtn = screen.getByTitle("Bullet list");
    fireEvent.click(bulletBtn);

    expect(editor.isActive("bulletList")).toBe(true);
  });

  it("toggles ordered list when numbered list button is clicked", () => {
    const editor = makeEditor();
    renderMenu(editor);
    selectText(editor);

    const orderedBtn = screen.getByTitle("Numbered list");
    fireEvent.click(orderedBtn);

    expect(editor.isActive("orderedList")).toBe(true);
  });

  it("toggles blockquote when blockquote button is clicked", () => {
    const editor = makeEditor();
    renderMenu(editor);
    selectText(editor);

    const quoteBtn = screen.getByTitle("Blockquote");
    fireEvent.click(quoteBtn);

    expect(editor.isActive("blockquote")).toBe(true);
  });

  it("bold button shows active class when bold is active", () => {
    const editor = makeEditor();
    const { rerender } = renderMenu(editor);

    // Focus + select + flush to show the menu
    act(() => {
      const dom = editor.view.dom;
      dom.focus();
      editor.commands.setTextSelection({ from: 1, to: 6 });
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Click Bold — this modifies editor state but doesn't trigger React re-render
    const boldBtn = screen.getByTitle("Bold");
    fireEvent.click(boldBtn);

    // Force re-render so className picks up editor.isActive("bold")
    rerender(
      <>
        <EditorBubbleMenu editor={editor} />
        <EditorContent editor={editor} />
      </>,
    );

    expect(screen.getByTitle("Bold").className).toContain("is-active");
  });
});
