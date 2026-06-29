/**
 * EditorBubbleMenu — formatting toolbar that floats above text selection.
 *
 * Renders 8 formatting buttons inside TipTap's `<BubbleMenu>`.
 * Extracted from ElnEditor.tsx where it was copy-pasted in two branches.
 */
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";

interface EditorBubbleMenuProps {
  editor: Editor;
}

function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  return (
    <BubbleMenu editor={editor} className="bubble-menu">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive("bold") ? "is-active" : ""}
        title="Bold"
        aria-label="Bold"
      >
        <Bold size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive("italic") ? "is-active" : ""}
        title="Italic"
        aria-label="Italic"
      >
        <Italic size={18} />
      </button>

      <span className="divider" />

      <button
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        className={
          editor.isActive("heading", { level: 1 }) ? "is-active" : ""
        }
        title="Heading 1"
        aria-label="Heading 1"
      >
        <Heading1 size={18} />
      </button>
      <button
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        className={
          editor.isActive("heading", { level: 2 }) ? "is-active" : ""
        }
        title="Heading 2"
        aria-label="Heading 2"
      >
        <Heading2 size={18} />
      </button>
      <button
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        className={
          editor.isActive("heading", { level: 3 }) ? "is-active" : ""
        }
        title="Heading 3"
        aria-label="Heading 3"
      >
        <Heading3 size={18} />
      </button>

      <span className="divider" />

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive("bulletList") ? "is-active" : ""}
        title="Bullet list"
        aria-label="Bullet list"
      >
        <List size={18} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive("orderedList") ? "is-active" : ""}
        title="Numbered list"
        aria-label="Numbered list"
      >
        <ListOrdered size={18} />
      </button>

      <span className="divider" />

      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive("blockquote") ? "is-active" : ""}
        title="Blockquote"
        aria-label="Blockquote"
      >
        <Quote size={18} />
      </button>
    </BubbleMenu>
  );
}

export default EditorBubbleMenu;
