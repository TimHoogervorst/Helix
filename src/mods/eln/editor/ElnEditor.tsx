/**
 * ElnEditor — chrome-only wrapper for ELN entries (always-editable, auto-save).
 *
 * Owns: useEntryCrud, useAutoSave, useEntryFolder, useDirtyTracking, and
 * the UI chrome (metadata, title, description, tags, divider, locked banner).
 *
 * Does NOT own: the TipTap editor instance — that is rendered by the parent
 * (ElnWorkspace) via TipTapRenderer and passed as `children`.
 *
 * Content layout (PRD #4):
 *   Metadata line → Title → Description → Tags → Divider → {children}
 *
 * Action buttons (MoreActions with Delete) are exposed via ref so the parent
 * (ElnWorkspace) can render them in the top toolbar.
 */
import { useEffect, useLayoutEffect, useRef, forwardRef, useImperativeHandle, useMemo, useCallback } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { EMPTY_DOC, type TipTapDoc, type EntryDetail, type Tag } from "../types";
import { useEntryCrud } from "../hooks/useEntryCrud";
import { useAutoSave } from "../hooks/useAutoSave";
import { useEntryFolder, type Folder as FolderItem } from "../hooks/useEntryFolder";
import { useDirtyTracking } from "../hooks/useDirtyTracking";
import { useTaggableItems } from "../../tags/hooks";
import { TagPill } from "../../tags/ui";
import { TagAutocomplete } from "../../tags/ui";
import { attachTags, detachTag } from "../api";
import type { SaveStatus } from "../hooks/useSaveQueue";

/** Format an ISO date string as YYYY-MM-DD. */
function formatDateShort(iso: string): string {
  return new Date(iso).toISOString().split("T")[0];
}

/** Public handle exposed to parent components via ref. */
export interface ElnEditorHandle {
  save: (options?: { hasBlockActions?: boolean }) => void;
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
  /** Mutable ref synced by the parent via TipTapRenderer's onUpdate.
   *  Read at save time to get the latest editor content for the API call. */
  contentRef: MutableRefObject<TipTapDoc>;
  /** Incremented by the parent on each user-initiated content change.
   *  Drives useAutoSave and useDirtyTracking. */
  contentVersion: number;
  /** Mutable ref set by useActionAccumulator (inside TipTapRenderer) —
   *  true when block actions are pending. Read at save time to decide
   *  whether to set the X-Block-Actions header so the server suppresses
   *  eln.entry.edited. */
  hasBlockActionsRef?: MutableRefObject<boolean>;
  /** The TipTap editor content rendered by the parent via TipTapRenderer.
   *  Rendered in place of the former EditorContent. */
  children?: ReactNode;
}

/** Editor component — MentionProvider is provided by Layout.
 *  Action buttons (MoreActions menu) are exposed via ref so the parent can
 *  render the Delete action in the top toolbar. */
const ElnEditor = forwardRef<ElnEditorHandle, ElnEditorProps>(
  function ElnEditor({ entryId, onStateChange, contentRef, contentVersion, hasBlockActionsRef, children }, ref) {
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

  // ── Title ref (for contentEditable cursor preservation) ──
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  // Guard so auto-focus only fires once on mount, not on every re-render.
  const hasAutoFocusedRef = useRef(false);

  // ── Description textarea ref (for auto-resize) ──
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);

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
    return { title: saved.name, description: d, content: body, status: saved.status || "in_progress" };
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
  // Wrap crud.autoSave so hasBlockActionsRef is read at call time
  // (the ref is updated synchronously by useActionAccumulator).
  const autoSaveWithBlockActions = useCallback(
    (folderId: number | null) => {
      crud.autoSave(folderId, hasBlockActionsRef?.current ?? false);
    },
    [crud.autoSave, hasBlockActionsRef],
  );

  useAutoSave({
    entryId: entryId ?? crud.entry?.display_id,
    title: crud.title,
    description: crud.description,
    status: crud.status,
    contentVersion,
    folderId: folder.folderId,
    autoSave: autoSaveWithBlockActions,
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
  const save = (options?: { hasBlockActions?: boolean }) =>
    crud.save(folderId, isNew ? pendingTagIds : [], options?.hasBlockActions);
  const { deleteEntry } = crud;

  // ── Expose actions to parent via ref ──
  const actionsRef = useRef({ save, deleteEntry, setFolderId, setStatus });
  actionsRef.current = { save, deleteEntry, setFolderId, setStatus };

  useImperativeHandle(ref, () => ({
    save: (options?: { hasBlockActions?: boolean }) => actionsRef.current.save(options),
    deleteEntry: () => actionsRef.current.deleteEntry(),
    setFolderId: (id: number | null) => actionsRef.current.setFolderId(id),
    setStatus: (s: string) => actionsRef.current.setStatus(s),
  }), []);

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

      {/* Header section: centred like ProseMirror text, so the title,
          description, tags, and metadata line align with the text column.
          Stretch blocks (e.g. registry tables) still expand full-width
          because the ProseMirror wrapper lives outside this container. */}
      <div className="max-w-3xl mx-auto">

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
            // Autofocus new entries exactly once on mount (not on every re-render).
            if (el && isNew && !isLockedByOther && !hasAutoFocusedRef.current) {
              hasAutoFocusedRef.current = true;
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

      </div>

      {/* ── ProseMirror Content (rendered by parent via TipTapRenderer) ──
          Not constrained by max-w-3xl so stretch blocks (registry tables,
          etc.) can expand into the gutters. Per-child centering is handled
          by .ProseMirror > * in styles.css. */}
      <div className="min-h-[60vh]" data-testid="prosemirror-wrapper">
        {children}
      </div>
    </div>
  );
});

export default ElnEditor;
