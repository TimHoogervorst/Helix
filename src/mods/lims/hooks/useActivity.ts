import { useMemo } from "react";
import {
  useActivity as useSharedActivity,
  type ActivitySubject,
  type UseActivityResult,
} from "../../../shell/src/shared/hooks/useActivity";
import type { ActionUser, DisplayActionItem } from "../../../shell/src/shared/types/actions";
import { fetchEntityActions } from "../hub/api";
import type { LimsAction } from "../types";

function mapActionUser(user: LimsAction["performed_by"]): ActionUser {
  if (!user) {
    return { id: 0, username: "Unknown user", firstName: "", lastName: "", color: "" };
  }
  return {
    id: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
    color: user.color,
  };
}

export function mapLimsAction(action: LimsAction): DisplayActionItem {
  return {
    id: action.id,
    performedBy: mapActionUser(action.performed_by),
    action: action.action,
    actionType: action.action_type,
    targetType: action.target_type,
    targetId: action.target_id,
    requestId: action.request_id ?? undefined,
    metadata: action.metadata,
    createdAt: action.created_at,
    state: "confirmed",
  };
}

/** Bind the shared activity feed to one LIMS entity. */
export function useLimsActivity(entityId: string | undefined): UseActivityResult {
  const subject = useMemo<ActivitySubject<LimsAction>>(
    () => ({
      key: entityId,
      fetchPage: (url) => fetchEntityActions(entityId ?? "", url),
      map: mapLimsAction,
    }),
    [entityId],
  );

  return useSharedActivity(subject);
}
