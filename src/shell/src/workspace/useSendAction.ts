/**
 * React hook that returns a stable ``sendAction`` function bound to a
 * specific workspace.
 *
 * Used by all renderers (TipTap, Panel, Tab, Sidebar) to pass
 * ``sendAction`` to blocks via ``BlockComponentProps``.
 */
import { useMemo } from "react";
import { createSendAction } from "./sendAction";

/**
 * Return a memoized ``sendAction`` function for the given workspace.
 *
 * The returned function is stable across re-renders as long as
 * *workspaceId* doesn't change.
 */
export function useSendAction(
  workspaceId: string,
): (
  actionType: string,
  targetType: string,
  targetId: number,
  metadata?: Record<string, unknown>,
) => Promise<void> {
  return useMemo(() => createSendAction(workspaceId), [workspaceId]);
}
