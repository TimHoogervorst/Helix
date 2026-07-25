/**
 * Shared formatting utilities.
 *
 * Import from here instead of defining inline formatDate copies.
 */

/** Format an ISO 8601 timestamp as a locale-aware human-readable string. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * Return a human-readable relative time string for an ISO 8601 timestamp.
 *
 * E.g. "just now", "2m ago", "3h ago", "yesterday", "5d ago", "2mo ago".
 */
export function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Humanize a triple-dotted action identifier for display.
 *
 * Mechanical, zero-registration: splits on ".", takes the last segment
 * as the verb, replaces underscores with spaces, and capitalises each word.
 *
 * Examples:
 * - "eln.entry.created"          → "Created"
 * - "eln.table.edited"           → "Edited"
 * - "lims.entity.status_changed" → "Status Changed"
 */
export function humanizeActionType(action: string): string {
  if (!action) return "Unknown action";
  const parts = action.split(".");
  const verb = parts[parts.length - 1];
  return verb
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
