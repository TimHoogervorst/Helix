/**
 * useEntryEditor — state machine hook for the ELN editor.
 *
 * Manages: mode transitions (loading → view → edit → saving → error),
 * API calls for CRUD, dirty tracking, and beforeunload guard.
 *
 * The hook does NOT own the TipTap editor instance — it reads the latest
 * content from ``contentRef``, which the component updates on every render.
 */
import type { TipTapDoc, EntryDetail, Tag } from "../types";
import { useEntryCrud } from "./useEntryCrud";
import { useEntryTags } from "./useEntryTags";
import { useEntryFolder, type Folder } from "./useEntryFolder";
import { useDirtyTracking } from "./useDirtyTracking";

// ── Types ────────────────────────────────────────────────────────────────────

export type EditorMode =
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
  mode: EditorMode;
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
  addTag: (tag: Tag) => Promise<void>;
  removeTag: (tagId: number) => Promise<void>;
  createAndAttachTag: (name: string, color: string, icon?: string) => Promise<Tag | null>;
  changeTagIcon: (tagId: number, icon: string) => Promise<void>;
  searchTags: (query: string) => Promise<Tag[]>;
  save(): Promise<void>;
  cancel(): void;
  deleteEntry(): Promise<void>;
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
 * from ``reference`` nodes and ``limsTable`` entity rows.
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

    if (n.type === "limsTable") {
      const attrs = n.attrs as Record<string, unknown> | undefined;
      const rows = attrs?.rows;
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (row && typeof row === "object") {
            const r = row as Record<string, unknown>;
            if (r.entityId != null && typeof r.displayId === "string") {
              ids.push(r.displayId);
            }
          }
        }
      }
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

/**
 * Walk the TipTap JSON tree and validate that every schema-backed limsTable
 * row has a non-empty ``__name``.  Returns ``true`` if all names are filled,
 * or ``false`` if any row in a schema-backed table has a blank name.
 */
export function validateEntityNames(doc: TipTapDoc): boolean {
  function walk(node: unknown): boolean {
    if (!node || typeof node !== "object") return true;
    const n = node as Record<string, unknown>;

    if (n.type === "limsTable") {
      const attrs = n.attrs as Record<string, unknown> | undefined;
      const schemaId = attrs?.schemaId;
      // Only validate schema-backed tables
      if (schemaId != null) {
        const rows = attrs?.rows;
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (row && typeof row === "object") {
              const r = row as Record<string, unknown>;
              const name = (r.__name as string | undefined) ?? "";
              if (name.trim() === "") {
                return false;
              }
            }
          }
        }
      }
    }

    const content = n.content;
    if (Array.isArray(content)) {
      for (const child of content) {
        if (!walk(child)) return false;
      }
    }
    return true;
  }

  return walk(doc);
}

// ── Hook (composition wrapper) ────────────────────────────────────────────────
//
// useEntryEditor now composes four focused hooks:
//   useEntryCrud + useEntryTags + useEntryFolder + useDirtyTracking
//
// This preserves the original interface for backward compatibility.
// New code should compose the four hooks directly (see ElnEditor).

export function useEntryEditor({
  entryId,
  isNew,
  initialFolderId,
  contentRef,
}: UseEntryEditorOptions): UseEntryEditorReturn {
  // ── Compose the four focused hooks ──

  const crud = useEntryCrud({ entryId, isNew, contentRef });
  const tags = useEntryTags({
    isNew,
    entryId,
    initialTags: crud.entry?.tags ?? [],
    onEntryUpdate: crud.setEntry,
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

  // ── Wire cross-hook actions ──

  // Wrap cancel to also reset folder and tags (owned by sibling hooks).
  // crud.cancel() resets title/description/status and mode; we add folder + tags.
  const cancel = () => {
    if (isNew) {
      crud.cancel(); // navigates to /library
      return;
    }
    folder.setFolderId(crud.entry?.folder ?? null);
    tags.resetTagsToBaseline();
    crud.cancel();
  };

  // Wrap save to pass folderId and tags to CRUD.
  const save = () => crud.save(folder.folderId, tags.tags);

  return {
    mode: crud.mode,
    entry: crud.entry,
    title: crud.title,
    setTitle: crud.setTitle,
    initialTitle: crud.initialTitle,
    initialContent: crud.initialContent,
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
    tags: tags.tags,
    addTag: tags.addTag,
    removeTag: tags.removeTag,
    createAndAttachTag: tags.createAndAttachTag,
    changeTagIcon: tags.changeTagIcon,
    searchTags: tags.searchTags,
    save,
    cancel,
    deleteEntry: crud.deleteEntry,
    enterEditMode: crud.enterEditMode,
  };
}
