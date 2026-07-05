/**
 * useEntryCrud — state machine hook for ELN entry CRUD operations.
 *
 * Owns: entry fetch, mode transitions (loading → view → edit → saving → error),
 * title/description/status state, and save/cancel/delete actions.
 *
 * Does NOT own: folder selection, tag management, or dirty tracking.
 * ``save(folderId, tags)`` accepts folder and tag data from the composing component.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { get, post, put, del } from "../../../core/api/client";
import { EMPTY_DOC, type TipTapDoc, type EntryDetail, type Tag } from "../types";
import { useReferenceContext } from "../../../core/references/ReferenceProvider";
import {
  splitFirstParagraph,
  prependDescription,
  collectDisplayIds,
  validateEntityNames,
  type EditorMode,
} from "./useEntryEditor";

export type { EditorMode } from "./useEntryEditor";

export interface UseEntryCrudOptions {
  entryId?: string;
  isNew: boolean;
  /** Mutable ref that the component keeps in sync with editor.getJSON(). */
  contentRef: React.MutableRefObject<TipTapDoc>;
}

export interface UseEntryCrudReturn {
  mode: EditorMode;
  entry: EntryDetail | null;
  /** Exposed so useEntryTags can sync entry after backend tag mutations. */
  setEntry: React.Dispatch<React.SetStateAction<EntryDetail | null>>;
  title: string;
  setTitle: (t: string) => void;
  initialTitle: string;
  initialContent: TipTapDoc;
  description: string;
  initialDescription: string;
  setDescription: (d: string) => void;
  status: string;
  initialStatus: string;
  setStatus: (s: string) => void;
  error: string | null;
  deleting: boolean;
  /** Save the entry. ``folderId`` and ``tags`` are owned by sibling hooks. */
  save(folderId: number | null, tags: Tag[]): Promise<void>;
  cancel(): void;
  deleteEntry(): Promise<void>;
  enterEditMode(): void;
}

export function useEntryCrud({
  entryId,
  isNew,
  contentRef,
}: UseEntryCrudOptions): UseEntryCrudReturn {
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
  const [description, setDescriptionState] = useState("");
  const [initialDescription, setInitialDescription] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [initialStatus, setInitialStatus] = useState("in_progress");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Fetch entry ──
  useEffect(() => {
    if (!entryId) return;

    setMode("loading");
    const controller = new AbortController();

    get<EntryDetail>(`/eln/entries/${entryId}/`, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const { description: desc, body } = splitFirstParagraph(data.content);
        setEntry(data);
        setTitle(data.title);
        setInitialTitle(data.title);
        setDescriptionState(desc);
        setInitialDescription(desc);
        setInitialContent(body);
        setStatus(data.status || "in_progress");
        setInitialStatus(data.status || "in_progress");

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

  // ── Actions ──

  const enterEditMode = useCallback(() => {
    const currentContent = contentRef.current;
    const refIds = collectDisplayIds(currentContent);
    if (refIds.length > 0) {
      resolveIds(refIds);
    }
    setMode("edit-existing");
  }, [contentRef, resolveIds]);

  const setDescription = useCallback((d: string) => {
    setDescriptionState(d);
  }, []);

  const cancel = useCallback(() => {
    if (isNew) {
      navigate("/library");
      return;
    }
    setTitle(initialTitle);
    setDescriptionState(initialDescription);
    setStatus(initialStatus);
    setMode("view");
  }, [isNew, initialTitle, initialDescription, initialStatus, navigate]);

  const save = useCallback(async (folderId: number | null, tags: Tag[]) => {
    if (!title.trim()) return;

    if (!validateEntityNames(contentRef.current)) {
      alert("Name not filled in.");
      return;
    }

    setMode("saving");
    setError(null);

    const fullContent = prependDescription(contentRef.current, description);

    const payload: Record<string, unknown> = {
      title: title.trim(),
      content: fullContent,
      folder: folderId,
      status,
    };
    if (isNew) {
      payload.tag_ids = tags.map((t) => t.id);
    }

    try {
      if (isNew) {
        const created = await post<EntryDetail>("/eln/entries/", payload);
        navigate(`/eln/${created.display_id}`);
      } else {
        const updated = await put<EntryDetail>(
          `/eln/entries/${entryId!}/`,
          payload,
        );
        const responseContent = updated.content || contentRef.current;
        const { description: newDesc, body: newBody } =
          splitFirstParagraph(responseContent);
        setEntry(updated);
        setInitialTitle(title.trim());
        setDescriptionState(newDesc);
        setInitialDescription(newDesc);
        setInitialContent(newBody);
        setInitialStatus(updated.status || "in_progress");
        const refIds = collectDisplayIds(responseContent);
        if (refIds.length > 0) resolveIds(refIds);
        setMode("view");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setMode(isNew ? "edit-new" : "edit-existing");
    }
  }, [title, description, status, isNew, entryId, contentRef, navigate, resolveIds]);

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
    setEntry,
    title,
    setTitle,
    initialTitle,
    initialContent,
    description,
    initialDescription,
    setDescription,
    status,
    initialStatus,
    setStatus,
    error,
    deleting,
    save,
    cancel,
    deleteEntry,
    enterEditMode,
  };
}
