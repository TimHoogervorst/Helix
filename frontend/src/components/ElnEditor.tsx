/**
 * ElnEditor — rich-text editor for ELN entries.
 *
 * Composes:
 *   - useEntryEditor    — state machine hook (CRUD, dirty tracking, beforeunload)
 *   - createElnExtensions — TipTap extension factory
 *   - EditorBubbleMenu  — floating formatting toolbar
 *   - formatDate        — shared date formatter
 */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { EMPTY_DOC, type TipTapDoc } from "../types/eln";
import { useEntryEditor } from "../hooks/useEntryEditor";
import { createElnExtensions } from "../extensions/createElnExtensions";
import EditorBubbleMenu from "./EditorBubbleMenu";
import ReferenceBadge from "./ReferenceBadge";
import { formatDate } from "../utils/format";

interface ElnEditorProps {
  entryId?: string;
  /** When true, hides the title and folder selector for Library embedded use. */
  embedded?: boolean;
  /** Pre-select this folder when creating a new entry (Library new-entry flow). */
  initialFolderId?: number | null;
}

/** Editor component — ReferenceProvider is provided by Layout. */
function ElnEditor({ entryId, embedded = false, initialFolderId }: ElnEditorProps) {
  const navigate = useNavigate();
  const isNew = entryId === undefined;

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
  });

  // ── Content ref (synced before hook reads it) ──
  const contentRef = useRef<TipTapDoc>(EMPTY_DOC);
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
  } = useEntryEditor({ entryId, isNew, initialFolderId, contentRef });

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
    <div
      className={`editor-container${isSaving ? " saving" : ""}${embedded ? " is-embedded" : ""}`}
    >
      {embedded ? (
        /* ── Embedded: no paper-page, no title, no folder selector ── */
        <>
          {/* ── Error banner ── */}
          {error && <div className="error">{error}</div>}

          {/* ── Edit / Save / Cancel toolbar ── */}
          <div className="eln-embedded-toolbar">
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

          {/* ── Editor Content ── */}
          <div
            className={`editor-content${!isEdit ? " view-mode" : ""}`}
            onClick={() => {
              if (!isEdit && mode === "view") enterEditMode();
            }}
          >
            {editor && (
              <>
                {isEdit && <EditorBubbleMenu editor={editor} />}
                <EditorContent editor={editor} />
              </>
            )}
          </div>
        </>
      ) : (
        /* ── Normal (non-embedded) mode ── */
        <div className="eln-full-layout">
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
                  <span
                    className={`save-indicator${isDirty ? " is-dirty" : ""}`}
                  >
                    {isDirty ? "Unsaved changes" : "Saved"}
                  </span>
                  <button
                    onClick={save}
                    disabled={isSaving || !title.trim()}
                  >
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
            {editor && (
              <>
                {isEdit && <EditorBubbleMenu editor={editor} />}
                <EditorContent editor={editor} />
              </>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ElnEditor;
