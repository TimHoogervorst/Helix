/**
 * Shared formatting utilities.
 *
 * Import from here instead of defining inline formatDate copies.
 */

/** Format an ISO 8601 timestamp as a locale-aware human-readable string. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}
