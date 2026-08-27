/**
 * ActivityFeedBlock — slot-system block component for workspace sidebars.
 *
 * Registered as a block via registerBlock(), rendered by PanelRenderer in
 * workspace sidebar slots. Fetches historical actions from the owning mod's
 * API on mount and receives real-time action items through declarative
 * `onEvent` handlers wired by the renderer.
 *
 * After #355 (declarative subscriptions), the block declares
 * `listensTo: ["eln.action.performed", "eln.entry.saved"]` and no longer
 * calls `bus.on()`.  Bus event payloads are accumulated in
 * `instance.attrs.busActionPayloads` and rendered as optimistic items
 * alongside confirmed API items.
 *
 * Display labels are derived from the backend action catalog
 * (``context.actions``) — the catalog is the single source of truth for
 * action labels (#328).  For bus-delivered items the label is already in
 * the payload.
 *
 * Mod-agnostic design: each mod registers its own ActivityFeedBlock wrapper
 * that points at its own API endpoint. The shared Activity component is pure
 * presentation — this block owns data fetching, type mapping, and merging.
 */
import { useEffect, useMemo, useRef } from "react";
import type { BlockComponentProps, BlockInstance } from "../../../shell/src/mod-system/types";
import { useElnActivity } from "../hooks/useActivity";
import { Activity } from "../../../shell/src/shared/components/Activity";
import { groupConfirmedActions } from "../../../shell/src/shared/groupActions";
import type {
  DisplayActionItem,
  FeedItem,
} from "../../../shell/src/shared/types/actions";
export { mapElnAction } from "../hooks/useActivity";

// ── Bus event payload shape ─────────────────────────────────────────────────

/** Shape of the `{workspaceId}.action.performed` bus event payload. */
export interface BusActionPayload {
  action: string;
  actionType: string;
  label: string;
  performedBy: unknown;
  createdAt: string;
  targetId: number;
  targetType: string;
  metadata: Record<string, unknown>;
  requestId: string;
}

// ── onEvent handlers (exported for declarative registration) ────────────────

/**
 * Declarative `onEvent` handlers for ActivityFeedBlock.
 *
 * Wired by the renderer (PanelRenderer / useBlockInstance) when the block
 * declares `listensTo`.  Each handler receives the block's `instance` handle
 * and the event payload.
 */
export const activityFeedOnEvent: Record<
  string,
  (instance: BlockInstance, payload: unknown) => void
> = {
  /**
   * Append a fully-resolved action item from the bus to the optimistic feed.
   * The item is rendered immediately — no API refetch needed.
   */
  "eln.action.performed": (instance, payload) => {
    const p = payload as BusActionPayload;
    const current =
      (instance.attrs.busActionPayloads as BusActionPayload[]) ?? [];
    instance.updateAttrs({ busActionPayloads: [...current, p] });
  },

  /**
   * Trigger an API refetch for non-block saves (title, description, status)
   * where no block actions were produced but the backend still created
   * entry-level actions.
   */
  "eln.entry.saved": (instance) => {
    const count = (instance.attrs.refetchTrigger as number) ?? 0;
    instance.updateAttrs({ refetchTrigger: count + 1 });
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map `context.user` to `ActionUser` for optimistic items. */
function toActionUser(user: unknown): ActionUser {
  const u = user as Record<string, unknown> | null | undefined;
  if (!u) {
    return { id: "unknown", username: "Unknown" };
  }
  return {
    id: (u.id as string | number) ?? "unknown",
    username: (u.username as string) ?? (u.name as string) ?? "Unknown",
    firstName: u.firstName as string | undefined,
    lastName: u.lastName as string | undefined,
    color: u.color as string | undefined,
  };
}

/** Build optimistic `DisplayActionItem` entries from bus event payloads. */
function buildOptimisticItems(
  payloads: BusActionPayload[],
  user: unknown,
): DisplayActionItem[] {
  const actionUser = toActionUser(user);
  return payloads.map((p) => ({
    id: `optimistic-${p.requestId}`,
    performedBy: actionUser,
    action: p.action,
    actionType: p.actionType,
    targetType: p.targetType,
    targetId: p.targetId,
    requestId: p.requestId,
    metadata: p.metadata,
    createdAt: p.createdAt,
    state: "pending" as const,
  }));
}

// ── Block component ─────────────────────────────────────────────────────────

/**
 * Slot-system block that renders the Activity feed sidebar panel.
 *
 * Fetches historical actions from the API on mount (covers other
 * users/sessions).  Real-time actions from the current session arrive via
 * the declarative `onEvent` handler and are rendered optimistically.
 *
 * No longer calls `bus.on()` — all event wiring is declarative through
 * `listensTo` / `onEvent` in the block registration.
 */
export function ActivityFeedBlock({ context, instance }: BlockComponentProps) {
  const entryId = context.entryId;
  const {
    actions,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    refetch,
    loadMore,
  } = useElnActivity(entryId);

  // ── Refetch trigger from onEvent ──────────────────────────────────────
  //
  // When `eln.entry.saved` fires (non-block save), the onEvent handler
  // increments `refetchTrigger` in attrs.  We watch for changes and call
  // `refetch()` to pull in entry-level actions (title, description, etc.).
  const refetchTrigger = instance.attrs.refetchTrigger as number | undefined;
  const prevTriggerRef = useRef(refetchTrigger);

  useEffect(() => {
    // Skip the initial value (undefined) and the reset value (0) used
    // when clearing state on entry change.  Only positive integers
    // represent genuine refetch requests from onEvent.
    if (
      refetchTrigger !== undefined &&
      refetchTrigger !== 0 &&
      refetchTrigger !== prevTriggerRef.current
    ) {
      refetch();
    }
    prevTriggerRef.current = refetchTrigger;
  }, [refetchTrigger, refetch]);

  // ── Clear bus payloads when entry changes ─────────────────────────────
  const prevEntryIdRef = useRef<string | undefined>(entryId);

  useEffect(() => {
    if (entryId !== prevEntryIdRef.current) {
      prevEntryIdRef.current = entryId;
      // Clear stale optimistic items and refetch trigger from previous entry
      if (instance.attrs.busActionPayloads || instance.attrs.refetchTrigger) {
        instance.updateAttrs({ busActionPayloads: [], refetchTrigger: 0 });
      }
    }
  }, [entryId, instance]);

  // ── Build display items ───────────────────────────────────────────────
  //
  // Merges confirmed API items with optimistic bus-delivered items.
  // Optimistic items whose requestId matches a confirmed item are dropped
  // (they've been persisted and the confirmed version takes precedence).
  const displayItems = useMemo<FeedItem[]>(() => {
    // Confirmed items from API
    const confirmed: DisplayActionItem[] = actions;

    // Optimistic items from bus events
    const payloads =
      (instance.attrs.busActionPayloads as BusActionPayload[]) ?? [];
    const optimistic = buildOptimisticItems(payloads, context.user);

    // Dedup: remove optimistic items whose requestId matches a confirmed item
    const confirmedRequestIds = new Set(
      confirmed.map((a) => a.requestId).filter(Boolean),
    );
    const pendingOptimistic = optimistic.filter(
      (a) => !confirmedRequestIds.has(a.requestId),
    );

    // Merge: bus events first (most recent real-time), then API items.
    // Sort by createdAt descending so newest items appear at the top.
    const merged = [...pendingOptimistic, ...confirmed];
    const sorted = [...merged].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return groupConfirmedActions(sorted);
  }, [actions, instance.attrs.busActionPayloads, context.user]);

  return (
    <Activity
      actions={displayItems}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      hasMore={hasMore}
      onLoadMore={loadMore}
      isLoadingMore={isLoadingMore}
    />
  );
}
