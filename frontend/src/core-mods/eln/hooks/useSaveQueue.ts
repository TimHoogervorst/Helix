/**
 * useSaveQueue — in-memory serial save queue with network-error retry.
 *
 * Owns: the pending-save queue, serial drain loop, and save-status state.
 * Does NOT own: debounce timing (useAutoSave), value tracking (useEntryCrud),
 * or lock lifecycle.
 *
 * Key behaviours:
 * - Serial drain: one PUT at a time, in order
 * - NetworkError: pause drain, retain item at front, status → "error",
 *   retry on next enqueue() (lazy retry, no timers)
 * - Non-network error: reject the item's promise, remove from queue,
 *   continue draining
 * - Fire-and-forget: returned promise has internal catch so callers
 *   who don't await don't trigger unhandled rejections
 * - saveMode flows into the X-Save-Mode request header
 */
import { useState, useRef, useCallback } from "react";
import { put, NetworkError } from "../../../core/api/client";
import type { EntryDetail } from "../types";

// ── Types ──────────────────────────────────────────────────────────────────

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface QueuedSave {
  payload: Record<string, unknown>;
  saveMode?: string;
  resolve: (value: EntryDetail) => void;
  reject: (reason: unknown) => void;
}

export interface UseSaveQueueOptions {
  /** The entry's display_id, used to construct the PUT URL. */
  entryId: string;
}

export interface UseSaveQueueReturn {
  /** Current status of the save queue. */
  status: SaveStatus;
  /** When the most recent successful save completed, or null. */
  lastSavedAt: Date | null;
  /** Number of items currently in the queue (including the one draining). */
  queueLength: number;
  /**
   * Enqueue a save payload. Returns a promise that resolves when that
   * specific save succeeds, or rejects on non-network errors.
   *
   * @param payload  The PUT request body (title, content, folder, status, etc.)
   * @param saveMode Optional save mode ("autosave" | "manual"), sent as X-Save-Mode header.
   */
  enqueue: (
    payload: Record<string, unknown>,
    saveMode?: string,
  ) => Promise<EntryDetail>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSaveQueue({
  entryId,
}: UseSaveQueueOptions): UseSaveQueueReturn {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [queueLength, setQueueLength] = useState(0);

  // Refs avoid stale closures in the async drain loop and enqueue callback.
  const queueRef = useRef<QueuedSave[]>([]);
  const drainingRef = useRef(false);

  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;

    while (queueRef.current.length > 0) {
      const item = queueRef.current[0];
      setStatus("saving");

      try {
        const extraHeaders: Record<string, string> = {};
        if (item.saveMode) {
          extraHeaders["X-Save-Mode"] = item.saveMode;
        }

        const result = await put<EntryDetail>(
          `/eln/entries/${entryId}/`,
          item.payload,
          undefined, // signal
          extraHeaders,
        );

        // Success — resolve, dequeue, update timestamp
        item.resolve(result);
        queueRef.current.shift();
        setQueueLength(queueRef.current.length);
        setLastSavedAt(new Date());
      } catch (err) {
        // NetworkError → pause drain, keep item, retry on next enqueue
        if (err instanceof NetworkError) {
          setStatus("error");
          drainingRef.current = false;
          return;
        }

        // Non-network error (ApiError, etc.) → reject and continue
        item.reject(err);
        queueRef.current.shift();
        setQueueLength(queueRef.current.length);
      }
    }

    // Queue fully drained without network errors
    setStatus("saved");
    drainingRef.current = false;
  }, [entryId]);

  const enqueue = useCallback(
    (
      payload: Record<string, unknown>,
      saveMode?: string,
    ): Promise<EntryDetail> => {
      let resolveRef: ((value: EntryDetail) => void) | undefined;
      let rejectRef: ((reason: unknown) => void) | undefined;

      const promise = new Promise<EntryDetail>((resolve, reject) => {
        resolveRef = resolve;
        rejectRef = reject;
        queueRef.current.push({
          payload,
          saveMode,
          resolve,
          reject,
        });
        setQueueLength(queueRef.current.length);
      });

      // Fire-and-forget support: this catch prevents unhandled rejections
      // when the caller ignores the returned promise. Callers who await
      // will still see the rejection because the promise itself still rejects.
      promise.catch(() => {});

      // Trigger drain if not already running (lazy retry for network errors,
      // or first enqueue from idle).
      if (!drainingRef.current) {
        // setTimeout defers drain so React state updates from enqueue
        // (queueLength) flush before the async drain loop starts.
        setTimeout(() => drain(), 0);
      }

      return promise;
    },
    [drain],
  );

  return { status, lastSavedAt, queueLength, enqueue };
}
