import { fireEvent, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { BlockControls } from "../TipTapRenderer/BlockControls";

const editors: Editor[] = [];

function createEditor() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [StarterKit],
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "one" }] },
        { type: "paragraph", content: [{ type: "text", text: "two" }] },
        { type: "paragraph" },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

function renderControls(editor: Editor) {
  return render(<BlockControls editor={editor} bindings={[]} editable />);
}

describe("Block Action Menu", () => {
  it("opens from a stationary handle and exposes edge-disabled movement", () => {
    const editor = createEditor();
    renderControls(editor);

    fireEvent.click(screen.getAllByRole("button", { name: "Block Handle" })[0]);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Move down" })).not.toBeDisabled();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getAllByRole("button", { name: "Block Handle" })[2]);
    expect(screen.getByRole("menuitem", { name: "Move down" })).toBeDisabled();
  });

  it("does not open the menu when the handle is dragged", () => {
    const editor = createEditor();
    renderControls(editor);
    const handle = screen.getAllByRole("button", { name: "Block Handle" })[0];

    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 20, clientY: 0 });
    fireEvent.pointerUp(document, { pointerId: 1 });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("duplicates and deletes the selected block, then closes after each action", () => {
    const editor = createEditor();
    renderControls(editor);
    const handle = screen.getAllByRole("button", { name: "Block Handle" })[1];

    fireEvent.click(handle);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(editor.state.doc.childCount).toBe(4);
    expect(editor.state.doc.child(1).textContent).toBe("two");
    expect(editor.state.doc.child(2).textContent).toBe("two");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Block Handle" })[1]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(editor.state.doc.child(1).textContent).toBe("two");
    expect(editor.state.doc.childCount).toBe(3);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("moves blocks and closes on Escape or outside click", () => {
    const editor = createEditor();
    renderControls(editor);

    fireEvent.click(screen.getAllByRole("button", { name: "Block Handle" })[1]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(editor.state.doc.child(1).textContent).toBe("");
    expect(editor.state.doc.child(2).textContent).toBe("two");

    fireEvent.click(screen.getAllByRole("button", { name: "Block Handle" })[1]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Block Handle" })[1]);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("toggles a discontiguous selection and clears it on Escape or text click", () => {
    const editor = createEditor();
    renderControls(editor);
    const handles = screen.getAllByRole("button", { name: "Block Handle" });

    fireEvent.click(handles[0], { shiftKey: true });
    fireEvent.click(handles[2], { shiftKey: true });
    expect(document.querySelectorAll(".block-controls-row.is-selected")).toHaveLength(2);
    expect(editor.view.dom.querySelectorAll(":scope > .is-block-selected")).toHaveLength(2);

    fireEvent.click(handles[0], { shiftKey: true });
    expect(document.querySelectorAll(".block-controls-row.is-selected")).toHaveLength(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelectorAll(".block-controls-row.is-selected")).toHaveLength(0);
    expect(editor.view.dom.querySelectorAll(":scope > .is-block-selected")).toHaveLength(0);

    fireEvent.click(handles[1], { shiftKey: true });
    fireEvent.click(editor.view.dom.children[0]);
    expect(document.querySelectorAll(".block-controls-row.is-selected")).toHaveLength(0);
  });

  it("applies menu actions to all selected blocks", () => {
    const editor = createEditor();
    renderControls(editor);
    const handles = screen.getAllByRole("button", { name: "Block Handle" });

    fireEvent.click(handles[0], { shiftKey: true });
    fireEvent.click(handles[2], { shiftKey: true });
    fireEvent.click(handles[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(editor.state.doc.childCount).toBe(1);
    expect(editor.state.doc.child(0).textContent).toBe("two");
  });

  it("duplicates and moves the selected group", () => {
    const editor = createEditor();
    renderControls(editor);
    let handles = screen.getAllByRole("button", { name: "Block Handle" });

    fireEvent.click(handles[0], { shiftKey: true });
    fireEvent.click(handles[2], { shiftKey: true });
    fireEvent.click(handles[0]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(editor.state.doc.childCount).toBe(5);

    handles = screen.getAllByRole("button", { name: "Block Handle" });
    fireEvent.click(handles[1], { shiftKey: true });
    fireEvent.click(handles[2], { shiftKey: true });
    fireEvent.click(handles[1]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
    expect(editor.state.doc.child(0).textContent).toBe("one");
    expect(editor.state.doc.child(1).textContent).toBe("two");
    expect(editor.state.doc.child(2).textContent).toBe("one");
  });

  it("suppresses controls when the editor is read-only", () => {
    const editor = createEditor();
    render(<BlockControls editor={editor} bindings={[]} editable={false} />);
    expect(screen.queryByLabelText("Block controls")).not.toBeInTheDocument();
  });
});
