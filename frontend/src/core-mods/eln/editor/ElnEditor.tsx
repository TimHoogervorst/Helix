/**
 * ElnEditor — rich-text editor for ELN entries (always-editable, auto-save).
 *
 * Composes:
 *   - useEntryCrud         — CRUD, save queue, lock lifecycle
 *   - useAutoSave           — debounced auto-save with initial-load suppression
 *   - createElnExtensions   — TipTap extension factory
 *
 * Content layout (PRD #4):
 *   Metadata line → Title → Description → Tags → Divider → ProseMirror
 *
 * Action buttons (MoreActions with Delete) are exposed via ref so the parent
 * (ElnWorkspace) can render them in the top toolbar.
 */
import { useState, useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import { Lock } from "lucide-react";
import { EMPTY_DOC, type TipTapDoc, type EntryDetail, type Tag } from "../types";
import { useEntryCrud } from "../hooks/useEntryCrud";
import { useAutoSave } from "../hooks/useAutoSave";
import { useEntryFolder, type Folder as FolderItem } from "../hooks/useEntryFolder";
import { useDirtyTracking } from "../hooks/useDirtyTracking";
import { createElnExtensions } from "./extensions/createElnExtensions";
import { useTaggableItems } from "../../../core-mods/tags/hooks";
import { TagPill } from "../../../core-mods/tags/ui";
import { TagAutocomplete } from "../../../core-mods/tags/ui";
import { attachTags, detachTag } from "../api";
import type { SaveStatus } from "../hooks/useSaveQueue";
import { splitFirstParagraph } from "../hooks/useEntryEditor";

/** Format an ISO date string as YYYY-MM-DD. */
function formatDateShort(iso: string): string {
  return new Date(iso).toISOString().split("T")[0];
}

/** Public handle exposed to parent components via ref. */
export interface ElnEditorHandle {
  save: () => void;
  deleteEntry: () => void;
  setFolderId: (id: number | null) => void;
  setStatus: (status: string) => void;
}

/** Snapshot of editor state pushed to parent via onStateChange. */
export interface ElnEditorState {
  isReady: boolean;
  isDirty: boolean;
  deleting: boolean;
  /** Current save-queue status. */
  saveStatus: SaveStatus;
  /** When the most recent successful save completed, or null. */
  lastSavedAt: Date | null;
  /** Number of items currently in the save queue. */
  queueLength: number;
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
  /** True when another user holds an active lock — entry is read-only. */
  isLockedByOther: boolean;
  /** Username of the lock holder, or null. */
  lockHeldBy: string | null;
}

interface ElnEditorProps {
  entryId?: string;
  /** Called whenever editor mode/state changes so the parent can render
   *  the correct action buttons (Save/Cancel vs Edit/Delete). */
  onStateChange?: (state: ElnEditorState) => void;
}

/** Editor component — ReferenceProvider is provided by Layout.
 *  Action buttons (MoreActions menu) are exposed via ref so the parent can
 *  render the Delete action in the top toolbar. */
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

  // ── Gate programmatic content changes so onUpdate does not trigger
  //     auto-save when content is loaded from the server (initial load).
  const isProgrammaticChange = useRef(false);

  // ── Track whether initial content has been loaded from the server.
  //     Prevents re-syncing editor content after save responses, which
  //     would overwrite user edits made during the save roundtrip.
  const initialContentLoaded = useRef(false);

  // ── contentVersion counter — incremented on every user-initiated TipTap
  //     onUpdate so effects (useAutoSave) can react to content changes
  //     without converting the entire document to state on every keystroke.
  //     Programmatic changes (setContent from server) are gated so they
  //     don't trigger a spurious auto-save on initial load.
  const [contentVersion, setContentVersion] = useState(0);

  // ── Title ref (for contentEditable cursor preservation) ──
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  // ── Description textarea ref (for auto-resize) ──
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

  // ── TipTap Editor — always editable ──
  const editor = useEditor({
    extensions: createElnExtensions(),
    content: isNew
      ? EMPTY_DOC
      : { type: "doc", content: [{ type: "paragraph" }] },
    editable: true,
    editorProps: {
      attributes: {
        class: "ProseMirror",
      },
    },
    onUpdate: ({ editor }) => {
      contentRef.current = editor.getJSON() as TipTapDoc;
      if (!isProgrammaticChange.current) {
        setContentVersion((v) => v + 1);
      }
    },
  });

  // Sync on every render to cover cases outside PM transactions
  // (e.g. initial editor creation, setContent in useEffect).
  contentRef.current = editor?.getJSON() ?? EMPTY_DOC;

  // ── Hooks ──
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

  // ── Derive baseline values from the last-saved entry ──
  const baseline = useMemo(() => {
    const saved = crud.entry;
    if (!saved) {
      return { title: "", description: "", content: EMPTY_DOC as TipTapDoc, status: "in_progress" };
    }
    const { description: d, body } = (() => {
      const doc = saved.content;
      if (!doc || typeof doc !== "object") return { description: "", body: EMPTY_DOC as TipTapDoc };
      const c = doc as Record<string, unknown>;
      const children = c.content;
      if (Array.isArray(children) && children.length > 0) {
        const first = children[0] as Record<string, unknown>;
        if (first && first.type === "paragraph") {
          const textContent = first.content as Array<Record<string, unknown>> | undefined;
          const desc = textContent ? textContent.map((t) => t.text || "").join("") : "";
          return { description: desc, body: { ...c, content: children.slice(1) } as TipTapDoc };
        }
      }
      return { description: "", body: doc as TipTapDoc };
    })();
    // Use body (document minus first paragraph) for initialContent so the
    // dirty-tracking comparison is apples-to-apples with contentRef.current
    // (which also holds only the body after initial setContent).
    return { title: saved.title, description: d, content: body, status: saved.status || "in_progress" };
  }, [crud.entry]);

  const { isDirty } = useDirtyTracking({
    title: crud.title,
    initialTitle: baseline.title,
    description: crud.description,
    initialDescription: baseline.description,
    status: crud.status,
    initialStatus: baseline.status,
    contentRef,
    initialContent: baseline.content,
    queueLength: crud.queueLength,
  });

  // ── Auto-save ──
  useAutoSave({
    entryId: entryId ?? crud.entry?.display_id,
    title: crud.title,
    description: crud.description,
    status: crud.status,
    contentVersion,
    folderId: folder.folderId,
    autoSave: crud.autoSave,
  });

  // Destructure for convenient access in JSX
  const {
    isReady,
    entry,
    title,
    setTitle,
    description,
    setDescription,
    status,
    setStatus,
    error,
    deleting,
    isLockedByOther,
    lockHeldBy,
    saveStatus,
    lastSavedAt,
    queueLength,
  } = crud;

  const {
    tags,
    pendingTagIds,
    addTag,
    removeTag,
  } = taggableItems;

  const { folderId, setFolderId, folders } = folder;

  // Wire cross-hook actions
  const save = () => crud.save(folderId, isNew ? pendingTagIds : []);
  const { deleteEntry } = crud;

  // ── Lock-based read-only ──
  // When another user holds the lock, the TipTap editor becomes non-editable.
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.setEditable(!isLockedByOther);
    }
  }, [editor, isLockedByOther]);

  // ── Expose actions to parent via ref ──
  const actionsRef = useRef({ save, deleteEntry, setFolderId, setStatus });
  actionsRef.current = { save, deleteEntry, setFolderId, setStatus };

  useImperativeHandle(ref, () => ({
    save: () => actionsRef.current.save(),
    deleteEntry: () => actionsRef.current.deleteEntry(),
    setFolderId: (id: number | null) => actionsRef.current.setFolderId(id),
    setStatus: (s: string) => actionsRef.current.setStatus(s),
  }), []);

  // ── Reset initial-content flag when entryId changes (navigating to a
  //     different entry).
  useEffect(() => {
    initialContentLoaded.current = false;
  }, [entryId]);

  // ── Sync editor content on initial load only ──
  // Does NOT sync after save responses — the editor is the source of truth
  // for content during editing. Syncing saved content back would overwrite
  // any user edits made during the save roundtrip and reset the cursor.
  //
  // Only the body (document minus the first paragraph, which is the
  // description) is loaded into the editor. The description is edited
  // separately in the textarea. prependDescription recombines them on save.
  useEffect(() => {
    if (!editor || !entry || initialContentLoaded.current) return;
    const { body } = splitFirstParagraph(entry.content);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(body)) {
      isProgrammaticChange.current = true;
      editor.commands.setContent(body);
      contentRef.current = body as TipTapDoc;
      isProgrammaticChange.current = false;
    }
    initialContentLoaded.current = true;
  }, [editor, entry]);

  // Sync contentEditable h1 DOM when title changes externally (initial load,
  // auto-save response). During typing, the title and DOM are already in sync
  // so the equality check skips the DOM write.
  // isReady is included so the effect fires on initial load even when title
  // is the empty string (which goes from "" to "" — no state change).
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const desired = title || "Untitled";
    if (el.textContent !== desired) {
      el.textContent = desired;
    }
  }, [title, isReady]);

  // Auto-resize description textarea to fit its content exactly.
  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  // ── Push state to parent ──
  useEffect(() => {
    onStateChange?.({
      isReady,
      isDirty,
      deleting,
      saveStatus,
      lastSavedAt,
      queueLength,
      entry,
      folders,
      folderId,
      status,
      tags,
      description,
      isLockedByOther,
      lockHeldBy,
    });
  }, [isReady, isDirty, deleting, saveStatus, lastSavedAt, queueLength, entry, folders, folderId, status, tags, description, isLockedByOther, lockHeldBy, onStateChange]);

  // ── Render: loading / error states ──

  if (!isReady && !error) {
    return <p className="text-center text-muted-foreground py-12">Loading…</p>;
  }

  if (error) {
    return (
      <div>
        <div className="error">{error}</div>
        <button onClick={() => navigate("/library")}>← Back to entries</button>
      </div>
    );
  }

  return (
    <div>
      {/* ── Locked banner ── */}
      {isLockedByOther && (
        <div
          className="mb-4 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-[13px] text-gray-600 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-200"
          data-testid="locked-banner"
        >
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This entry is currently being edited by{" "}
            <strong>{lockHeldBy || "another user"}</strong>. You are viewing it
            in read-only mode.
          </span>
        </div>
      )}

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
          </>
        ) : (
          "New entry"
        )}
      </div>

      {/* Title — contentEditable when not locked, plain text when locked */}
      <h1
        ref={(el) => {
          titleRef.current = el;
          // Autofocus new entries (only when not locked)
          if (el && isNew && !isLockedByOther) {
            requestAnimationFrame(() => el.focus());
          }
        }}
        contentEditable={!isLockedByOther}
        suppressContentEditableWarning
        onInput={(e) => {
          if (!isLockedByOther) setTitle(e.currentTarget.textContent || "");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        onPaste={(e) => {
          if (isLockedByOther) return;
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        onBlur={() => {
          if (!isLockedByOther && title.trim() !== title) setTitle(title.trim());
        }}
        className="mb-3 font-serif text-[42px] font-semibold leading-[1.05] tracking-tight text-foreground outline-none empty:before:text-muted-foreground/30 empty:before:content-['Untitled']"
        data-testid="title-display"
      />

      {/* Description — textarea, readOnly when locked */}
      <textarea
        ref={descriptionRef}
        className="eln-description-textarea mb-3 w-full resize-none overflow-hidden text-[15px] leading-relaxed text-muted-foreground placeholder:text-muted-foreground/30"
        value={description}
        onChange={(e) => {
          if (!isLockedByOther) setDescription(e.target.value);
        }}
        readOnly={isLockedByOther}
        placeholder="Add a description…"
        data-testid="description-input"
      />

      {/* Tags — read-only display when locked */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="tags-section">
        {tags.map((tag) => (
          <TagPill
            key={tag.id}
            tag={tag}
            onRemove={isLockedByOther ? undefined : removeTag}
          />
        ))}

        {!isLockedByOther && (
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

      {/* ── ProseMirror Content (always editable, no click-to-edit) ── */}
      <div className="min-h-[60vh]" data-testid="prosemirror-wrapper">
        {editor && <EditorContent editor={editor} />}
      </div>
    </div>
  );
});

export default ElnEditor;
