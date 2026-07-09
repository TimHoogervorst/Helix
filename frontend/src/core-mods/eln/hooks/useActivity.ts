import { useState, useEffect, useCallback } from "react";
import { fetchActions } from "../api";
import type { ElnAction } from "../types";

export interface UseActivityResult {
  /** All actions for the entry, most recent first. */
  actions: ElnAction[];
  /** True while the initial fetch is in flight. */
  isLoading: boolean;
  /** Non-null if the fetch failed. */
  error: string | null;
  /** Manually re-fetch actions (e.g. for error retry). */
  refetch: () => void;
}

/**
 * Fetch all actions for an ELN entry.
 *
 * Consolidates what were previously two separate fetchEffects in ElnWorkspace
 * (avatar row + last-editor info) into a single API call.
 *
 * Stays idle when `entryId` is undefined — no network request is made.
 */
export function useActivity(entryId: string | undefined): UseActivityResult {
  const [actions, setActions] = useState<ElnAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the current entryId so we can suppress stale responses.
  const [fetchKey, setFetchKey] = useState(0);

  const doFetch = useCallback(() => {
    if (!entryId) {
      setActions([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchActions(entryId)
      .then((result) => {
        if (!cancelled) {
          setActions(result);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load activity";
          setError(message);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entryId, fetchKey]);

  useEffect(() => {
    const cleanup = doFetch();
    return cleanup;
  }, [doFetch]);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  return { actions, isLoading, error, refetch };
}
