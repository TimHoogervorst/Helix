/**
 * useEntryEditor — state machine hook for the ELN editor.
 *
 * Manages: mode transitions (loading → view → edit → saving → error),
 * API calls for CRUD, dirty tracking, and beforeunload guard.
 *
 * The hook does NOT own the TipTap editor instance — it reads the latest
 * content from ``contentRef``, which the component updates on every render.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { get, post, put, del } from "../api/client";
import { listTags, createTag, attachTags, detachTag } from "../api/eln";
import { EMPTY_DOC, type TipTapDoc, type EntryDetail, type Tag } from "../types/eln";
import { useReferenceContext } from "../components/ReferenceProvider";

// ── Types ────────────────────────────────────────────────────────────────────

interface Folder {
  id: number;
  name: string;
}

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
  createAndAttachTag: (name: string, color: string) => Promise<Tag | null>;
  searchTags: (query: string) => Promise<Tag[]>;
  save(): Promise<void>;
  cancel(): void;
  deleteEntry(): Promise<void>;
  enterEditMode(): void;
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

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useEntryEditor({
  entryId,
  isNew,
  initialFolderId,
  contentRef,
}: UseEntryEditorOptions): UseEntryEditorReturn {
  const navigate = useNavigate();
  const { resolveIds } = useReferenceContext();

  // ── State ──
  const [mode, setMode] = useState<EditorMode>(
    isNew ? "edit-new" : "loading",
  );
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [title, setTitle] = useState("");
  const [initialTitle, setInitialTitle] = useState("");
  const [initialContent, setInitialContent] = useState<TipTapDoc>(EMPTY_DOC);
  const [folderId, setFolderId] = useState<number | null>(
    initialFolderId ?? null,
  );
  const [folders, setFolders] = useState<Folder[]>([]);
  const [status, setStatus] = useState("in_progress");
  const [initialStatus, setInitialStatus] = useState("in_progress");
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Derived ──
  const currentContent = contentRef.current;
  const isDirty =
    title !== initialTitle ||
    status !== initialStatus ||
    JSON.stringify(currentContent) !== JSON.stringify(initialContent);

  // ── Fetch entry ──
  useEffect(() => {
    if (!entryId) return;

    setMode("loading");
    const controller = new AbortController();

    get<EntryDetail>(`/eln/entries/${entryId}/`, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setEntry(data);
        setTitle(data.title);
        setInitialTitle(data.title);
        setInitialContent(data.content);
        setFolderId(data.folder);
        setStatus(data.status || "in_progress");
        setInitialStatus(data.status || "in_progress");
        setTags(data.tags || []);

        // Batch-resolve all display IDs found in the loaded content
        const refIds = collectDisplayIds(data.content);
        if (refIds.length > 0) {
          resolveIds(refIds);
        }

        setMode("view");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Failed to load entry";
        setError(message);
        setMode("error");
      });

    return () => controller.abort();
  }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch folders ──
  useEffect(() => {
    get<Folder[]>("/core/folders/")
      .then(setFolders)
      .catch(() => {});
  }, []);

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
    // Resolve any references in the current content before editing
    const refIds = collectDisplayIds(currentContent);
    if (refIds.length > 0) {
      resolveIds(refIds);
    }
    setMode("edit-existing");
  }, [currentContent, resolveIds]);

  // ── Tag management ──

  const addTag = useCallback(async (tag: Tag) => {
    setTags((prev) => {
      if (prev.some((t) => t.id === tag.id)) return prev;
      return [...prev, tag];
    });

    // For existing entries, attach immediately on the backend
    if (!isNew && entryId) {
      try {
        const updated = await attachTags(entryId, [tag.id]);
        setEntry(updated);
      } catch {
        // Rollback on failure
        setTags((prev) => prev.filter((t) => t.id !== tag.id));
      }
    }
  }, [isNew, entryId]);

  const removeTag = useCallback(async (tagId: number) => {
    const removed = tags.find((t) => t.id === tagId);
    setTags((prev) => prev.filter((t) => t.id !== tagId));

    // For existing entries, detach immediately on the backend
    if (!isNew && entryId && removed) {
      try {
        const updated = await detachTag(entryId, tagId);
        setEntry(updated);
      } catch {
        // Rollback on failure
        setTags((prev) => [...prev, removed]);
      }
    }
  }, [isNew, entryId, tags]);

  const searchTags = useCallback(async (query: string): Promise<Tag[]> => {
    if (!query.trim()) return [];
    try {
      return await listTags(query);
    } catch {
      return [];
    }
  }, []);

  const createAndAttachTag = useCallback(async (name: string, color: string): Promise<Tag | null> => {
    try {
      const newTag = await createTag(name, color);

      // Attach to existing entry or add locally for new entries
      if (!isNew && entryId) {
        await attachTags(entryId, [newTag.id]);
      }
      setTags((prev) => [...prev, newTag]);
      return newTag;
    } catch {
      return null;
    }
  }, [isNew, entryId]);

  const cancel = useCallback(() => {
    if (isNew) {
      navigate("/library");
      return;
    }
    setTitle(initialTitle);
    setFolderId(entry?.folder ?? null);
    setStatus(initialStatus);
    setTags(entry?.tags || []);
    setMode("view");
  }, [isNew, initialTitle, initialStatus, entry, navigate]);

  const save = useCallback(async () => {
    if (!title.trim()) return;

    // Validate that all schema-backed tables have names filled in
    if (!validateEntityNames(contentRef.current)) {
      alert("Name not filled in.");
      return;
    }

    setMode("saving");
    setError(null);

    const payload = {
      title: title.trim(),
      content: contentRef.current,
      folder: folderId,
      status,
      ...(isNew ? { tag_ids: tags.map((t) => t.id) } : {}),
    };

    try {
      if (isNew) {
        const created = await post<EntryDetail>("/eln/entries/", payload);
        navigate(`/eln/${created.display_id}`);
      } else {
        const updated = await put<EntryDetail>(
          `/eln/entries/${entryId!}/`,
          payload,
        );
        // Replace content with response (entityIds are patched by backend)
        const responseContent = updated.content || contentRef.current;
        setEntry(updated);
        setInitialTitle(title.trim());
        setInitialContent(responseContent);
        setInitialStatus(updated.status || "in_progress");
        // Re-resolve all display IDs from the updated content
        const refIds = collectDisplayIds(responseContent);
        if (refIds.length > 0) resolveIds(refIds);
        setMode("view");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setMode(isNew ? "edit-new" : "edit-existing");
    }
  }, [title, contentRef, folderId, status, isNew, entryId, navigate, resolveIds]);

  const deleteEntry = useCallback(async () => {
    if (!entryId || !window.confirm("Delete this entry permanently?")) return;

    setDeleting(true);
    setError(null);
    try {
      await del(`/eln/entries/${entryId}/`);
      navigate("/library");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }, [entryId, navigate]);

  return {
    mode,
    entry,
    title,
    setTitle,
    initialTitle,
    initialContent,
    folderId,
    setFolderId,
    folders,
    status,
    setStatus,
    error,
    deleting,
    isDirty,
    tags,
    addTag,
    removeTag,
    createAndAttachTag,
    searchTags,
    save,
    cancel,
    deleteEntry,
    enterEditMode,
  };
}
