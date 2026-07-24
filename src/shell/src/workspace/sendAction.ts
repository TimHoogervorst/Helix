/**
 * Shared ``sendAction`` implementation for block renderers.
 *
 * All renderers (TipTap, Panel, Tab) pass this function to blocks via
 * ``BlockComponentProps.sendAction``.  It calls ``POST /api/actions/``
 * with the current workspace context so blocks don't need to know about
 * the HTTP layer or the workspace ID.
 */

/**
 * Create a ``sendAction`` function bound to a specific workspace.
 *
 * The returned function matches the
 * ``BlockComponentProps.sendAction`` signature::
 *
 *   sendAction(actionType, targetType, targetId, metadata?)
 *
 * It calls ``POST /api/actions/`` with ``workspace_id`` automatically
 * set from *workspaceId*.
 */
export function createSendAction(
  workspaceId: string,
): (
  actionType: string,
  targetType: string,
  targetId: number,
  metadata?: Record<string, unknown>,
) => Promise<void> {
  return async (actionType, targetType, targetId, metadata) => {
    const body: Record<string, unknown> = {
      action_type: actionType,
      target_type: targetType,
      target_id: targetId,
      workspace_id: workspaceId,
    };

    if (metadata !== undefined) {
      body.metadata = metadata;
    }

    const response = await fetch("/api/actions/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `sendAction failed (${response.status}): ${errorText}`,
      );
    }
  };
}
