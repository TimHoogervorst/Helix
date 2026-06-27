/**
 * EditorBubbleMenu — formatting toolbar that floats above text selection.
 *
 * Renders 9 formatting buttons inside TipTap's `<BubbleMenu>`.
 * Extracted from ElnEditor.tsx where it was copy-pasted in two branches.
 */
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";

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
      >
        B
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive("italic") ? "is-active" : ""}
        title="Italic"
      >
        <em>I</em>
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
      >
        H<span className="heading-level">1</span>
      </button>
      <button
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        className={
          editor.isActive("heading", { level: 2 }) ? "is-active" : ""
        }
        title="Heading 2"
      >
        H<span className="heading-level">2</span>
      </button>
      <button
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        className={
          editor.isActive("heading", { level: 3 }) ? "is-active" : ""
        }
        title="Heading 3"
      >
        H<span className="heading-level">3</span>
      </button>

      <span className="divider" />

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive("bulletList") ? "is-active" : ""}
        title="Bullet list"
      >
        •≡
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive("orderedList") ? "is-active" : ""}
        title="Numbered list"
      >
        1≡
      </button>

      <span className="divider" />

      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive("blockquote") ? "is-active" : ""}
        title="Blockquote"
      >
        "
      </button>
    </BubbleMenu>
  );
}

export default EditorBubbleMenu;
