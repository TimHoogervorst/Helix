import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type TipTapDoc, EMPTY_DOC } from "../types/eln";

interface ContentPreviewProps {
  content: TipTapDoc | null;
}

/**
 * Read-only TipTap editor for previewing entry content.
 * Uses only StarterKit (headings, lists, blockquote, code, bold/italic)
 * — no Reference, LimsTable, SlashCommands, or interactive extensions.
 */
function ContentPreview({ content }: ContentPreviewProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
    ],
    content: content ?? EMPTY_DOC,
    editable: false,
    editorProps: {
      attributes: {
        class: "ProseMirror",
      },
    },
  });

  if (!content) {
    return <p className="empty">No content to preview.</p>;
  }

  if (!editor) {
    return <p className="empty">Loading preview…</p>;
  }

  return (
    <div className="library-content-preview">
      <EditorContent editor={editor} />
    </div>
  );
}

export default ContentPreview;
