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
