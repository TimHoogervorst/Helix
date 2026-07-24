/**
 * Shared ``sendAction`` implementation for block renderers.
 *
 * All renderers (TipTap, Panel, Tab) pass this function to blocks via
 * ``BlockComponentProps.sendAction``.  It calls ``POST /api/actions/``
 * with the current workspace context so blocks don't need to know about
 * the HTTP layer or the workspace ID.
 */

// ── CSRF token helper (Django expects X-CSRFToken on unsafe methods) ──────

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() ?? null;
  return null;
}

// ── sendAction factory ─────────────────────────────────────────────────────

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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Attach Django CSRF token for POST requests
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) {
      headers["X-CSRFToken"] = csrfToken;
    }

    const response = await fetch("/api/actions/", {
      method: "POST",
      headers,
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
