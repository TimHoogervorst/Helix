/**
 * useEntryCrud — CRUD hook for ELN entries (always-editable, no mode machine).
 *
 * Owns: entry fetch, title/description/status state, save/autoSave/delete,
 * lock lifecycle (acquire on mount, periodic refresh, release on unmount),
 * and save-queue integration via useSaveQueue.
 *
 * Does NOT own: folder selection, tag management, dirty tracking, or debounce
 * timing (useAutoSave).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { get, del } from "../../../core/api/client";
import type { TipTapDoc, EntryDetail } from "../types";
import { useMentionContext } from "../../../core/mentions/MentionProvider";
import { attachTags, acquireLock, releaseLock, getLockStatus } from "../api";
import { useSaveQueue, type SaveStatus } from "./useSaveQueue";
import { useCurrentUser } from "../../../core/user/CurrentUserProvider";
import {
  splitFirstParagraph,
  prependDescription,
  collectDisplayIds,
  validateEntityNames,
} from "./useEntryEditor";

export interface UseEntryCrudOptions {
  entryId?: string;
  isNew: boolean;
  /** Mutable ref that the component keeps in sync with editor.getJSON(). */
  contentRef: React.MutableRefObject<TipTapDoc>;
}

export interface UseEntryCrudReturn {
  /** True when the entry has loaded and the editor is ready (not loading/error). */
  isReady: boolean;
  entry: EntryDetail | null;
  /** Exposed so sibling hooks can sync entry after backend tag mutations. */
  setEntry: React.Dispatch<React.SetStateAction<EntryDetail | null>>;
  title: string;
  setTitle: (t: string) => void;
  description: string;
  setDescription: (d: string) => void;
  status: string;
  setStatus: (s: string) => void;
  error: string | null;
  deleting: boolean;
  /** True when another user holds an active lock — entry is read-only. */
  isLockedByOther: boolean;
  /** Username of the lock holder, or null if not locked by another. */
  lockHeldBy: string | null;
  /** Fire-and-forget auto-save — enqueues with saveMode "autosave". */
  autoSave: (folderId: number | null) => void;
  /** Manual save — enqueues with saveMode "manual", returns the promise. */
  save: (folderId: number | null, tagIds: number[]) => Promise<void>;
  deleteEntry: () => Promise<void>;
  /** Apply server response to local state (shared by autoSave and save). */
  applySavedEntry: (entry: EntryDetail) => void;
  /** Current save-queue status. */
  saveStatus: SaveStatus;
  /** When the most recent successful save completed, or null. */
  lastSavedAt: Date | null;
  /** Number of items currently in the save queue. */
  queueLength: number;
}

export function useEntryCrud({
  entryId,
  isNew,
  contentRef,
}: UseEntryCrudOptions): UseEntryCrudReturn {
  const navigate = useNavigate();
  const { resolveIds } = useMentionContext();
  const { user } = useCurrentUser();

  // ── State ──
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescriptionState] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const [lockHeldBy, setLockHeldBy] = useState<string | null>(null);
  // Generation counter per entry — used to cancel stale releaseLock calls
  // that race with a subsequent acquireLock (StrictMode remount, page refresh).
  const lockGenRef = useRef<Record<string, number>>({});

  // ── Save queue (only when we have an entryId) ──
  const effectiveEntryId = entryId ?? entry?.display_id;
  const saveQueue = useSaveQueue(
    effectiveEntryId ? { entryId: effectiveEntryId } : { entryId: "__pending__" },
  );
  // Don't use saveQueue when there's no real entryId — we gate all callers.
  const { status: saveStatus, lastSavedAt, queueLength, enqueue } = saveQueue;

  // ── Apply saved entry response to local state ──
  const applySavedEntry = useCallback(
    (saved: EntryDetail) => {
      const { description: desc } = splitFirstParagraph(saved.content);
      setEntry(saved);
      setTitle(saved.title);
      setDescriptionState(desc);
      setStatus(saved.status || "in_progress");

      const refIds = collectDisplayIds(saved.content);
      if (refIds.length > 0) {
        resolveIds(refIds);
      }
    },
    [resolveIds],
  );

  // ── Auto-save (fire-and-forget) ──
  const autoSave = useCallback(
    (folderId: number | null) => {
      if (!effectiveEntryId || !title.trim()) return;
      if (isLockedByOther) return;

      if (!validateEntityNames(contentRef.current)) {
        // Silently skip auto-save when entity names are incomplete.
        return;
      }

      const fullContent = prependDescription(contentRef.current, description);

      const payload: Record<string, unknown> = {
        title: title.trim(),
        content: fullContent,
        folder: folderId,
        status,
      };

      enqueue(payload, "autosave").then((saved) => {
        // For auto-saves we do NOT apply the server response to local
        // state — the user may have edited since the save was triggered,
        // and overwriting title / content would reset the cursor and
        // discard post-save edits. Only resolve any new reference
        // display IDs so reference labels stay up to date.
        const refIds = collectDisplayIds(saved.content);
        if (refIds.length > 0) {
          resolveIds(refIds);
        }
      });
    },
    [effectiveEntryId, title, description, status, contentRef, enqueue, resolveIds, isLockedByOther],
  );

  // ── Manual save (returns promise) ──
  const save = useCallback(
    async (folderId: number | null, tagIds: number[]) => {
      if (!effectiveEntryId || !title.trim()) return;
      if (isLockedByOther) return;

      if (!validateEntityNames(contentRef.current)) {
        alert("Name not filled in.");
        return;
      }

      const fullContent = prependDescription(contentRef.current, description);

      const payload: Record<string, unknown> = {
        title: title.trim(),
        content: fullContent,
        folder: folderId,
        status,
      };

      const saved = await enqueue(payload, "manual");

      // For new entries, flush deferred tags after the first save
      if (isNew && tagIds.length > 0 && effectiveEntryId) {
        const withTags = await attachTags(effectiveEntryId, tagIds);
        applySavedEntry(withTags);
      } else {
        applySavedEntry(saved);
      }
    },
    [effectiveEntryId, title, description, status, isNew, contentRef, enqueue, applySavedEntry, isLockedByOther],
  );

  const setDescription = useCallback((d: string) => {
    setDescriptionState(d);
  }, []);

  // ── Delete ──
  const deleteEntry = useCallback(async () => {
    if (!effectiveEntryId || !window.confirm("Delete this entry permanently?")) return;

    setDeleting(true);
    setError(null);
    try {
      await del(`/eln/entries/${effectiveEntryId}/`);
      navigate("/library");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }, [effectiveEntryId, navigate]);

  // ── Fetch entry ──
  useEffect(() => {
    if (!entryId) {
      // No entryId — new entry that hasn't been created yet (shouldn't happen
      // with immediate-create, but handle gracefully).
      setIsReady(true);
      return;
    }

    const controller = new AbortController();

    get<EntryDetail>(`/eln/entries/${entryId}/`, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const { description: desc } = splitFirstParagraph(data.content);
        setEntry(data);
        setTitle(data.title);
        setDescriptionState(desc);
        setStatus(data.status || "in_progress");

        const refIds = collectDisplayIds(data.content);
        if (refIds.length > 0) {
          resolveIds(refIds);
        }

        setIsReady(true);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Failed to load entry";
        setError(message);
      });

    return () => controller.abort();
  }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lock status check on mount ──
  useEffect(() => {
    if (!effectiveEntryId) return;

    getLockStatus(effectiveEntryId)
      .then((status) => {
        if (status.locked && user && status.held_by !== user.id) {
          setIsLockedByOther(true);
          setLockHeldBy(status.held_by_username ?? null);
        }
      })
      .catch(() => {
        // Non-fatal — if we can't check, assume unlocked.
      });
    // Only re-check on entry change (navigation to a different entry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveEntryId]);

  // ── Lock lifecycle (acquire on mount, refresh periodically, release on unmount) ──
  //
  // The release is *deferred* by 500ms and skipped if a new acquire for the
  // same entry bumps the generation counter in the meantime.  This prevents
  // the DELETE from racing with a subsequent POST on:
  //   1. React StrictMode double-mount (dev) — cleanup DELETE vs remount POST
  //   2. Page refresh — old page's DELETE vs new page's POST
  // On a full page unload the timer is destroyed before firing, so the lock
  // naturally persists for the reload to refresh it.
  useEffect(() => {
    if (!effectiveEntryId) return;

    // Bump the generation so any stale releaseLock scheduled by a previous
    // cleanup sees a different generation and skips the DELETE.
    const gen = (lockGenRef.current[effectiveEntryId] || 0) + 1;
    lockGenRef.current[effectiveEntryId] = gen;

    // Acquire on mount (best-effort — if another user holds the lock, the
    // backend returns 423 and we swallow it silently).
    acquireLock(effectiveEntryId).catch(() => {
      // Non-fatal — the backend enforces locks on write.
    });

    // Periodic refresh every 2 minutes
    const interval = setInterval(() => {
      acquireLock(effectiveEntryId).catch(() => {});
    }, 2 * 60 * 1000);

    return () => {
      clearInterval(interval);
      const genAtCleanup = gen;
      // Defer the release by 500ms.  If a new acquire for the same entry
      // bumped the generation (StrictMode remount, page refresh reload),
      // we skip the DELETE to avoid racing with the fresh lock.
      setTimeout(() => {
        if (lockGenRef.current[effectiveEntryId] === genAtCleanup) {
          releaseLock(effectiveEntryId).catch(() => {});
        }
      }, 500);
    };
  }, [effectiveEntryId]);

  return {
    isReady,
    entry,
    setEntry,
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
    autoSave,
    save,
    deleteEntry,
    applySavedEntry,
    saveStatus: effectiveEntryId ? saveStatus : "idle",
    lastSavedAt,
    queueLength: effectiveEntryId ? queueLength : 0,
  };
}
