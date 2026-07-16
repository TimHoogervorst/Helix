/**
 * useBlockActionLogging — accumulates block lifecycle events and flushes
 * batched block-declared actions to the backend on entry save.
 *
 * Owns: subscription to block lifecycle events, in-memory accumulation map,
 * dedup by (blockInstanceId, verb), human-readable message derivation from
 * block registrations, and the flush-to-API on save.
 * Does NOT own: save detection (the caller emits "eln.entry.saved" on the bus),
 * block registration, or the action message format.
 *
 * Key behaviours:
 * - Subscribes to `{blockId}.created`, `{blockId}.edited`, `{blockId}.deleted`
 *   for each ID in `blockIds`.
 * - Derives human-readable messages from each block's `messages` config and
 *   `getDisplayName`, falling back to `"{label} was {verb}"`.
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
import type { MutableRefObject } from "react";
import type { WorkspaceBus, BlockLifecyclePayload } from "../../../shell/src/workspace/WorkspaceBus";
import type { BlockRegistration } from "../../../shell/src/mod-system/types";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { post } from "../../../shell/src/api/client";

// ── Types ──────────────────────────────────────────────────────────────────

/** Verbs that BlockNodeView emits as lifecycle event suffixes. */
const VERBS = ["created", "edited", "deleted"] as const;
type Verb = (typeof VERBS)[number];

/** Accumulated action row, ready for batch flush. */
interface AccumulatedAction {
  action_type: string;
  metadata: Record<string, unknown>;
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

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derive a human-readable action message from a block's registration.
 *
 * Uses the block's `messages` config as a template (e.g. "Table '{name}' edited"),
 * substituting `{name}` with the result of `getDisplayName`. Falls back to
 * `"{label} was {verb}"` when no message template is configured.
 */
function deriveMessage(
  block: BlockRegistration,
  verb: Verb,
  attrs: Record<string, unknown> | undefined,
): string {
  const template = block.messages?.[verb];
  if (template) {
    const displayName = block.getDisplayName?.(attrs ?? {}) ?? block.label;
    return template.replace(/\{name\}/g, displayName);
  }
  // Default template
  return `${block.label} was ${verb}`;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Subscribe to block lifecycle events on the workspace bus, accumulate them
 * with human-readable messages, and flush as a batched API call when the
 * entry saves.
 *
 * @param bus            Workspace-scoped event bus.
 * @param entryId        Current entry display ID (e.g. "E-001"). Flush is skipped
 *                       when undefined (new entry, not yet created).
 * @param blockIds       Block IDs whose lifecycle events to listen for
 *                       (e.g. `["eln.table-block", "eln.comment-block"]`).
 * @param hasPendingRef  Optional mutable ref that the hook updates to `true` when
 *                       the accumulation map is non-empty, and `false` when empty.
 *                       Callers (ElnWorkspace) read this ref at save time to
 *                       decide whether to set the X-Block-Actions header.
 */
export function useBlockActionLogging(
  bus: WorkspaceBus,
  entryId: string | undefined,
  blockIds: string[],
  hasPendingRef?: MutableRefObject<boolean>,
): void {
  // ── Accumulation map: `${blockInstanceId}:${verb}` → AccumulatedAction ──
  const pendingRef = useRef<Map<string, AccumulatedAction>>(new Map());
  // Latest entryId, kept in a ref so the save handler reads the current value
  const entryIdRef = useRef<string | undefined>(entryId);
  entryIdRef.current = entryId;

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

          // Derive human-readable message from block registration
          const registry = ModRegistry.getInstance();
          const block = registry.getBlocks().get(blockId);
          let message = "";
          if (block) {
            const attrs = verb === "edited" ? p.changedAttrs : p.attrs;
            message = deriveMessage(block, verb, attrs);
          } else {
            // Unknown block — use blockId as fallback label
            message = `${blockId} was ${verb}`;
          }

          pending.set(key, {
            action_type: event,
            metadata: { message },
          });
          if (hasPendingRef) hasPendingRef.current = true;
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

      // Capture keys before clearing so we can emit them after a
      // successful POST for exact pending-item reconciliation.
      const flushedKeys = Array.from(pending.keys());
      pending.clear();
      if (hasPendingRef) hasPendingRef.current = false;

      try {
        await post<BatchActionsResponse>(
          `/eln/entries/${id}/actions/batch/`,
          { actions } satisfies BatchActionsRequest,
        );
        // Notify listeners which keys were flushed so they can reconcile
        // optimistic pending items by exact blockInstanceId:verb match
        // (no fragile timestamp window).
        bus.emit("eln.actions.flushed", { keys: flushedKeys });
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
