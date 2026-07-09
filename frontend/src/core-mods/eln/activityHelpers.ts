import type { ElnAction } from "./types";

/**
 * Helpers for rendering activity/action data in the ELN workspace.
 */

/**
 * Map an `action_type` string to a human-readable past-tense phrase suitable
 * for display in the Activity feed.
 *
 * Handles the known platform action types. Falls back to a generic phrase
 * incorporating the raw action_type for unrecognised values.
 */
export function actionLabel(actionType: string): string {
  switch (actionType) {
    case "created":
      return "Created this entry";
    case "edited":
      return "Edited this entry";
    default:
      // Capitalise the first letter and treat the rest as-is.
      // e.g. "commented" → "Commented on this entry"
      const capitalised =
        actionType.charAt(0).toUpperCase() + actionType.slice(1);
      return `${capitalised} on this entry`;
  }
}

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
      a.action_type === "edited" &&
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
