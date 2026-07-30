/**
 * Shared ``sendAction`` implementation for block renderers.
 *
 * All renderers (TipTap, Panel, Tab) pass this function to blocks via
 * ``BlockComponentProps.sendAction``.  It calls ``POST /api/actions/``
 * with the current workspace context so blocks don't need to know about
 * the HTTP layer or the workspace ID.
 *
 * When an action catalog is provided, ``action_type`` (the core CRUD
 * verb) is resolved from the catalog.  Otherwise it is derived
 * mechanically from the last dot-segment of the action identifier.
 */

import type { ActionCatalogEntry } from "../mod-system/types";

// ── CSRF token helper (Django expects X-CSRFToken on unsafe methods) ──────

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() ?? null;
  return null;
}

/** Core CRUD verbs. */
const CORE_VERBS = new Set(["created", "edited", "deleted"]);

// ── sendAction factory ─────────────────────────────────────────────────────

/**
 * Create a ``sendAction`` function bound to a specific workspace.
 *
 * The returned function matches the
 * ``BlockComponentProps.sendAction`` signature::
 *
 *   sendAction(action, targetType, targetId, metadata?)
 *
 * It calls ``POST /api/actions/`` with ``workspace_id`` automatically
 * set from *workspaceId*.  The ``action_type`` field (core CRUD verb)
 * is resolved from *catalog* when provided, or derived from the last
 * dot-segment of the action identifier.
 */
export function createSendAction(
  workspaceId: string,
  catalog?: ActionCatalogEntry[],
): (
  action: string,
  targetType: string,
  targetId: number,
  metadata?: Record<string, unknown>,
  requestId?: string,
) => Promise<void> {
  return async (action, targetType, targetId, metadata, requestId) => {
    // Resolve the core CRUD verb.
    const resolvedActionType = resolveActionType(action, catalog);

    const body: Record<string, unknown> = {
      action,
      action_type: resolvedActionType,
      target_type: targetType,
      target_id: targetId,
      workspace_id: workspaceId,
    };

    if (metadata !== undefined) {
      body.metadata = metadata;
    }

    if (requestId !== undefined) {
      body.request_id = requestId;
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

// ── Resolution helper ──────────────────────────────────────────────────────

/**
 * Resolve the core CRUD verb for *action*.
 *
 * When *catalog* is provided, looks up the matching entry.  Falls back
 * to extracting the last dot-segment of *action* when it is a known
 * core verb.
 */
function resolveActionType(
  action: string,
  catalog?: ActionCatalogEntry[],
): string {
  // Check the catalog first.
  if (catalog) {
    const entry = catalog.find((a) => a.id === action);
    if (entry) return entry.action_type;
  }

  // Fall back to extracting the last segment.
  const verb = action.split(".").pop() ?? "";
  if (CORE_VERBS.has(verb)) return verb;

  // Default — should not happen for properly registered actions.
  return "edited";
}
