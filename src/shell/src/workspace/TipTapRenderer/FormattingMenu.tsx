import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { isTextSelection } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Italic, RemoveFormatting, Strikethrough } from "lucide-react";
import type { BlockBinding } from "../../mod-system/types";
import { Button } from "../../shared/primitives/Button";

interface FormattingMenuProps {
  editor: Editor;
  bindings: BlockBinding[];
  editable: boolean;
}

function selectionIsInExcludedNode(editor: Editor, bindings: BlockBinding[]) {
  const { selection } = editor.state;
  const excludedNames = new Set([
    ...bindings.map((binding) => binding.id),
    "table",
    "tableRow",
    "tableCell",
    "tableHeader",
  ]);

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    if (excludedNames.has(selection.$from.node(depth).type.name)) return true;
  }
  for (let depth = selection.$to.depth; depth > 0; depth -= 1) {
    if (excludedNames.has(selection.$to.node(depth).type.name)) return true;
  }

  let excluded = false;
  editor.state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (excludedNames.has(node.type.name)) excluded = true;
  });
  return excluded;
}

export function FormattingMenu({ editor, bindings, editable }: FormattingMenuProps) {
  const [, refresh] = useState(0);

  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  if (!editable) return null;

  const toggleMark = (mark: "bold" | "italic" | "strike" | "code") => {
    const chain = editor.chain().focus();
    if (mark === "bold") chain.toggleBold();
    if (mark === "italic") chain.toggleItalic();
    if (mark === "strike") chain.toggleStrike();
    if (mark === "code") chain.toggleCode();
    chain.run();
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="elnFormattingMenu"
      updateDelay={0}
      className="formatting-menu"
      aria-label="Formatting menu"
      shouldShow={({ state, view, element }) => {
        const { selection } = state;
        return (
          editable &&
          editor.isEditable &&
          isTextSelection(selection) &&
          !selection.empty &&
          (view.hasFocus() || element.contains(document.activeElement))
        ) && !selectionIsInExcludedNode(editor, bindings);
      }}
    >
      <div role="toolbar" aria-label="Formatting menu">
        {[1, 2, 3].map((level) => (
          <Button
            key={level}
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Heading ${level}`}
            aria-pressed={editor.isActive("heading", { level })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()}
          >
            H{level}
          </Button>
        ))}
        <Button type="button" size="sm" variant="ghost" aria-label="Bold" aria-pressed={editor.isActive("bold")} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark("bold")}><Bold size={14} aria-hidden="true" /></Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Italic" aria-pressed={editor.isActive("italic")} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark("italic")}><Italic size={14} aria-hidden="true" /></Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Strikethrough" aria-pressed={editor.isActive("strike")} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark("strike")}><Strikethrough size={14} aria-hidden="true" /></Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Inline code" aria-pressed={editor.isActive("code")} onMouseDown={(event) => event.preventDefault()} onClick={() => toggleMark("code")}><Code size={14} aria-hidden="true" /></Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Clear formatting" onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().unsetAllMarks().run()}><RemoveFormatting size={14} aria-hidden="true" /></Button>
      </div>
    </BubbleMenu>
  );
}
