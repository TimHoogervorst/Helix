/**
 * Activity — reusable timeline showing actions performed on an item.
 *
 * Placeholder shell. The actual implementation (platform-level standardized
 * action log with CFR Part 11 traceability) is a follow-up EPIC.
 *
 * Future: reads from a registered action-log service, rendering a timeline
 * of user + action + timestamp entries.
 */

export interface ActivityProps {
  /** The type of target the actions are scoped to. */
  targetType: "entity" | "entry" | string;
  /** The unique identifier of the target. */
  targetId: string;
  /** Maximum number of actions to display. Default: all. */
  limit?: number;
  /** Render in a compact layout. Default: false. */
  compact?: boolean;
}

function Activity(_props: ActivityProps) {
  return (
    <div className="activity-placeholder">
      <p className="text-sm text-muted-foreground">
        Activity — coming soon
      </p>
    </div>
  );
}

export default Activity;
