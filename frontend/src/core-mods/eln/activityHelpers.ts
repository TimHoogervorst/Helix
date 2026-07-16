import type { ElnAction } from "./types";

/**
 * Helpers for rendering activity/action data in the ELN workspace.
 *
 * Note: `actionLabel()` has been removed — the shared Activity component now
 * humanizes action types mechanically from the triple-dotted `actionType`
 * string (see `humanizeActionType` in `shared/components/Activity.tsx`).
 */

/**
 * Return the distinct editors from the last week, most recent first.
 *
 * Filters actions to edit events within a 7-day window, then deduplicates
 * by user so each editor appears only once.
 */
export function getRecentEditors(actions: ElnAction[]): ElnAction[] {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const seen = new Set<number>();
  const unique: ElnAction[] = [];
  for (const a of actions) {
    if (
      (a.action_type === "edited" || a.action_type.endsWith(".edited")) &&
      new Date(a.created_at) >= oneWeekAgo
    ) {
      if (!seen.has(a.performed_by.id)) {
        seen.add(a.performed_by.id);
        unique.push(a);
      }
    }
  }
  return unique;
}
