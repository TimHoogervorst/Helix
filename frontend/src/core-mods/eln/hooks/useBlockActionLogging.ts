/**
 * useBlockActionLogging — accumulates block lifecycle events and flushes
 * batched block-declared actions to the backend on entry save.
 *
 * Owns: subscription to block lifecycle events, in-memory accumulation map,
 * dedup by (blockInstanceId, verb), and the flush-to-API on save.
 * Does NOT own: save detection (the caller emits "eln.entry.saved" on the bus),
 * block registration, or the action message format.
 *
 * Key behaviours:
 * - Subscribes to `{blockId}.created`, `{blockId}.edited`, `{blockId}.deleted`
 *   for each ID in `blockIds`.
 * - Accumulates events in a Map keyed by `${blockInstanceId}:${verb}`.
 *   Same key overwrites — only the latest state per block per verb survives
 *   (dedup within a save cycle).
 * - On `"eln.entry.saved"` event: if the map is non-empty and `entryId` is
 *   truthy, POSTs accumulated actions to the batch endpoint and clears the map.
 * - Fail-open: POST failures are caught and logged; logging failure never
 *   breaks the UI.
 * - No `entryId` → skip flush (new entry, not yet created).
 * - On unmount: unsubscribes all bus listeners. Accumulated actions are
 *   discarded (no save → no action rows).
 */
import { useEffect, useRef } from "react";
import type { WorkspaceBus } from "../../../core/workspace/WorkspaceBus";
import { post } from "../../../core/api/client";

// ── Types ──────────────────────────────────────────────────────────────────

/** Verbs that BlockNodeView emits as lifecycle event suffixes. */
const VERBS = ["created", "edited", "deleted"] as const;

/** Payload shape emitted by BlockNodeView for lifecycle events. */
interface BlockLifecyclePayload {
  blockId: string;
  slotId: string;
  blockInstanceId: string;
  /** Present on created events. */
  attrs?: Record<string, unknown>;
  /** Present on edited events. */
  changedAttrs?: Record<string, unknown>;
}

/** Accumulated action row, ready for batch flush. */
interface AccumulatedAction {
  action_type: string;
  metadata?: Record<string, unknown>;
}

/** Shape of the batch endpoint request body. */
interface BatchActionsRequest {
  actions: AccumulatedAction[];
}

/** Shape of the batch endpoint response. */
interface BatchActionsResponse {
  count: number;
  request_id: string;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Subscribe to block lifecycle events on the workspace bus, accumulate them,
 * and flush as a batched API call when the entry saves.
 *
 * @param bus       Workspace-scoped event bus.
 * @param entryId   Current entry display ID (e.g. "E-001"). Flush is skipped
 *                  when undefined (new entry, not yet created).
 * @param blockIds  Block IDs whose lifecycle events to listen for
 *                  (e.g. `["eln.table-block", "eln.comment-block"]`).
 */
export function useBlockActionLogging(
  bus: WorkspaceBus,
  entryId: string | undefined,
  blockIds: string[],
): void {
  // ── Accumulation map: `${blockInstanceId}:${verb}` → AccumulatedAction ──
  const pendingRef = useRef<Map<string, AccumulatedAction>>(new Map());
  // Latest entryId, kept in a ref so the save handler reads the current value
  const entryIdRef = useRef<string | undefined>(entryId);
  entryIdRef.current = entryId;

  // Track unsubscribe functions for all lifecycle listeners + save listener
  const unsubsRef = useRef<Array<() => void>>([]);

  // ── Subscribe to lifecycle events ─────────────────────────────────────
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const pending = pendingRef.current;

    for (const blockId of blockIds) {
      for (const verb of VERBS) {
        const event = `${blockId}.${verb}`;
        const unsub = bus.on(event, (payload: unknown) => {
          const p = payload as BlockLifecyclePayload;
          const key = `${p.blockInstanceId}:${verb}`;
          pending.set(key, {
            action_type: event,
            metadata: {},
          });
        });
        unsubs.push(unsub);
      }
    }

    // ── Subscribe to save event ─────────────────────────────────────────
    const saveUnsub = bus.on("eln.entry.saved", async () => {
      const id = entryIdRef.current;
      if (!id) return; // new entry, not yet created

      const actions = Array.from(pending.values());
      if (actions.length === 0) return;

      // Clear immediately so new events start a fresh batch for the next
      // save cycle, regardless of whether the POST succeeds.
      pending.clear();

      try {
        await post<BatchActionsResponse>(
          `/eln/entries/${id}/actions/batch/`,
          { actions } satisfies BatchActionsRequest,
        );
      } catch (err) {
        // Fail-open: logging failure never breaks the UI.
        console.warn(
          `[eln] Failed to flush block action log for entry ${id}:`,
          err,
        );
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
    // entryId is read from a ref inside the handler, so it doesn't need to
    // trigger re-subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, ...blockIds]);
}
