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
import { EMPTY_DOC, type TipTapDoc, type EntryDetail } from "../types/eln";
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
  error: string | null;
  deleting: boolean;
  isDirty: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Derived ──
  const currentContent = contentRef.current;
  const isDirty =
    title !== initialTitle ||
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

  const cancel = useCallback(() => {
    if (isNew) {
      navigate("/library");
      return;
    }
    setTitle(initialTitle);
    setFolderId(entry?.folder ?? null);
    setMode("view");
  }, [isNew, initialTitle, entry, navigate]);

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
        setInitialTitle(title.trim());
        setInitialContent(responseContent);
        // Re-resolve all display IDs from the updated content
        const refIds = collectDisplayIds(responseContent);
        if (refIds.length > 0) resolveIds(refIds);
        setMode("view");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setMode(isNew ? "edit-new" : "edit-existing");
    }
  }, [title, contentRef, folderId, isNew, entryId, navigate, resolveIds]);

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
    error,
    deleting,
    isDirty,
    save,
    cancel,
    deleteEntry,
    enterEditMode,
  };
}
