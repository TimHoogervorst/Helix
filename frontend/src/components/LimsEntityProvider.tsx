/**
 * Context + provider for sharing resolved LIMS entity data with components.
 *
 * Mirrors ReferenceProvider: collects display IDs, batch-fetches via
 * POST /api/lims/entities/batch/, caches in a Map.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { post } from "../api/client";
import type { EntityBatchResult } from "../types/lims";

type EntityMap = Map<string, EntityBatchResult | null>;

interface LimsEntityContextValue {
  entityMap: EntityMap;
  resolveEntityIds: (ids: string[]) => Promise<void>;
}

const LimsEntityContext = createContext<LimsEntityContextValue>({
  entityMap: new Map(),
  resolveEntityIds: async () => {},
});

export function useLimsEntityContext() {
  return useContext(LimsEntityContext);
}

export function LimsEntityProvider({ children }: { children: ReactNode }) {
  const [entityMap, setEntityMap] = useState<EntityMap>(new Map());

  const resolveEntityIds = useCallback(async (ids: string[]) => {
    const unseen = ids.filter((id) => !entityMap.has(id));
    if (unseen.length === 0) return;

    const pending = new Map(entityMap);
    for (const id of unseen) {
      pending.set(id, undefined as unknown as EntityBatchResult | null);
    }
    setEntityMap(pending);

    try {
      const result = (await post("/lims/entities/batch/", { ids: unseen })) as Record<
        string,
        EntityBatchResult | null
      >;
      const next = new Map(pending);
      for (const [id, resolved] of Object.entries(result)) {
        next.set(id, resolved ?? null);
      }
      setEntityMap(next);
    } catch {
      const rollback = new Map(entityMap);
      for (const id of unseen) {
        rollback.delete(id);
      }
      setEntityMap(rollback);
    }
  }, [entityMap]);

  return (
    <LimsEntityContext.Provider value={{ entityMap, resolveEntityIds }}>
      {children}
    </LimsEntityContext.Provider>
  );
}
