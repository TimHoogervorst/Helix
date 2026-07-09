import { useState } from "react";
import type { UseActivityResult } from "../hooks/useActivity";
import type { ElnAction } from "../types";
import { actionLabel } from "../activityHelpers";
import { relativeTime } from "../../../shared/format";

/**
 * Derive a display name from an action's `performed_by` user.
 * Uses "First Last" when available, falling back to username.
 */
function actorName(action: ElnAction): string {
  const u = action.performed_by;
  if (u.first_name || u.last_name) {
    return `${u.first_name} ${u.last_name}`.trim();
  }
  return u.username;
}

export interface ActivityFeedProps {
  /** Activity state from useActivity. */
  data: UseActivityResult;
}

/** Maximum items shown before the "Show all" toggle appears. */
const PREVIEW_ITEM_COUNT = 10;

/**
 * Activity feed sidebar component.
 *
 * Renders a list of actions for an ELN entry with loading, empty, and error
 * states. Shows a 10-item preview with a "Show all (N)" toggle when there are
 * more than 10 items.
 */
function ActivityFeed({ data }: ActivityFeedProps) {
  const { actions, isLoading, error, refetch } = data;
  const [showAll, setShowAll] = useState(false);

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <section>
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Activity
        </h3>
        <ul className="space-y-3 text-[12px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-start gap-2 animate-pulse">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-hairline"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block h-3 w-24 rounded bg-hairline" />
                <span className="block h-3 w-32 rounded bg-hairline" />
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return (
      <section>
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Activity
        </h3>
        <div data-testid="activity-error">
          <p className="text-[12px] text-muted-foreground">
            Could not load activity
          </p>
          <button
            className="mt-1.5 text-[12px] text-primary hover:underline"
            onClick={refetch}
            data-testid="activity-retry"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (actions.length === 0) {
    return (
      <section>
        <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Activity
        </h3>
        <p
          className="text-[12px] text-muted-foreground/60 italic px-0.5"
          data-testid="activity-empty"
        >
          No activity yet
        </p>
      </section>
    );
  }

  // ── Normal state ───────────────────────────────────────────────────────
  const visible = showAll ? actions : actions.slice(0, PREVIEW_ITEM_COUNT);
  const hasMore = actions.length > PREVIEW_ITEM_COUNT;

  return (
    <section>
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Activity
      </h3>
      <ul className="space-y-2 text-[12px]">
        {visible.map((action) => (
          <li
            key={action.id}
            className="flex items-start gap-2"
            data-testid="activity-item"
          >
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 text-muted-foreground">
              <span className="font-medium text-foreground">
                {actorName(action)}
              </span>{" "}
              {actionLabel(action.action_type)}
            </span>
            <span className="shrink-0 text-muted-foreground/70">
              · {relativeTime(action.created_at)}
            </span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          className="mt-2 text-[12px] text-primary hover:underline"
          onClick={() => setShowAll((prev) => !prev)}
          data-testid="activity-show-all"
        >
          {showAll ? "Show less" : `Show all (${actions.length})`}
        </button>
      )}
    </section>
  );
}

export default ActivityFeed;
