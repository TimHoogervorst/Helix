import { useState } from "react";
import type {
  DisplayActionItem,
  GroupedDisplayItem,
  FeedItem,
  ActionUser,
} from "../types/actions";
import { relativeTime, humanizeActionType } from "../format";
import { isGroup } from "../groupActions";

/**
 * Derive a display name from an action's `performedBy` user.
 * Uses "First Last" when available, falling back to username.
 */
export function actorName(user: ActionUser): string {
  if (user.firstName || user.lastName) {
    return `${user.firstName} ${user.lastName}`.trim();
  }
  return user.username;
}

/**
 * Resolve the best human-readable message for a display action item.
 *
 * Block-declared actions carry a pre-computed `metadata.message`
 * (e.g. "Table 'Samples' edited"). Entry-level actions fall back to
 * the mechanically humanized verb.
 */
function actionMessage(item: DisplayActionItem): string {
  const msg = item.metadata?.message;
  if (typeof msg === "string" && msg.length > 0) {
    return msg;
  }
  return humanizeActionType(item.actionType);
}

export interface ActivityProps {
  /** Actions to display, most recent first. May include grouped batches. */
  actions: FeedItem[];
  /** True while the initial fetch is in flight. */
  isLoading?: boolean;
  /** Non-null if the fetch failed. */
  error?: string | null;
  /** Called when the user clicks the retry button in the error state. */
  onRetry?: () => void;
}

/** Maximum items shown before the "Show all" toggle appears. */
const PREVIEW_ITEM_COUNT = 10;

/**
 * Cross-mod activity feed component.
 *
 * Renders a chronological list of action log entries with loading, empty,
 * and error states. Shows a 10-item preview with a "Show all (N)" toggle
 * when there are more than 10 items.
 *
 * Supports three visual states per item:
 * - **confirmed** — returned from server with real ID, rendered normally.
 * - **pending**   — optimistically added from bus events, slightly dimmed
 *                   with a subtle pulse animation.
 * - **reconciled** — pending matched to confirmed server row; transitions
 *                    to confirmed state on next render.
 *
 * Mod-agnostic — accepts generic `DisplayActionItem[]`. Each mod maps its
 * API response shape into this interface.
 */
export function Activity({
  actions,
  isLoading,
  error,
  onRetry,
}: ActivityProps) {
  const [showAll, setShowAll] = useState(false);

  // ── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <section>
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
        <div data-testid="activity-error">
          <p className="text-[12px] text-muted-foreground">
            Could not load activity
          </p>
          {onRetry && (
            <button
              className="mt-1.5 text-[12px] text-primary hover:underline"
              onClick={onRetry}
              data-testid="activity-retry"
            >
              Retry
            </button>
          )}
        </div>
      </section>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (actions.length === 0) {
    return (
      <section>
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
      <ul className="space-y-2 text-[12px]">
        {visible.map((item) =>
          isGroup(item) ? (
            <GroupedActivityItem key={item.id} group={item} />
          ) : (
            <ActivityItem key={item.id} action={item} />
          ),
        )}
      </ul>
      {hasMore && (
        <button
          className="btn-ghost mt-2 rounded-md px-2 py-1 text-[12px]"
          onClick={() => setShowAll((prev) => !prev)}
          data-testid="activity-show-all"
        >
          {showAll ? "Show less" : `Show all (${actions.length})`}
        </button>
      )}
    </section>
  );
}

// ── Internal: grouped activity item ────────────────────────────────────────

interface GroupedActivityItemProps {
  group: GroupedDisplayItem;
}

function GroupedActivityItem({ group }: GroupedActivityItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li data-testid="activity-item" data-state={group.state}>
      <button
        type="button"
        className="btn-ghost flex w-full items-start gap-2 p-0 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        data-testid="activity-group-toggle"
      >
        <span
          className="mt-1.5 shrink-0 text-[10px] leading-none text-muted-foreground/70"
          aria-hidden="true"
        >
          {expanded ? "▾" : "▸"}
        </span>
        <span
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 text-muted-foreground">
          <span className="font-medium text-foreground">
            {actorName(group.performedBy)}
          </span>{" "}
          {group.summary}
        </span>
        <span className="shrink-0 text-muted-foreground/70">
          · {relativeTime(group.createdAt)}
        </span>
      </button>
      {expanded && (
        <ul className="mt-1 space-y-1">
          {group.children.map((child) => (
            <ActivityItem key={child.id} action={child} isGroupChild />
          ))}
        </ul>
      )}
    </li>
  );
}

// ── Internal: single activity item ────────────────────────────────────────

interface ActivityItemProps {
  action: DisplayActionItem;
  /** When true, the item is rendered inside an expanded group. */
  isGroupChild?: boolean;
}

function ActivityItem({ action, isGroupChild = false }: ActivityItemProps) {
  const isPending = action.state === "pending";
  const containerClass = [
    "flex items-start gap-2",
    isPending && "opacity-60 animate-pulse",
  ]
    .filter(Boolean)
    .join(" ");

  const dotClass = isPending
    ? "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
    : "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70";

  return (
    <li
      className={containerClass}
      data-testid={isGroupChild ? "activity-group-child" : "activity-item"}
      data-state={action.state}
    >
      <span className={dotClass} aria-hidden="true" />
      <span className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">
          {actorName(action.performedBy)}
        </span>{" "}
        {actionMessage(action)}
      </span>
      <span className="shrink-0 text-muted-foreground/70">
        · {relativeTime(action.createdAt)}
      </span>
    </li>
  );
}

export default Activity;
