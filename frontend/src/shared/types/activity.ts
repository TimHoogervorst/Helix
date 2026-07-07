/**
 * Activity types — forward-looking contract for the platform-level
 * standardized action log (CFR Part 11 traceability).
 *
 * These types define the shape of an ActivityItem. The actual backend
 * action log is designed and implemented in a follow-up EPIC.
 */

/** A single entry in the platform action log. */
export interface ActivityItem {
  /** Unique ID of the action record. */
  id: string;
  /** Username or display name of the user who performed the action. */
  user: string;
  /** Human-readable description of the action (e.g. "created the entry"). */
  action: string;
  /** ISO 8601 timestamp of when the action occurred. */
  timestamp: string;
}
