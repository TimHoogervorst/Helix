/**
 * ElnEditor — rich-text editor for ELN entries.
 *
 * Composes:
 *   - useEntryEditor    — state machine hook (CRUD, dirty tracking, beforeunload)
 *   - createElnExtensions — TipTap extension factory
 *   - formatDate        — shared date formatter
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { EMPTY_DOC, type TipTapDoc } from "../types/eln";
import { useEntryEditor } from "../hooks/useEntryEditor";
import { createElnExtensions } from "../extensions/createElnExtensions";
import ReferenceBadge from "./ReferenceBadge";
import { formatDate } from "../utils/format";

interface ElnEditorProps {
  entryId?: string;
}

/** Editor component — ReferenceProvider is provided by Layout. */
function ElnEditor({ entryId }: ElnEditorProps) {
  const navigate = useNavigate();
  const isNew = entryId === undefined;

  // ── Content ref (synced on every editor update and on every render) ──
  const contentRef = useRef<TipTapDoc>(EMPTY_DOC);

  // ── TipTap Editor ──
  const editor = useEditor({
    extensions: createElnExtensions(),
    content: isNew
      ? EMPTY_DOC
      : { type: "doc", content: [{ type: "paragraph" }] },
    editable: isNew,
    editorProps: {
      attributes: {
        class: "ProseMirror",
      },
    },
    // Keep contentRef in sync on every editor update, even when React
    // suppresses re-renders (useEditorState selector returns null by
    // default, so ElnEditor does NOT re-render on transactions).
    onUpdate: ({ editor }) => {
      contentRef.current = editor.getJSON() as TipTapDoc;
    },
  });

  // Sync on every render to cover cases outside PM transactions
  // (e.g. initial editor creation, setContent in useEffect, mode transitions).
  // Redundant with onUpdate for normal edits but ensures contentRef is never stale.
  contentRef.current = editor?.getJSON() ?? EMPTY_DOC;

  // ── State machine ──
  const {
    mode,
    entry,
    title,
    setTitle,
    initialContent,
    folderId,
    setFolderId,
    folders,
    error,
    deleting,
    isDirty,
    save,
    cancel,
    deleteEntry,
    enterEditMode,
  } = useEntryEditor({ entryId, isNew, contentRef });

  // ── Sync editor with hook state ──
  useEffect(() => {
    if (!editor) return;
    const shouldEdit = mode === "edit-new" || mode === "edit-existing";
    editor.setEditable(shouldEdit);

    // When entering view mode, reset content to initial if it differs.
    // This handles both initial load (loading→view) and cancel (edit→view).
    if (
      mode === "view" &&
      JSON.stringify(editor.getJSON()) !== JSON.stringify(initialContent)
    ) {
      editor.commands.setContent(initialContent);
    }
  }, [mode, editor, initialContent]);

  // ── Render helpers ──

  const isEdit = mode === "edit-new" || mode === "edit-existing";
  const isSaving = mode === "saving";

  if (mode === "loading") {
    return <p className="empty">Loading…</p>;
  }

  if (mode === "error") {
    return (
      <div>
        <div className="error">{error}</div>
        <button onClick={() => navigate("/library")}>← Back to entries</button>
      </div>
    );
  }

  return (
    <div className={`editor-container${isSaving ? " saving" : ""}`}>
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
                <ReferenceBadge
                  displayId={entry.display_id}
                  clickable={false}
                  compact={true}
                  resolved={{
                    displayId: entry.display_id,
                    title: entry.title,
                    type: "entry",
                    id: entry.id,
                    icon: "📄",
                  }}
                />{" "}
                {entry.author_username && `by ${entry.author_username} · `}
                Last updated {formatDate(entry.updated_at)}
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
              <button onClick={save} disabled={isSaving || !title.trim()}>
                {isSaving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={cancel}
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
                onClick={deleteEntry}
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
        {editor && <EditorContent editor={editor} />}
      </div>
    </div>
  );
}

export default ElnEditor;
