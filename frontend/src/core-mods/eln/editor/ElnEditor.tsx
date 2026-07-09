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
 * Action buttons (Save/Cancel/Edit/Delete/folder/status) are exposed via ref so
 * the parent (ElnDetail) can render them in the top toolbar as ghost icon buttons.
 */
import { useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { EMPTY_DOC, type TipTapDoc, type EntryDetail, type Tag } from "../types";
import { useEntryCrud } from "../hooks/useEntryCrud";
import { useEntryFolder, type Folder as FolderItem } from "../hooks/useEntryFolder";
import { useDirtyTracking } from "../hooks/useDirtyTracking";
import { createElnExtensions } from "./extensions/createElnExtensions";
import { useTaggableItems } from "../../../core-mods/tags/hooks";
import { TagPill } from "../../../core-mods/tags/ui";
import { TagAutocomplete } from "../../../core-mods/tags/ui";
import { attachTags, detachTag, acquireLock, releaseLock } from "../api";

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
  setFolderId: (id: number | null) => void;
  setStatus: (status: string) => void;
}

/** Snapshot of editor state pushed to parent via onStateChange. */
export interface ElnEditorState {
  mode: string;
  isEdit: boolean;
  isSaving: boolean;
  isDirty: boolean;
  deleting: boolean;
  /** Full entry data for the metadata panel (null for new entries). */
  entry: EntryDetail | null;
  /** Folders available for the folder picker. */
  folders: FolderItem[];
  /** Current folder ID (null if unset). */
  folderId: number | null;
  /** Current status value from the entry. */
  status: string;
  /** Current tags on the entry. */
  tags: Tag[];
  /** Current description text (first paragraph of TipTap content). */
  description: string;
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
  const [searchParams] = useSearchParams();
  // A "new" entry is one that was just created server-side and navigated
  // to with ?new=true. It's immediately editable with deferred tag collection.
  const isNew = searchParams.get("new") === "true";

  // ── Read initial folder from URL params (set when creating from library) ──
  const initialFolderId: number | null = (() => {
    const raw = searchParams.get("folderId");
    if (raw) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  })();

  // ── Content ref (synced on every editor update and on every render) ──
  const contentRef = useRef<TipTapDoc>(EMPTY_DOC);

  // ── Title ref (for contentEditable cursor preservation) ──
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  // ── Description textarea ref (for auto-resize) ──
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

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

  // ── State machine (composed from four focused hooks) ──
  const crud = useEntryCrud({ entryId, isNew, contentRef });
  const taggableItems = useTaggableItems({
    initialTags: crud.entry?.tags ?? [],
    attachFn: !isNew && entryId
      ? async (tagIds: number[]) => {
          const updated = await attachTags(entryId, tagIds);
          crud.setEntry(updated);
        }
      : undefined,
    detachFn: !isNew && entryId
      ? async (tagId: number) => {
          const updated = await detachTag(entryId, tagId);
          crud.setEntry(updated);
        }
      : undefined,
    deferred: isNew,
  });
  const folder = useEntryFolder({ initialFolderId });
  const { isDirty } = useDirtyTracking({
    title: crud.title,
    initialTitle: crud.initialTitle,
    description: crud.description,
    initialDescription: crud.initialDescription,
    status: crud.status,
    initialStatus: crud.initialStatus,
    contentRef,
    initialContent: crud.initialContent,
  });

  // Destructure for convenient access in JSX
  const {
    mode,
    entry,
    title,
    setTitle,
    initialContent,
    description,
    setDescription,
    status,
    setStatus,
    error,
    deleting,
  } = crud;

  const {
    tags,
    pendingTagIds,
    addTag,
    removeTag,
    resetToBaseline,
  } = taggableItems;

  const { folderId, setFolderId, folders } = folder;

  // Wire cross-hook actions
  // For new entries, batch pendingTagIds into the create payload.
  // (initialTags is always empty for new entries, so pendingTagIds === all tag IDs.)
  const save = () => crud.save(folderId, isNew ? pendingTagIds : []);
  const cancel = () => {
    if (isNew) {
      crud.cancel();
      return;
    }
    setFolderId(crud.entry?.folder ?? null);
    resetToBaseline();
    crud.cancel();
  };
  const { deleteEntry, enterEditMode } = crud;

  // ── Expose actions to parent via ref ──
  // Store latest callbacks in a ref so useImperativeHandle doesn't
  // re-attach on every render.
  const actionsRef = useRef({ save, cancel, deleteEntry, enterEditMode, setFolderId, setStatus });
  actionsRef.current = { save, cancel, deleteEntry, enterEditMode, setFolderId, setStatus };

  useImperativeHandle(ref, () => ({
    save: () => actionsRef.current.save(),
    cancel: () => actionsRef.current.cancel(),
    deleteEntry: () => actionsRef.current.deleteEntry(),
    enterEditMode: () => actionsRef.current.enterEditMode(),
    setFolderId: (id: number | null) => actionsRef.current.setFolderId(id),
    setStatus: (s: string) => actionsRef.current.setStatus(s),
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

  // ── Lock lifecycle (acquire on edit, release on unmount) ──
  const isEdit = mode === "edit-new" || mode === "edit-existing";
  const isSaving = mode === "saving";

  useEffect(() => {
    if (!entryId || !isEdit) return;

    acquireLock(entryId).catch(() => {
      // Lock acquisition failure is non-fatal — the backend enforces
      // the lock on write. A failed acquire here means either another
      // user holds the lock or a network error. The save will surface
      // the 423 if it matters.
    });

    return () => {
      releaseLock(entryId).catch(() => {
        // Best-effort release on unmount.
      });
    };
  }, [entryId, isEdit]);

  // Sync contentEditable h1 DOM when switching between view/edit modes or when
  // title changes externally (initial load, cancel). During typing, the title
  // and DOM are already in sync so the equality check skips the DOM write.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const desired = title || "Untitled";
    if (el.textContent !== desired) {
      el.textContent = desired;
    }
  }, [isEdit, title]);

  // Auto-resize description textarea to fit its content exactly.
  // Fires when description changes (typing, loading, cancel, mode switch).
  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    // Reset to auto so scrollHeight reflects the true content height,
    // then set to that height so there's no extra whitespace.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description, isEdit]);

  useEffect(() => {
    onStateChange?.({ mode, isEdit, isSaving, isDirty, deleting, entry, folders, folderId, status, tags, description });
  }, [mode, isEdit, isSaving, isDirty, deleting, entry, folders, folderId, status, tags, description, onStateChange]);

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
      {/* ── Status bar (save indicator only; action buttons are rendered
           by ElnDetail in the top toolbar). ── */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
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

      {/* Title — contentEditable h1 that stays in place across view/edit modes.
           A ref + useLayoutEffect prevents React from resetting cursor position
           during typing while keeping the same DOM element in both modes. */}
      <h1
        ref={(el) => {
          titleRef.current = el;
          // Autofocus new entries
          if (el && isEdit && isNew) {
            requestAnimationFrame(() => el.focus());
          }
        }}
        contentEditable={isEdit}
        suppressContentEditableWarning
        onInput={(e) => {
          if (isEdit) setTitle(e.currentTarget.textContent || "");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        onBlur={() => {
          if (title.trim() !== title) setTitle(title.trim());
        }}
        className="mb-3 font-serif text-[42px] font-semibold leading-[1.05] tracking-tight text-foreground outline-none empty:before:text-muted-foreground/30 empty:before:content-['Untitled']"
        data-testid="title-display"
      >
        {!isEdit ? (title || "Untitled") : null}
      </h1>

      {/* Description — first paragraph of TipTap content, inline-editable */}
      {isEdit ? (
        <textarea
          ref={descriptionRef}
          className="eln-description-textarea mb-3 w-full resize-none overflow-hidden text-[15px] leading-relaxed text-muted-foreground placeholder:text-muted-foreground/30"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description…"
          data-testid="description-input"
        />
      ) : (
        <p
          className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground"
          data-testid="description"
        >
          {description || (
            <span className="text-muted-foreground/40 italic">
              No description
            </span>
          )}
        </p>
      )}

      {/* Tags */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="tags-section">
        {tags.map((tag) => (
          <TagPill
            key={tag.id}
            tag={tag}
            onRemove={isEdit ? removeTag : undefined}
          />
        ))}

        {/* Tag autocomplete (edit mode only) */}
        {isEdit && (
          <TagAutocomplete
            attachedTagIds={tags.map((t) => t.id)}
            onTagSelect={addTag}
            onTagCreated={addTag}
            placeholder="Search tags…"
          />
        )}
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
