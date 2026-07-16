/**
 * ActivityFeedBlock — slot-system block component for workspace sidebars.
 *
 * Registered as a block via registerBlock(), rendered by PanelRenderer in
 * workspace sidebar slots. Fetches actions from the owning mod's API and
 * subscribes to block lifecycle events on the workspace bus for optimistic
 * updates.
 *
 * Receives `bus` from PanelRenderer (imperative subscriptions) and
 * `context.entryId` from the slot context (API target).
 *
 * Mod-agnostic design: each mod registers its own ActivityFeedBlock wrapper
 * that points at its own API endpoint. The shared Activity component is pure
 * presentation — this block owns data fetching, type mapping, and bus wiring.
 */
import { useEffect, useRef, useState, useMemo } from "react";
import type { BlockComponentProps } from "../../../core/mod-system/types";
import type { BlockLifecyclePayload } from "../../../core/workspace/WorkspaceBus";
import { ModRegistry } from "../../../core/mod-system/ModRegistry";
import { useActivity } from "../hooks/useActivity";
import { Activity } from "../../../shared/components/Activity";
import type {
  DisplayActionItem,
  ActionUser,
} from "../../../shared/types/actions";
import type { ElnAction } from "../types";

const VERBS = ["created", "edited", "deleted"] as const;

// ── Type mapping ────────────────────────────────────────────────────────────

/** Map an ELN API ActionUser to the shared ActionUser shape. */
function mapActionUser(u: ElnAction["performed_by"]): ActionUser {
  return {
    id: u.id,
    username: u.username,
    firstName: u.first_name,
    lastName: u.last_name,
    color: u.color,
  };
}

/** Map an ELN API ElnAction to a confirmed DisplayActionItem. */
function mapElnAction(a: ElnAction): DisplayActionItem {
  return {
    id: a.id,
    performedBy: mapActionUser(a.performed_by),
    actionType: a.action_type,
    targetType: a.target_type,
    targetId: a.target_id,
    metadata: a.metadata,
    createdAt: a.created_at,
    state: "confirmed",
  };
}

/** Monotonic counter for unique negative pending item IDs. */
let _pendingIdCounter = 0;

/** Create a pending DisplayActionItem from a bus event. */
function createPendingItem(
  eventName: string,
  message: string,
  blockInstanceId: string,
): DisplayActionItem {
  const now = new Date().toISOString();
  return {
    id: --_pendingIdCounter, // unique negative ID — replaced on reconciliation
    performedBy: {
      id: 0,
      username: "",
      firstName: "",
      lastName: "",
      color: "",
    },
    actionType: eventName,
    targetType: "",
    targetId: 0,
    metadata: { message, blockInstanceId },
    createdAt: now,
    state: "pending",
  };
}

// ── Reconciliation ──────────────────────────────────────────────────────────

/**
 * Reconcile pending items against confirmed server items.
 *
 * A pending item is considered reconciled when a confirmed item exists with
 * the same `actionType` and a `createdAt` within ±5 seconds. Reconciled
 * items are removed — the server version takes precedence.
 */
const RECONCILE_WINDOW_MS = 5000;

function reconcilePending(
  pending: DisplayActionItem[],
  confirmed: DisplayActionItem[],
): DisplayActionItem[] {
  return pending.filter((p) => {
    const pendingTime = new Date(p.createdAt).getTime();
    return !confirmed.some((c) => {
      const confirmedTime = new Date(c.createdAt).getTime();
      return (
        c.actionType === p.actionType &&
        Math.abs(confirmedTime - pendingTime) < RECONCILE_WINDOW_MS
      );
    });
  });
}

// ── Block component ─────────────────────────────────────────────────────────

/**
 * Slot-system block that renders the Activity feed sidebar panel.
 *
 * Fetches initial actions from the API, then subscribes to all block
 * lifecycle events on the workspace bus. Each event produces an
 * optimistically-pending item and triggers a refetch. On refetch
 * completion, pending items are reconciled against confirmed server rows.
 *
 * Also subscribes to `{modId}.entry.saved` so the feed refreshes after
 * the batch action-logging flush on save.
 */
export function ActivityFeedBlock({ context, bus }: BlockComponentProps) {
  const entryId = context.entryId;
  const workspaceId = context.workspaceId ?? "eln";
  const { actions, isLoading, error, refetch } = useActivity(entryId);

  // ── Pending items from bus events ──────────────────────────────────────
  const [pendingItems, setPendingItems] = useState<DisplayActionItem[]>([]);

  // Map API actions to confirmed DisplayActionItems
  const confirmedItems = useMemo<DisplayActionItem[]>(
    () => actions.map(mapElnAction),
    [actions],
  );

  // Reconcile pending items whenever confirmed items change (refetch completes)
  useEffect(() => {
    if (confirmedItems.length > 0 && pendingItems.length > 0) {
      setPendingItems((prev) => {
        const remaining = reconcilePending(prev, confirmedItems);
        // Only update state if something actually changed
        if (remaining.length !== prev.length) return remaining;
        return prev;
      });
    }
    // Only run when confirmed items change — pendingItems is read via
    // functional setState so it doesn't need to be in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedItems]);

  // Merge confirmed + pending, most recent first
  const displayActions = useMemo<DisplayActionItem[]>(() => {
    const all = [...confirmedItems, ...pendingItems];
    all.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return all;
  }, [confirmedItems, pendingItems]);

  // ── Bus subscriptions: pending items on lifecycle events, refetch on save ──
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!bus) return;

    const registry = ModRegistry.getInstance();
    const blocks = registry.getBlocks();
    const unsubs: Array<() => void> = [];

    for (const [blockId, block] of blocks) {
      // Only subscribe for new-shape blocks (they have `component`)
      if (!("component" in block)) continue;

      for (const verb of VERBS) {
        const eventName = `${blockId}.${verb}`;
        const unsub = bus.on(eventName, (payload: unknown) => {
          const p = payload as BlockLifecyclePayload;

          // Derive human-readable message from block registration
          const attrs = verb === "edited" ? p.changedAttrs : p.attrs;
          const displayName = block.getDisplayName?.(attrs ?? {}) ?? block.label;
          const template = block.messages?.[verb];
          const message = template
            ? template.replace(/\{name\}/g, displayName)
            : `${block.label} was ${verb}`;

          // Dedup: replace any existing pending item for the same
          // (actionType, blockInstanceId) so repeated edits don't stack.
          const dedupKey = `${p.blockInstanceId}:${eventName}`;
          setPendingItems((prev) => {
            const filtered = prev.filter(
              (item) =>
                !(
                  item.state === "pending" &&
                  item.metadata?.blockInstanceId &&
                  `${item.metadata.blockInstanceId}:${item.actionType}` === dedupKey
                ),
            );
            const pending = createPendingItem(
              eventName,
              message,
              p.blockInstanceId,
            );
            return [pending, ...filtered];
          });

          // Refetch from server to reconcile
          refetchRef.current();
        });
        unsubs.push(unsub);
      }
    }

    // ── Refetch on entry save so batch-flushed actions appear ──────────
    const saveUnsub = bus.on(`${workspaceId}.entry.saved`, () => {
      refetchRef.current();
    });
    unsubs.push(saveUnsub);

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [bus, workspaceId]);

  return (
    <Activity
      actions={displayActions}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
    />
  );
}
