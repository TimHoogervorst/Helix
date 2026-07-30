/**
 * ActivityFeedBlock — slot-system block component for workspace sidebars.
 *
 * Registered as a block via registerBlock(), rendered by PanelRenderer in
 * workspace sidebar slots. Fetches actions from the owning mod's API and
 * refetches when action events fire on the workspace bus.
 *
 * Receives `bus` from PanelRenderer (imperative subscriptions) and
 * `context.entryId` / `context.actions` from the slot context.
 *
 * Display labels are derived from the backend action catalog
 * (``context.actions``) — the catalog is the single source of truth for
 * action labels (#328). Falls back to the ``action_type`` string when no
 * catalog entry exists.
 *
 * Mod-agnostic design: each mod registers its own ActivityFeedBlock wrapper
 * that points at its own API endpoint. The shared Activity component is pure
 * presentation — this block owns data fetching, type mapping, and bus wiring.
 *
 * After #351 (useActionAccumulator replaces useBlockActionLogging), block
 * lifecycle events are no longer on the public bus.  Instead,
 * `{workspaceId}.action.performed` is emitted per flushed action.  We
 * refetch confirmed actions from the API when action events arrive.
 * For non-block saves (title, description) where no block actions were
 * produced, `{workspaceId}.entry.saved` still triggers a refetch so the
 * feed picks up the entry-level edit action.
 */
import { useEffect, useRef, useState, useMemo } from "react";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";
import { useActivity } from "../hooks/useActivity";
import { Activity } from "../../../shell/src/shared/components/Activity";
import { groupConfirmedActions } from "../../../shell/src/shared/groupActions";
import type {
  DisplayActionItem,
  FeedItem,
  ActionUser,
} from "../../../shell/src/shared/types/actions";
import type { ElnAction } from "../types";

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
export function mapElnAction(a: ElnAction): DisplayActionItem {
  return {
    id: a.id,
    performedBy: mapActionUser(a.performed_by),
    action: a.action,
    actionType: a.action_type,
    targetType: a.target_type,
    targetId: a.target_id,
    requestId: a.request_id ?? undefined,
    metadata: a.metadata,
    createdAt: a.created_at,
    state: "confirmed",
  };
}

// ── Block component ─────────────────────────────────────────────────────────

/**
 * Slot-system block that renders the Activity feed sidebar panel.
 *
 * Fetches initial actions from the API, then subscribes to bus events for
 * refetch signals.  After #351, block lifecycle events are no longer on the
 * public bus — instead, `useActionAccumulator` inside `TipTapRenderer`
 * emits `{workspaceId}.action.performed` per flushed action.  For non-block
 * saves (title, description), `{workspaceId}.entry.saved` still triggers a
 * refetch.
 */
export function ActivityFeedBlock({ context, bus }: BlockComponentProps) {
  const entryId = context.entryId;
  const workspaceId = context.workspaceId ?? "eln";
  const { actions, isLoading, error, refetch } = useActivity(entryId);

  // Map API actions to confirmed DisplayActionItems
  const displayActions = useMemo<FeedItem[]>(() => {
    const confirmed: DisplayActionItem[] = actions.map(mapElnAction);
    const sorted = [...confirmed].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return groupConfirmedActions(sorted);
  }, [actions]);

  // ── Bus subscriptions ──────────────────────────────────────────────────
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!bus) return;

    const unsubs: Array<() => void> = [];

    // ── Action performed: block action was flushed to the API ───────────
    const actionPerformedUnsub = bus.on(
      `${workspaceId}.action.performed`,
      () => {
        refetchRef.current();
      },
    );
    unsubs.push(actionPerformedUnsub);

    // ── Entry saved: non-block save (title, description, status) ────────
    // Covers saves where no block actions were produced (accumulator was
    // empty) but the backend still created entry-level actions.
    const entrySavedUnsub = bus.on(
      `${workspaceId}.entry.saved`,
      () => {
        refetchRef.current();
      },
    );
    unsubs.push(entrySavedUnsub);

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
