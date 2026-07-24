/**
 * useBlockActionLogging — accumulates block lifecycle events and flushes
 * block-declared actions to the backend on entry save via ``sendAction()``.
 *
 * Owns: subscription to block lifecycle events, in-memory accumulation map,
 * dedup by (blockInstanceId, verb), human-readable message derivation from
 * the action catalog (``ModRegistry.getActions()``), and the flush-to-API on
 * save.
 * Does NOT own: save detection (the caller emits "eln.entry.saved" on the bus),
 * block registration, or the action message format.
 *
 * Key behaviours:
 * - Subscribes to `{blockId}.created`, `{blockId}.edited`, `{blockId}.deleted`
 *   for each ID in `blockIds`.
 * - Derives display labels from the backend action catalog (hydrated via
 *   ``GET /api/mod-registry/``), falling back to the action type string when
 *   no catalog entry exists.
 * - Accumulates events in a Map keyed by `${blockInstanceId}:${verb}`.
 *   Same key overwrites — only the latest state per block per verb survives
 *   (dedup within a save cycle).
 * - On `"eln.entry.saved"` event: if the map is non-empty and
 *   `numericEntryId` is truthy, calls ``sendAction()`` for each accumulated
 *   action via ``POST /api/actions/`` (the unified endpoint, #327) and
 *   emits ``eln.actions.flushed`` with the flushed keys on success.  If the
 *   map is empty, still emits ``eln.actions.flushed`` with ``keys: []`` so
 *   listeners (ActivityFeedBlock) receive a reliable save-cycle-complete
 *   signal even for non-block saves (title, plain text).
 * - Fail-open: ``sendAction()`` failures are caught and logged; logging
 *   failure never breaks the UI.  ``eln.actions.flushed`` is suppressed
 *   when any ``sendAction`` call fails (stale pending items are better than
 *   silently lost actions).
 * - No `numericEntryId` → skip flush (new entry, not yet created).
 * - On unmount: unsubscribes all bus listeners. Accumulated actions are
 *   discarded (no save → no action rows).
 *
 * Backward compat: ``POST /api/eln/entries/{id}/actions/batch/`` is still
 * served by the backend but is no longer called from this hook.  It remains
 * available for any external callers during the transition window.
 */
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { WorkspaceBus, BlockLifecyclePayload } from "../../../shell/src/workspace/WorkspaceBus";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";

// ── Types ──────────────────────────────────────────────────────────────────

/** Verbs that BlockNodeView emits as lifecycle event suffixes. */
const VERBS = ["created", "edited", "deleted"] as const;
type Verb = (typeof VERBS)[number];

/** Accumulated action row, ready for flush. */
interface AccumulatedAction {
  action_type: string;
  metadata: Record<string, unknown>;
}

/** Signature of the ``sendAction`` function passed by the caller. */
type SendActionFn = (
  actionType: string,
  targetType: string,
  targetId: number,
  metadata?: Record<string, unknown>,
) => Promise<void>;

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Subscribe to block lifecycle events on the workspace bus, accumulate them
 * with human-readable messages, and flush each action individually via
 * ``sendAction()`` → ``POST /api/actions/`` when the entry saves.
 *
 * @param bus             Workspace-scoped event bus.
 * @param entryId         Current entry display ID (e.g. "E-001").  Used only
 *                        for the ``eln.actions.flushed`` event payload and
 *                        as a gate — flush is skipped when undefined.
 * @param numericEntryId  Numeric primary key of the entry (e.g. 42).  Used
 *                        as the ``targetId`` for ``sendAction()`` calls.
 *                        Flush is skipped when undefined (new entry).
 * @param blockIds        Block IDs whose lifecycle events to listen for
 *                        (e.g. `["eln.table-block", "eln.comment-block"]`).
 * @param sendAction      Bound ``sendAction`` function (from
 *                        ``createSendAction``) that posts to the unified
 *                        ``POST /api/actions/`` endpoint.
 * @param hasPendingRef   Optional mutable ref that the hook updates to
 *                        ``true`` when the accumulation map is non-empty,
 *                        and ``false`` when empty.  Callers (ElnWorkspace)
 *                        read this ref at save time to decide whether to
 *                        set the X-Block-Actions header.
 */
export function useBlockActionLogging(
  bus: WorkspaceBus,
  entryId: string | undefined,
  numericEntryId: number | undefined,
  blockIds: string[],
  sendAction: SendActionFn,
  hasPendingRef?: MutableRefObject<boolean>,
): void {
  // ── Accumulation map: `${blockInstanceId}:${verb}` → AccumulatedAction ──
  const pendingRef = useRef<Map<string, AccumulatedAction>>(new Map());
  // Latest entryId, kept in a ref so the save handler reads the current value
  const entryIdRef = useRef<string | undefined>(entryId);
  entryIdRef.current = entryId;
  // Latest numericEntryId, likewise kept in a ref
  const numericEntryIdRef = useRef<number | undefined>(numericEntryId);
  numericEntryIdRef.current = numericEntryId;
  // Latest sendAction, kept in a ref so the save handler always calls the
  // current instance (stable across renders via useSendAction, but kept in
  // a ref for defensive correctness).
  const sendActionRef = useRef<SendActionFn>(sendAction);
  sendActionRef.current = sendAction;

  // Suppression flag — set to true during programmatic content loads
  // (e.g. initial fetch, setContent) so we don't accumulate spurious
  // lifecycle events emitted by blocks being mounted/configured by the
  // server payload rather than by user action.
  const suppressRef = useRef(false);

  // Track unsubscribe functions for all lifecycle listeners + save listener
  const unsubsRef = useRef<Array<() => void>>([]);

  // ── Subscribe to lifecycle events ─────────────────────────────────────
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const pending = pendingRef.current;

    // ── Suppression gate: skip accumulation during programmatic loads ──
    const loadingUnsub = bus.on(
      "eln.editor.content-loading",
      (payload: unknown) => {
        suppressRef.current = payload as boolean;
      },
    );
    unsubs.push(loadingUnsub);

    for (const blockId of blockIds) {
      for (const verb of VERBS) {
        const event = `${blockId}.${verb}`;
        const unsub = bus.on(event, (payload: unknown) => {
          // Skip accumulation during programmatic content loads — the
          // blocks are being mounted from a server payload, not by the user.
          if (suppressRef.current) return;

          const p = payload as BlockLifecyclePayload;
          const key = `${p.blockInstanceId}:${verb}`;

          // Derive display label from the backend action catalog.
          // Falls back to the action type string (e.g. "eln.table-block.created")
          // when no catalog entry exists for this action.
          const actionType = event; // `${blockId}.${verb}`
          const catalog = ModRegistry.getInstance().getActions("eln");
          const message = ModRegistry.resolveActionLabel(actionType, catalog);

          pending.set(key, {
            action_type: actionType,
            metadata: { message },
          });
          if (hasPendingRef) hasPendingRef.current = true;
        });
        unsubs.push(unsub);
      }
    }

    // ── Subscribe to save event ─────────────────────────────────────────
    const saveUnsub = bus.on("eln.entry.saved", async () => {
      const displayId = entryIdRef.current;
      const numericId = numericEntryIdRef.current;
      if (!numericId || !displayId) return; // new entry, not yet created

      const actions = Array.from(pending.values());
      if (actions.length === 0) {
        // Empty accumulator — still emit so listeners (ActivityFeedBlock)
        // know the save cycle is complete and can refetch.  This covers
        // non-block saves (title, plain text) where no lifecycle events
        // fired but the feed should still refresh.
        bus.emit("eln.actions.flushed", { keys: [] });
        return;
      }

      // Capture keys before clearing so we can emit them after
      // successful sendAction calls for exact pending-item reconciliation.
      const flushedKeys = Array.from(pending.keys());
      pending.clear();
      if (hasPendingRef) hasPendingRef.current = false;

      const send = sendActionRef.current;
      let allSucceeded = true;

      for (const action of actions) {
        try {
          await send(
            action.action_type,
            "eln.entry",
            numericId,
            action.metadata,
          );
        } catch (err) {
          // Fail-open: logging failure never breaks the UI.
          // Track failure so we can skip the flushed event if any
          // action failed (stale pending items are better than
          // silently lost actions).
          allSucceeded = false;
          console.warn(
            '[eln] Failed to send block action "%s" for entry %s:',
            action.action_type,
            displayId,
            err,
          );
        }
      }

      if (allSucceeded) {
        // Notify listeners which keys were flushed so they can reconcile
        // optimistic pending items by exact blockInstanceId:verb match
        // (no fragile timestamp window).
        bus.emit("eln.actions.flushed", { keys: flushedKeys });
      }
    });
    unsubs.push(saveUnsub);

    unsubsRef.current = unsubs;

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
      unsubsRef.current = [];
    };
    // Only re-subscribe when the bus or blockIds change (not on every render).
    // entryId, numericEntryId, and sendAction are read from refs inside the
    // handler, so they don't need to trigger re-subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, ...blockIds]);
}
