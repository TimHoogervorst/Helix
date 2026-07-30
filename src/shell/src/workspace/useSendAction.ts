/**
 * React hook that returns a stable ``sendAction`` function bound to a
 * specific workspace.
 *
 * Used by all renderers (TipTap, Panel, Tab, Sidebar) to pass
 * ``sendAction`` to blocks via ``BlockComponentProps``.
 *
 * Looks up the action catalog from ``ModRegistry`` so ``sendAction`` can
 * resolve the core ``action_type`` for each action.
 */
import { useMemo } from "react";
import { createSendAction } from "./sendAction";
import { ModRegistry } from "../mod-system/ModRegistry";

/**
 * Return a memoized ``sendAction`` function for the given workspace.
 *
 * The returned function is stable across re-renders as long as
 * *workspaceId* doesn't change.
 */
export function useSendAction(
  workspaceId: string,
): (
  action: string,
  targetType: string,
  targetId: number,
  metadata?: Record<string, unknown>,
  requestId?: string,
) => Promise<void> {
  return useMemo(() => {
    const catalog = ModRegistry.getInstance().getActions(workspaceId);
    return createSendAction(workspaceId, catalog);
  }, [workspaceId]);
}
