/**
 * Context + provider for sharing resolved reference data with node views.
 *
 * Cache architecture:
 *   resolutionMap: Map<displayId, ResolvedRef | null>
 *     - cache miss  → displayId not in map → queued for batch resolve
 *     - pending     → displayId → undefined → badges show loading state
 *     - resolved    → displayId → ResolvedRef → all badges show icon + title
 *     - broken      → displayId → null → all badges show red broken state
 *
 * Batching:
 *   Multiple resolveIds() calls within the same synchronous render flush
 *   are collected and dispatched as a single POST on the next microtask tick.
 */
import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { post } from "../api/client";
import type { ResolvedRef } from "../../types/references";

type ResolutionMap = Map<string, ResolvedRef | null>;

interface ReferenceContextValue {
  resolutionMap: ResolutionMap;
  /** Resolve a batch of displayIds. Idempotent — already-resolved IDs are skipped. */
  resolveIds: (ids: string[]) => Promise<void>;
}

const ReferenceContext = createContext<ReferenceContextValue>({
  resolutionMap: new Map(),
  resolveIds: async () => {},
});

export function useReferenceContext() {
  return useContext(ReferenceContext);
}

export function ReferenceProvider({ children }: { children: ReactNode }) {
  const [resolutionMap, setResolutionMap] = useState<ResolutionMap>(new Map());

  // Ref mirroring the latest resolutionMap so flushBatch can read current state
  // without being recreated on every state change.
  const resolutionMapRef = useRef(resolutionMap);
  resolutionMapRef.current = resolutionMap;

  // Batch queue — IDs collected synchronously, flushed on next microtask.
  const batchQueueRef = useRef<string[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBatch = useCallback(async () => {
    // Deduplicate and skip IDs already resolved by a previous batch.
    // Pending markers (undefined) are still included — only skip IDs that
    // have a concrete resolved value (ResolvedRef or null for broken).
    const ids = [...new Set(batchQueueRef.current)].filter((id) => {
      if (!resolutionMapRef.current.has(id)) return true; // not in map (shouldn't happen)
      return resolutionMapRef.current.get(id) === undefined; // still pending → include
    });
    batchQueueRef.current = [];
    batchTimerRef.current = null;

    if (ids.length === 0) return;

    try {
      const result = (await post("/references/resolve/", { ids })) as Record<
        string,
        ResolvedRef | null
      >;

      setResolutionMap((prev) => {
        const next = new Map(prev);
        for (const [id, resolved] of Object.entries(result)) {
          next.set(id, resolved ?? null);
        }
        return next;
      });
    } catch {
      // On failure, remove pending markers so retry is possible.
      // Only remove IDs that are still pending (undefined) — skip IDs that
      // another concurrent batch may have already resolved.
      setResolutionMap((prev) => {
        const next = new Map(prev);
        for (const id of ids) {
          if (next.has(id) && next.get(id) === undefined) {
            next.delete(id);
          }
        }
        return next;
      });
    }
  }, []); // stable — reads current state via refs

  const resolveIds = useCallback(
    (ids: string[]): Promise<void> => {
      // Filter out IDs already in the map (resolved, known-broken, or pending).
      const current = resolutionMapRef.current;
      const unseen = ids.filter((id) => !current.has(id));
      if (unseen.length === 0) return Promise.resolve();

      // Mark unseen as pending via functional updater so multiple
      // resolveIds calls in the same render flush all accumulate.
      setResolutionMap((prev) => {
        const next = new Map(prev);
        for (const id of unseen) {
          if (!next.has(id)) {
            next.set(id, undefined as unknown as ResolvedRef | null);
          }
        }
        return next;
      });

      // Queue for batched flush on the next microtask.
      batchQueueRef.current.push(...unseen);
      if (!batchTimerRef.current) {
        batchTimerRef.current = setTimeout(flushBatch, 0);
      }

      return Promise.resolve();
    },
    [flushBatch],
  );

  return (
    <ReferenceContext.Provider value={{ resolutionMap, resolveIds }}>
      {children}
    </ReferenceContext.Provider>
  );
}
