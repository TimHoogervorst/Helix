import type { ActivityItem } from "../types/activity";

/**
 * Placeholder hook for fetching activity data.
 *
 * Returns an empty state. The actual implementation (platform-level
 * standardized action log with CFR Part 11 traceability) is a follow-up EPIC.
 */
export function useActivity(_targetType: string, _targetId: string) {
  return {
    items: [] as ActivityItem[],
    loading: false,
  };
}
