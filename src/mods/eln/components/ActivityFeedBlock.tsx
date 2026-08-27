/**
 * ActivityFeedBlock — slot-system block component for workspace sidebars.
 *
 * Registered as a block via registerBlock(), rendered by PanelRenderer in
 * workspace sidebar slots. Fetches historical actions from the owning mod's
 * API on mount and responds to save-cycle events through declarative
 * `onEvent` handlers wired by the renderer.
 *
 * The feed renders persisted API rows only. Pending actions are represented
 * by a single indicator until the accumulator reports a successful flush.
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
import { useEffect, useRef } from "react";
import type { BlockComponentProps, BlockInstance } from "../../../shell/src/mod-system/types";
import { useElnActivity } from "../hooks/useActivity";
import { Activity } from "../../../shell/src/shared/components/Activity";
export { mapElnAction } from "../hooks/useActivity";

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
  "eln.actions.pending": (instance) => {
    instance.updateAttrs({ hasPendingActions: true });
  },

  "eln.actions.flushed": (instance) => {
    const count = (instance.attrs.refetchTrigger as number) ?? 0;
    instance.updateAttrs({ hasPendingActions: false, refetchTrigger: count + 1 });
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

// ── Block component ─────────────────────────────────────────────────────────

/**
 * Slot-system block that renders the Activity feed sidebar panel.
 *
 * Fetches historical actions from the API on mount (covers other
 * users/sessions). Current-session changes are shown through the pending
 * indicator and appear after the flush refetches the API rows.
 *
 * No longer calls `bus.on()` — all event wiring is declarative through
 * `listensTo` / `onEvent` in the block registration.
 */
export function ActivityFeedBlock({ context, instance }: BlockComponentProps) {
  const entryId = context.entryId;
  const {
    items,
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
        // Clear live save state and the refetch trigger from the previous entry.
      if (instance.attrs.hasPendingActions || instance.attrs.refetchTrigger) {
        instance.updateAttrs({ hasPendingActions: false, refetchTrigger: 0 });
      }
    }
  }, [entryId, instance]);

  return (
    <Activity
      actions={items}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      hasMore={hasMore}
      onLoadMore={loadMore}
      isLoadingMore={isLoadingMore}
      hasPending={instance.attrs.hasPendingActions === true}
    />
  );
}
