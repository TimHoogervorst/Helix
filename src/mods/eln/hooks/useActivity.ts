import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useActivity as useSharedActivity,
  type ActivitySubject,
  type UseActivityResult,
} from "../../../shell/src/shared/hooks/useActivity";
import type { DisplayActionItem, ActionUser } from "../../../shell/src/shared/types/actions";
import { fetchActions } from "../api";
import type { ElnAction } from "../types";

function mapActionUser(u: ElnAction["performed_by"]): ActionUser {
  return {
    id: u.id,
    username: u.username,
    firstName: u.first_name,
    lastName: u.last_name,
    color: u.color,
  };
}

export function mapElnAction(a: ElnAction): DisplayActionItem {
  return {
    id: a.id,
    performedBy: mapActionUser(a.performed_by),
    action: a.action,
    actionType: a.action_type,
    targetType: a.target_type,
    targetId: a.target_id,
    requestId: a.request_id ?? undefined,
    metadata: a.metadata,
    createdAt: a.created_at,
    state: "confirmed",
  };
}

/** Bind the shared activity core to the ELN entry actions endpoint. */
export function useElnActivity(entryId: string | undefined): UseActivityResult {
  const subject = useMemo<ActivitySubject<ElnAction>>(
    () => ({
      key: entryId,
      fetchPage: (url) => fetchActions(entryId ?? "", undefined, undefined, url),
      map: mapElnAction,
    }),
    [entryId],
  );

  return useSharedActivity(subject);
}

export interface LegacyActivityResult {
  actions: ElnAction[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/** Raw action compatibility used by the ELN header's editor avatars. */
export function useActivity(entryId: string | undefined): LegacyActivityResult {
  const [actions, setActions] = useState<ElnAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
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
      .then((page) => {
        if (!cancelled) setActions(page.results);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load activity");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entryId, version]);

  const refetch = useCallback(() => setVersion((current) => current + 1), []);
  return { actions, isLoading, error, refetch };
}
