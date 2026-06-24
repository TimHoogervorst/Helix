import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { get, post, put, del } from "../api/client";
import { EMPTY_DOC, type TipTapDoc, type EntryDetail } from "../types/eln";

interface Folder {
  id: number;
  name: string;
}

interface ElnEditorProps {
  entryId?: number;
}

type EditorMode = "loading" | "view" | "edit-new" | "edit-existing" | "saving" | "error";

function ElnEditor({ entryId }: ElnEditorProps) {
  const navigate = useNavigate();
  const isNew = entryId === undefined;

  // ── State ──
  const [mode, setMode] = useState<EditorMode>(isNew ? "edit-new" : "loading");
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [title, setTitle] = useState("");
  const [initialTitle, setInitialTitle] = useState("");
  const [initialContent, setInitialContent] = useState<TipTapDoc>(EMPTY_DOC);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Track if content was ever loaded so we don't reset the editor unnecessarily
  const contentLoaded = useRef(false);

  // ── TipTap Editor ──
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: "Start writing…",
      }),
    ],
    content: isNew ? EMPTY_DOC : { type: "doc", content: [{ type: "paragraph" }] },
    editable: isNew,
    editorProps: {
      attributes: {
        class: "ProseMirror",
      },
    },
  });

  // ── Derived ──
  const currentContent = editor?.getJSON() ?? EMPTY_DOC;
  const isDirty =
    title !== initialTitle ||
    JSON.stringify(currentContent) !== JSON.stringify(initialContent);

  // ── Fetch entry ──
  useEffect(() => {
    if (!entryId) return;

    setMode("loading");
    get<EntryDetail>(`/eln/entries/${entryId}/`)
      .then((data) => {
        setEntry(data);
        setTitle(data.title);
        setInitialTitle(data.title);
        setInitialContent(data.content);
        setFolderId(data.folder);
        setMode("view");
      })
      .catch((err) => {
        setError(err.message);
        setMode("error");
      });
  }, [entryId]);

  // ── Load content into editor when viewing or editing an existing entry ──
  useEffect(() => {
    if ((mode === "view" || mode === "edit-existing") && editor && !contentLoaded.current) {
      editor.commands.setContent(initialContent);
      contentLoaded.current = true;
    }
  }, [mode, editor, initialContent]);

  // ── Fetch folders ──
  useEffect(() => {
    get<Folder[]>("/core/folders/")
      .then(setFolders)
      .catch(() => {}); // Silently fail — folder selector just won't populate
  }, []);

  // ── Toggle editable ──
  useEffect(() => {
    if (!editor) return;
    const shouldEdit = mode === "edit-new" || mode === "edit-existing";
    editor.setEditable(shouldEdit);
  }, [mode, editor]);

  // ── Unsaved changes guard ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ── Actions ──

  const enterEditMode = useCallback(() => {
    setMode("edit-existing");
  }, []);

  const handleCancel = useCallback(() => {
    if (isNew) {
      navigate("/eln");
      return;
    }
    // Revert and go back to view
    setTitle(initialTitle);
    if (editor) {
      editor.commands.setContent(initialContent);
      editor.setEditable(false);
    }
    setFolderId(entry?.folder ?? null);
    contentLoaded.current = false;
    setMode("view");
  }, [isNew, initialTitle, initialContent, editor, navigate, entry]);

  const handleSave = useCallback(async () => {
    if (!title.trim() || !editor) return;

    setMode("saving");
    setError(null);

    const payload = {
      title: title.trim(),
      content: editor.getJSON(),
      folder: folderId,
    };

    try {
      if (isNew) {
        const created = await post<{ id: number }>("/eln/entries/", payload);
        navigate(`/eln/${created.id}`);
      } else {
        await put(`/eln/entries/${entryId!}/`, payload);
        setInitialTitle(title.trim());
        setInitialContent(editor.getJSON());
        contentLoaded.current = false;
        setMode("view");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setMode(isNew ? "edit-new" : "edit-existing");
    }
  }, [title, editor, folderId, isNew, entryId, navigate]);

  const handleDelete = useCallback(async () => {
    if (!entryId || !window.confirm("Delete this entry permanently?")) return;

    setDeleting(true);
    setError(null);
    try {
      await del(`/eln/entries/${entryId}/`);
      navigate("/eln");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }, [entryId, navigate]);

  // ── Format helpers ──

  const formatDate = (iso: string) => new Date(iso).toLocaleString();

  // ── Render ──

  const isEdit = mode === "edit-new" || mode === "edit-existing";
  const isSaving = mode === "saving";

  // ── Loading ──
  if (mode === "loading") {
    return <p className="empty">Loading…</p>;
  }

  // ── Error ──
  if (mode === "error") {
    return (
      <div>
        <div className="error">{error}</div>
        <button onClick={() => navigate("/eln")}>← Back to entries</button>
      </div>
    );
  }

  return (
    <div className={`editor-container${isSaving ? " saving" : ""}`}>
      {/* ── Paper Page ── */}
      <div className="paper-page">
        {/* ── Top Bar ── */}
        <div className="editor-top-bar">
          <div className="title-col">
            {isEdit ? (
              <input
                className="title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled"
                autoFocus={isNew}
              />
            ) : (
              <h1 className="title-display">{title || "Untitled"}</h1>
            )}

            <div className="meta-row">
              {entry && (
                <>
                  <span className="eln-badge">{entry.display_id}</span>{" "}
                  {entry.author_username && `by ${entry.author_username} · `}
                  Created {formatDate(entry.created_at)}
                  {entry.updated_at !== entry.created_at &&
                    ` · Updated ${formatDate(entry.updated_at)}`}
                </>
              )}
              {isNew && "New entry"}
            </div>
          </div>

          <div className="actions">
            {isNew && folders.length > 0 && (
              <select
                value={folderId ?? ""}
                onChange={(e) =>
                  setFolderId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">Folder…</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}

            {isEdit ? (
              <>
                <span className={`save-indicator${isDirty ? " is-dirty" : ""}`}>
                  {isDirty ? "Unsaved changes" : "Saved"}
                </span>
                <button onClick={handleSave} disabled={isSaving || !title.trim()}>
                  {isSaving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  style={{
                    background: "transparent",
                    color: "var(--gray-700)",
                    border: "1px solid var(--gray-300)",
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={enterEditMode}>Edit</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    background: "transparent",
                    color: "#dc2626",
                    border: "1px solid #fecaca",
                  }}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Error banner ── */}
        {error && <div className="error">{error}</div>}

        {/* ── Editor Content ── */}
        <div
          className={`editor-content${!isEdit ? " view-mode" : ""}`}
          onClick={() => {
            if (!isEdit && mode === "view") {
              enterEditMode();
            }
          }}
        >
          {editor && (
            <>
              {isEdit && (
                <BubbleMenu
                  editor={editor}
                  className="bubble-menu"
                >
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
                    onClick={() =>
                      editor.chain().focus().toggleBulletList().run()
                    }
                    className={editor.isActive("bulletList") ? "is-active" : ""}
                    title="Bullet list"
                  >
                    •≡
                  </button>
                  <button
                    onClick={() =>
                      editor.chain().focus().toggleOrderedList().run()
                    }
                    className={editor.isActive("orderedList") ? "is-active" : ""}
                    title="Numbered list"
                  >
                    1≡
                  </button>

                  <span className="divider" />

                  <button
                    onClick={() =>
                      editor.chain().focus().toggleBlockquote().run()
                    }
                    className={editor.isActive("blockquote") ? "is-active" : ""}
                    title="Blockquote"
                  >
                    "
                  </button>
                </BubbleMenu>
              )}
              <EditorContent editor={editor} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ElnEditor;
