/**
 * Context + provider for sharing resolved reference data with node views.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { post } from "../api/client";
import type { ResolvedRef } from "../types/references";

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

  const resolveIds = useCallback(async (ids: string[]) => {
    // Filter out IDs we already have (resolved or known-broken)
    const unseen = ids.filter((id) => !resolutionMap.has(id));
    if (unseen.length === 0) return;

    // Mark unseen as pending so we don't re-request them
    const pending = new Map(resolutionMap);
    for (const id of unseen) {
      pending.set(id, undefined as unknown as ResolvedRef | null);
    }
    setResolutionMap(pending);

    try {
      const result = (await post("/references/resolve/", { ids: unseen })) as Record<
        string,
        ResolvedRef | null
      >;
      const next = new Map(pending);
      for (const [id, resolved] of Object.entries(result)) {
        next.set(id, resolved ?? null);
      }
      setResolutionMap(next);
    } catch {
      // On failure, remove the pending markers so retry is possible
      const rollback = new Map(resolutionMap);
      for (const id of unseen) {
        rollback.delete(id);
      }
      setResolutionMap(rollback);
    }
  }, [resolutionMap]);

  return (
    <ReferenceContext.Provider value={{ resolutionMap, resolveIds }}>
      {children}
    </ReferenceContext.Provider>
  );
}
