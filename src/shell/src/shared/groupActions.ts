/**
 * Pure utility for grouping consecutive confirmed DisplayActionItems by their
 * shared requestId.
 *
 * Grouping rules:
 * - 1 child:  passes through as a flat DisplayActionItem — no group wrapper
 * - 2 children: produces a GroupedDisplayItem with summary joining both action
 *   messages with "and" (e.g. "Edited a LimsTable and a Protocol")
 * - 3+ children: produces a GroupedDisplayItem with summary "Made several changes"
 * - Pending items are never grouped (they lack a requestId)
 * - Grouping is consecutive-only — items sharing a requestId but separated by
 *   an unrelated row are not grouped
 */

import type {
  DisplayActionItem,
  GroupedDisplayItem,
  FeedItem,
} from "./types/actions";
import { humanizeActionType } from "./format";

// ── Type guard ─────────────────────────────────────────────────────────────

/** Type guard: narrows a FeedItem to GroupedDisplayItem. */
export function isGroup(item: FeedItem): item is GroupedDisplayItem {
  return "type" in item && item.type === "group";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract a human-readable message from a display action item. */
function itemMessage(item: DisplayActionItem): string {
  const msg = item.metadata?.message;
  if (typeof msg === "string" && msg.length > 0) {
    return msg;
  }
  return humanizeActionType(item.actionType);
}

/** Build a GroupedDisplayItem from a non-empty array of 2+ children. */
function makeGroup(
  children: DisplayActionItem[],
  summary: string,
): GroupedDisplayItem {
  // Find the most recent child by comparing timestamps — order-independent,
  // since the function doesn't know the sort order of the input array.
  const mostRecent = children.reduce((a, b) =>
    new Date(a.createdAt).getTime() > new Date(b.createdAt).getTime() ? a : b,
  );
  return {
    type: "group",
    id: `group-${mostRecent.requestId!}`,
    summary,
    children,
    createdAt: mostRecent.createdAt,
    performedBy: mostRecent.performedBy,
    state: "confirmed",
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Group consecutive confirmed `DisplayActionItem` entries by their shared
 * `requestId`.
 *
 * Pure function — no side effects, no React dependency. The output is a flat
 * list of `FeedItem` entries (either flat `DisplayActionItem` or
 * `GroupedDisplayItem`) suitable for rendering in the Activity feed.
 *
 * Rules (applied in order):
 * 1. Pending items and items without a `requestId` always pass through
 *    ungrouped.
 * 2. Consecutive confirmed items with the same `requestId` are collected into
 *    a run.
 * 3. A run of 1 child passes through as a flat `DisplayActionItem`.
 * 4. A run of 2 children produces a `GroupedDisplayItem` with a summary
 *    joining both messages with "and".
 * 5. A run of 3+ children produces a `GroupedDisplayItem` with the summary
 *    "Made several changes".
 * 6. Items sharing a `requestId` but separated by an unrelated row are NOT
 *    grouped — only consecutive runs count.
 */
export function groupConfirmedActions(
  items: DisplayActionItem[],
): FeedItem[] {
  const result: FeedItem[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];

    // Pending items and items without a requestId always pass through.
    if (item.state !== "confirmed" || !item.requestId) {
      result.push(item);
      i++;
      continue;
    }

    // Collect a consecutive run of confirmed items with the same requestId.
    const run: DisplayActionItem[] = [item];
    let j = i + 1;
    while (
      j < items.length &&
      items[j].state === "confirmed" &&
      items[j].requestId === item.requestId
    ) {
      run.push(items[j]);
      j++;
    }

    if (run.length === 1) {
      // Singleton — pass through as flat, no group wrapper.
      result.push(run[0]);
    } else if (run.length === 2) {
      // Pair — join messages with "and".
      const summary = `${itemMessage(run[0])} and ${itemMessage(run[1])}`;
      result.push(makeGroup(run, summary));
    } else {
      // 3+ — generic summary.
      result.push(makeGroup(run, "Made several changes"));
    }

    i = j;
  }

  return result;
}
