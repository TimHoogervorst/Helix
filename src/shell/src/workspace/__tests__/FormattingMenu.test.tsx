import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TableKit } from "@tiptap/extension-table";
import { createTestEditor } from "../../test/factories";
import { FormattingMenu } from "../TipTapRenderer/FormattingMenu";

describe("FormattingMenu", () => {
  afterEach(() => cleanup());

  it("shows the formatting actions for a text selection and applies marks", async () => {
    const editor = createTestEditor([], {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    });
    render(<FormattingMenu editor={editor} bindings={[]} editable />);

    await act(async () => {
      editor.commands.setTextSelection({ from: 1, to: 6 });
      editor.view.focus();
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Bold" })).toBeVisible());
    expect(screen.getByRole("button", { name: "Heading 1" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(editor.getJSON().content?.[0].content?.[0]).toMatchObject({
      text: "Hello",
      marks: [{ type: "bold" }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Heading 2" }));
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });

    fireEvent.click(screen.getByRole("button", { name: "Clear formatting" }));
    expect(editor.getJSON().content?.[0].content?.[0]).not.toHaveProperty("marks");
    cleanup();
    editor.destroy();
  });

  it("does not show for read-only editors or table-cell selections", async () => {
    const readOnlyEditor = createTestEditor([], "<p>Hello</p>");
    const { unmount } = render(<FormattingMenu editor={readOnlyEditor} bindings={[]} editable={false} />);
    await act(async () => {
      readOnlyEditor.commands.setTextSelection({ from: 1, to: 6 });
      readOnlyEditor.view.focus();
    });
    expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();
    unmount();
    readOnlyEditor.destroy();

    const tableEditor = createTestEditor([TableKit], {
      type: "doc",
      content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }] }] }] }],
    });
    render(<FormattingMenu editor={tableEditor} bindings={[]} editable />);
    await act(async () => {
      tableEditor.commands.setTextSelection({ from: 3, to: 7 });
      tableEditor.view.focus();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("button", { name: "Bold" })).toBeNull();
    cleanup();
    tableEditor.destroy();
  });
});
