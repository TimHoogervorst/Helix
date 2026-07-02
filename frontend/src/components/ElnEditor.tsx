/**
 * ElnEditor — rich-text editor for ELN entries.
 *
 * Composes:
 *   - useEntryEditor    — state machine hook (CRUD, dirty tracking, beforeunload)
 *   - createElnExtensions — TipTap extension factory
 *
 * Content layout (PRD #4):
 *   Status bar → Metadata line → Title → Description → Tags → Divider → ProseMirror
 *
 * Action buttons (Save/Cancel/Edit/Delete) are exposed via ref so the parent
 * (ElnDetail) can render them in the top toolbar as ghost icon buttons.
 */
import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useNavigate } from "react-router-dom";
import { Dna } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import { EMPTY_DOC, type TipTapDoc } from "../types/eln";
import { useEntryEditor } from "../hooks/useEntryEditor";
import { createElnExtensions } from "../extensions/createElnExtensions";

/** Format an ISO date string as YYYY-MM-DD. */
function formatDateShort(iso: string): string {
  return new Date(iso).toISOString().split("T")[0];
}

/** Public handle exposed to parent components via ref. */
export interface ElnEditorHandle {
  save: () => void;
  cancel: () => void;
  deleteEntry: () => void;
  enterEditMode: () => void;
}

/** Snapshot of editor state pushed to parent via onStateChange. */
export interface ElnEditorState {
  mode: string;
  isEdit: boolean;
  isSaving: boolean;
  isDirty: boolean;
  deleting: boolean;
}

interface ElnEditorProps {
  entryId?: string;
  /** Called whenever editor mode/state changes so the parent can render
   *  the correct action buttons (Save/Cancel vs Edit/Delete). */
  onStateChange?: (state: ElnEditorState) => void;
}

/** Editor component — ReferenceProvider is provided by Layout.
 *  Action buttons are exposed via ref so the parent can render them in
 *  the top toolbar. */
const ElnEditor = forwardRef<ElnEditorHandle, ElnEditorProps>(
  function ElnEditor({ entryId, onStateChange }, ref) {
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

  // ── Expose actions to parent via ref ──
  // Store latest callbacks in a ref so useImperativeHandle doesn't
  // re-attach on every render.
  const actionsRef = useRef({ save, cancel, deleteEntry, enterEditMode });
  actionsRef.current = { save, cancel, deleteEntry, enterEditMode };

  useImperativeHandle(ref, () => ({
    save: () => actionsRef.current.save(),
    cancel: () => actionsRef.current.cancel(),
    deleteEntry: () => actionsRef.current.deleteEntry(),
    enterEditMode: () => actionsRef.current.enterEditMode(),
  }), []);

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

  // ── Notify parent of state changes ──
  const isEdit = mode === "edit-new" || mode === "edit-existing";
  const isSaving = mode === "saving";

  useEffect(() => {
    onStateChange?.({ mode, isEdit, isSaving, isDirty, deleting });
  }, [mode, isEdit, isSaving, isDirty, deleting, onStateChange]);

  // ── Render ──

  if (mode === "loading") {
    return <p className="text-center text-muted-foreground py-12">Loading…</p>;
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
    <div className={isSaving ? "pointer-events-none opacity-60" : ""}>
      {/* ── Status bar (folder selector + save indicator only; action
           buttons are rendered by ElnDetail in the top toolbar). ── */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isNew && folders.length > 0 && (
            <select
              value={folderId ?? ""}
              onChange={(e) =>
                setFolderId(e.target.value ? Number(e.target.value) : null)
              }
              className="!w-auto !min-w-[140px]"
            >
              <option value="">Folder…</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}

          {isEdit && (
            <span
              className={`text-xs ${isDirty ? "text-primary" : "text-muted-foreground"}`}
            >
              {isDirty ? "Unsaved changes" : "Saved"}
            </span>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && <div className="error">{error}</div>}

      {/* ── Content area ── */}

      {/* Metadata line */}
      <div
        className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"
        data-testid="metadata-line"
      >
        {entry ? (
          <>
            {entry.display_id}
            {" · "}
            Created {formatDateShort(entry.created_at)}
            {" · "}
            Updated {formatDateShort(entry.updated_at)}
            {" · "}v0.4{" · "}
            autosaved 2s ago
          </>
        ) : (
          "New entry"
        )}
      </div>

      {/* Title */}
      {isEdit ? (
        <input
          className="mb-3 w-full bg-transparent font-serif text-[42px] font-semibold leading-[1.05] tracking-tight text-foreground placeholder:text-muted-foreground/30 outline-none"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          autoFocus={isNew}
          data-testid="title-input"
        />
      ) : (
        <h1
          className="mb-3 font-serif text-[42px] font-semibold leading-[1.05] tracking-tight text-foreground"
          data-testid="title-display"
        >
          {title || "Untitled"}
        </h1>
      )}

      {/* Description placeholder */}
      <p
        className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground"
        data-testid="description"
      >
        Third iteration of the sgRNA screen using the SpCas9-HF1 variant, with
        off-target analysis across three guide sequences and two cell lines.
      </p>

      {/* Tags placeholder */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="tags-section">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-enzyme-foreground/20 bg-enzyme px-2 py-0.5 font-mono text-[0.72rem] text-enzyme-foreground"
          title="Placeholder — tags coming soon"
        >
          <Dna className="h-3.5 w-3.5" aria-hidden="true" />
          SpCas9-HF1
        </span>
      </div>

      {/* Hairline divider */}
      <div className="my-6 h-px bg-hairline" data-testid="content-divider" />

      {/* ── ProseMirror Content ── */}
      <div
        className={`min-h-[60vh]${!isEdit ? " cursor-text" : ""}`}
        onClick={() => {
          if (!isEdit && mode === "view") {
            enterEditMode();
          }
        }}
        data-testid="prosemirror-wrapper"
      >
        {editor && <EditorContent editor={editor} />}
      </div>
    </div>
  );
});

export default ElnEditor;
