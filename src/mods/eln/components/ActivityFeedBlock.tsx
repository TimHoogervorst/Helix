/**
 * ActivityFeedBlock — slot-system block component for workspace sidebars.
 *
 * Registered as a block via registerBlock(), rendered by PanelRenderer in
 * workspace sidebar slots. Fetches actions from the owning mod's API and
 * subscribes to block lifecycle events on the workspace bus for optimistic
 * updates.
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
 */
import { useEffect, useRef, useState, useMemo } from "react";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";
import type { BlockLifecyclePayload } from "../../../shell/src/workspace/WorkspaceBus";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { useActivity } from "../hooks/useActivity";
import { Activity } from "../../../shell/src/shared/components/Activity";
import { groupConfirmedActions } from "../../../shell/src/shared/groupActions";
import type {
  DisplayActionItem,
  FeedItem,
  ActionUser,
} from "../../../shell/src/shared/types/actions";
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
export function mapElnAction(a: ElnAction): DisplayActionItem {
  return {
    id: a.id,
    performedBy: mapActionUser(a.performed_by),
    actionType: a.action_type,
    targetType: a.target_type,
    targetId: a.target_id,
    requestId: a.request_id ?? undefined,
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

// ── Block component ─────────────────────────────────────────────────────────

/**
 * Slot-system block that renders the Activity feed sidebar panel.
 *
 * Fetches initial actions from the API, then subscribes to all block
 * lifecycle events on the workspace bus. Each event produces an
 * optimistically-pending item. Suppresses pending-item creation during
 * programmatic content loads (e.g. initial server payload) via the
 * `eln.editor.content-loading` bus event.
 *
 * Pending items are cleared when `useBlockActionLogging` flushes accumulated
 * actions to the backend on save. The flushed keys are emitted on the bus as
 * `eln.actions.flushed` — we match by `blockInstanceId:actionType` for
 * reliable reconciliation without fragile timestamp windows.
 *
 * Refetches confirmed actions from the API on `{modId}.entry.saved`.
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

  // Merge confirmed + pending, most recent first, then group consecutive
  // confirmed items that share a requestId.
  const displayActions = useMemo<FeedItem[]>(() => {
    const all = [...confirmedItems, ...pendingItems];
    all.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return groupConfirmedActions(all);
  }, [confirmedItems, pendingItems]);

  // ── Bus subscriptions ──────────────────────────────────────────────────
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  // Suppression via content-loading events (editor → sidebar signal).
  // Falls back to isLoadingRef because React effect ordering means the
  // editor's content-loading effect fires before the sidebar's
  // subscription effect — the event is missed on initial load.
  const suppressRef = useRef(false);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  useEffect(() => {
    if (!bus) return;

    const registry = ModRegistry.getInstance();
    const blocks = registry.getBlocks();
    const unsubs: Array<() => void> = [];

    // ── Suppression gate: skip pending items during programmatic loads ──
    const loadingUnsub = bus.on(
      `${workspaceId}.editor.content-loading`,
      (payload: unknown) => {
        suppressRef.current = payload as boolean;
      },
    );
    unsubs.push(loadingUnsub);

    // ── Block lifecycle events → optimistic pending items ──────────────
    for (const [blockId, block] of blocks) {
      // Only subscribe for new-shape blocks (they have `component`)
      if (!("component" in block)) continue;

      for (const verb of VERBS) {
        const eventName = `${blockId}.${verb}`;
        const unsub = bus.on(eventName, (payload: unknown) => {
          // Skip pending items while the initial fetch is in flight
          // (covers page load where content-loading event is missed due
          // to React effect ordering) and during programmatic content
          // loads signalled by the editor.
          if (isLoadingRef.current || suppressRef.current) return;

          const p = payload as BlockLifecyclePayload;

          // Derive display label from the action catalog.
          // Falls back to the action type string when no catalog entry exists.
          const actionType = eventName; // `${blockId}.${verb}`
          const message = ModRegistry.resolveActionLabel(
            actionType,
            context.actions ?? [],
          );

          // Dedup: replace any existing pending item for the same
          // (blockInstanceId, actionType) so repeated edits don't stack.
          const dedupKey = `${p.blockInstanceId}:${eventName}`;
          setPendingItems((prev) => {
            const filtered = prev.filter(
              (item) =>
                !(
                  item.state === "pending" &&
                  item.metadata?.blockInstanceId &&
                  `${item.metadata.blockInstanceId}:${item.actionType}` ===
                    dedupKey
                ),
            );
            const pending = createPendingItem(
              eventName,
              message,
              p.blockInstanceId,
            );
            return [pending, ...filtered];
          });
          // No refetch here — actions aren't persisted until save.
          // The pending item provides optimistic feedback until then.
        });
        unsubs.push(unsub);
      }
    }

    // ── Actions flushed: clear matching pending items ──────────────────
    // useBlockActionLogging emits this after a successful batch POST,
    // carrying the `${blockInstanceId}:${verb}` keys that were flushed.
    // We match on `metadata.blockInstanceId + ":" + actionType` —
    // exact matching, no fragile timestamp window.
    const flushedUnsub = bus.on(
      "eln.actions.flushed",
      (payload: unknown) => {
        const { keys } = payload as { keys: string[] };
        const keySet = new Set(keys);
        setPendingItems((prev) =>
          prev.filter(
            (item) =>
              !(
                item.state === "pending" &&
                item.metadata?.blockInstanceId &&
                keySet.has(
                  `${item.metadata.blockInstanceId}:${item.actionType}`,
                )
              ),
          ),
        );
        // Refetch so the newly flushed actions appear as confirmed rows.
        refetchRef.current();
      },
    );
    unsubs.push(flushedUnsub);

    // ── Refetch + clear on entry save ─────────────────────────────────
    // When the entry saves, all accumulated actions are flushed to the
    // backend. Clear all pending items and refetch to get the confirmed
    // server rows. This is a safety net: even if content-loading
    // suppression misses a page-load event, or reconciliation timing is
    // off, the save event guarantees pending items don't stick forever.
    const saveUnsub = bus.on(`${workspaceId}.entry.saved`, () => {
      setPendingItems([]);
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
