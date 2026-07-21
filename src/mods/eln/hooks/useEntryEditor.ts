/**
 * useEntryEditor — backward-compatibility composition hook for the ELN editor.
 *
 * This wrapper composes useEntryCrud + useTaggableItems + useEntryFolder +
 * useDirtyTracking into the original interface. New code should compose the
 * hooks directly (see ElnEditor).
 *
 * The hook does NOT own the TipTap editor instance — it reads the latest
 * content from ``contentRef``, which the component updates on every render.
 */
import { useCallback, useMemo } from "react";
import type { TipTapDoc, EntryDetail, Tag } from "../types";
import { EMPTY_DOC } from "../types";
import { useEntryCrud } from "./useEntryCrud";
import { useTaggableItems } from "../../tags/hooks";
import { useEntryFolder, type Folder } from "./useEntryFolder";
import { useDirtyTracking } from "./useDirtyTracking";
import { attachTags, detachTag } from "../api";
import { updateTag } from "../../tags/api";

// ── Types ────────────────────────────────────────────────────────────────────

/** @deprecated The editor no longer uses a mode state machine.
 *  Kept for backward compatibility in tests and wrapper. */
type EditorMode =
  | "loading"
  | "view"
  | "edit-new"
  | "edit-existing"
  | "saving"
  | "error";

export interface UseEntryEditorOptions {
  entryId?: string;
  isNew: boolean;
  initialFolderId?: number | null;
  /** Mutable ref that the component keeps in sync with editor.getJSON(). */
  contentRef: React.MutableRefObject<TipTapDoc>;
}

export interface UseEntryEditorReturn {
  /** @deprecated Use isReady instead. */
  mode: EditorMode;
  /** @deprecated No longer tracked. Always true. */
  isEdit: boolean;
  entry: EntryDetail | null;
  title: string;
  setTitle: (t: string) => void;
  initialTitle: string;
  initialContent: TipTapDoc;
  description: string;
  setDescription: (d: string) => void;
  folderId: number | null;
  setFolderId: (id: number | null) => void;
  folders: Folder[];
  status: string;
  setStatus: (s: string) => void;
  error: string | null;
  deleting: boolean;
  isDirty: boolean;
  tags: Tag[];
  /** IDs of tags added in deferred mode — batched into the create payload. */
  pendingTagIds: number[];
  addTag: (tag: Tag) => Promise<void>;
  removeTag: (tagId: number) => Promise<void>;
  /** Change a tag's icon via the tags API. */
  changeTagIcon: (tagId: number, icon: string) => Promise<void>;
  /** Reset tags to initial baseline (on cancel). */
  resetTagsToBaseline: () => void;
  save(): Promise<void>;
  /** @deprecated No-op in always-editable mode — use save() instead. */
  cancel(): void;
  deleteEntry(): Promise<void>;
  /** @deprecated No-op in always-editable mode. Editor is always editable. */
  enterEditMode(): void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively extract all plain text from a TipTap JSON node.
 * Handles marks (bold, italic, etc.) by traversing into children.
 */
function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") {
    return n.text;
  }
  const children = n.content;
  if (Array.isArray(children)) {
    return children.map((c) => extractText(c)).join("");
  }
  return "";
}

/**
 * Split a TipTap document into its first paragraph (the description) and
 * the rest of the document (everything after the first paragraph).
 *
 * Returns the description text and a new document with remaining content.
 * If the first node is not a paragraph, description is empty and doc is unchanged.
 */
export function splitFirstParagraph(
  doc: TipTapDoc,
): { description: string; body: TipTapDoc } {
  if (!doc || typeof doc !== "object") {
    return { description: "", body: doc };
  }
  const d = doc as Record<string, unknown>;
  const content = d.content;
  if (!Array.isArray(content) || content.length === 0) {
    return { description: "", body: doc };
  }
  const first = content[0] as Record<string, unknown> | undefined;
  if (first && first.type === "paragraph") {
    const description = extractText(first);
    const body = { ...d, content: content.slice(1) };
    return { description, body };
  }
  return { description: "", body: doc };
}

/**
 * Prepend a description paragraph to a TipTap document.
 */
export function prependDescription(
  doc: TipTapDoc,
  description: string,
): TipTapDoc {
  const para = {
    type: "paragraph",
    content: description
      ? [{ type: "text", text: description }]
      : [],
  };
  const d = doc as Record<string, unknown>;
  const content = Array.isArray(d.content) ? d.content : [];
  return { ...d, content: [para, ...content] };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Walk the TipTap JSON tree and collect all ``displayId`` values
 * from ``reference`` nodes.
 */
export function collectDisplayIds(doc: TipTapDoc): string[] {
  const ids: string[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;

    if (n.type === "reference") {
      const attrs = n.attrs as Record<string, unknown> | undefined;
      const displayId = attrs?.displayId;
      if (typeof displayId === "string") {
        ids.push(displayId);
      }
      return; // reference nodes are atomic
    }

    const content = n.content;
    if (Array.isArray(content)) {
      for (const child of content) {
        walk(child);
      }
    }
  }

  walk(doc);
  return ids;
}

// ── Hook (composition wrapper) ────────────────────────────────────────────────
//
// useEntryEditor now composes four focused hooks:
//   useEntryCrud + useTaggableItems + useEntryFolder + useDirtyTracking
//
// This preserves the original interface for backward compatibility.
// New code should compose the four hooks directly (see ElnEditor).

export function useEntryEditor({
  entryId,
  isNew,
  initialFolderId,
  contentRef,
}: UseEntryEditorOptions): UseEntryEditorReturn {
  // ── Compose hooks ──

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

  // Derive baseline values from the last-saved entry (for dirty tracking).
  const baseline = useMemo(() => {
    const saved = crud.entry;
    if (!saved) {
      return { title: "", description: "", content: EMPTY_DOC as TipTapDoc, status: "in_progress" };
    }
    const { description: d, body } = splitFirstParagraph(saved.content);
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

  // ── Change tag icon (delegates to tags API) ──
  const changeTagIcon = useCallback(
    async (tagId: number, icon: string) => {
      try {
        const updated = await updateTag(tagId, { icon });
        if (crud.entry) {
          const newTags = crud.entry.tags.map((t) =>
            t.id === tagId ? updated : t,
          );
          crud.setEntry({ ...crud.entry, tags: newTags });
        }
      } catch {
        // Silently ignore — no rollback needed
      }
    },
    [crud.entry, crud.setEntry],
  );

  // ── Wire cross-hook actions ──

  // In always-editable mode, cancel is a no-op (or navigates away for new entries).
  const cancel = () => {
    // No-op: always-editable mode has no cancel. New entries were already
    // created server-side, so navigating away is handled by the parent.
  };

  const save = () =>
    crud.save(
      folder.folderId,
      isNew ? taggableItems.pendingTagIds : [],
    );

  // enterEditMode is a no-op — editor is always editable.
  const enterEditMode = () => {};

  // Derive a backward-compat mode from isReady/error.
  const mode: EditorMode = !crud.isReady && !crud.error
    ? "loading"
    : crud.error
      ? "error"
      : isNew
        ? "edit-existing"
        : "edit-existing"; // Always editable, so always "edit-existing"

  return {
    mode,
    isEdit: true, // Always editable
    entry: crud.entry,
    title: crud.title,
    setTitle: crud.setTitle,
    initialTitle: baseline.title,
    initialContent: baseline.content,
    description: crud.description,
    setDescription: crud.setDescription,
    folderId: folder.folderId,
    setFolderId: folder.setFolderId,
    folders: folder.folders,
    status: crud.status,
    setStatus: crud.setStatus,
    error: crud.error,
    deleting: crud.deleting,
    isDirty,
    tags: taggableItems.tags,
    pendingTagIds: taggableItems.pendingTagIds,
    addTag: taggableItems.addTag,
    removeTag: taggableItems.removeTag,
    changeTagIcon,
    resetTagsToBaseline: taggableItems.resetToBaseline,
    save,
    cancel,
    deleteEntry: crud.deleteEntry,
    enterEditMode,
  };
}
