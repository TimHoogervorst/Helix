/**
 * useActionAccumulator — collects block lifecycle events inside TipTapRenderer
 * and flushes them to the backend on save.
 *
 * Replaces the workspace-level `useBlockActionLogging` hook. Lifecycle events
 * now flow through internal callbacks from `BlockNodeView` instead of the
 * public bus. Accumulated actions are flushed when the `saveSignal` prop
 * transitions, and each resolved action is emitted as a separate
 * `{workspaceId}.action.performed` event on the bus after successful flush.
 *
 * Owns: accumulation Map, dedup by (blockInstanceId, verb), action catalog
 * label resolution, flush-on-save-signal, post-flush bus emission.
 * Does NOT own: save detection (the caller passes `saveSignal`), block
 * registration, or the action message format.
 */
import { useEffect, useRef, useCallback } from "react";
import type { MutableRefObject } from "react";
import type { WorkspaceBus } from "../WorkspaceBus";
import { ModRegistry } from "../../mod-system/ModRegistry";

// ── Types ──────────────────────────────────────────────────────────────────

const VERBS = ["created", "edited", "deleted"] as const;
type Verb = (typeof VERBS)[number];

interface AccumulatedAction {
  action: string;
  action_type: string;
  metadata: Record<string, unknown>;
}

/** Signature of the sendAction function passed by the caller. */
type SendActionFn = (
  actionType: string,
  targetType: string,
  targetId: number,
  metadata?: Record<string, unknown>,
  requestId?: string,
) => Promise<void>;

export interface UseActionAccumulatorOptions {
  /** Workspace-scoped event bus for the suppression gate and post-flush events. */
  bus: WorkspaceBus;
  /** Workspace identifier used for bus event naming and sendAction targetType. */
  workspaceId: string;
  /**
   * When this value transitions (strict inequality), accumulated actions are
   * flushed.  The initial null → value transition is skipped (initial load,
   * not a user save).
   */
  saveSignal: unknown;
  /** Numeric target ID for sendAction calls. Flush is skipped when undefined. */
  targetId: number | undefined;
  /**
   * Bound sendAction function that posts to POST /api/actions/.
   * When omitted, accumulation still happens but flush is a no-op
   * (useful for tests that don't need to exercise the save path).
   */
  onFlushActions?: SendActionFn;
  /**
   * Optional mutable ref updated to true when the accumulation map is
   * non-empty, false when empty.  Callers read this at save time to decide
   * whether to set the X-Block-Actions header.
   */
  hasPendingRef?: MutableRefObject<boolean>;
}

/** Payload passed from BlockNodeView to the accumulator. */
export interface LifecycleEventPayload {
  blockId: string;
  blockInstanceId: string;
  verb: Verb;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Accumulate block lifecycle events via internal callbacks, resolve action
 * catalog labels, and flush each action individually via `onFlushActions` →
 * `POST /api/actions/` when `saveSignal` transitions.
 *
 * On successful flush, emits `{workspaceId}.action.performed` on the bus for
 * each resolved action item so listeners (ActivityFeedBlock) can update
 * without a refetch + reconciliation round-trip.
 */
export function useActionAccumulator({
  bus,
  workspaceId,
  saveSignal,
  targetId,
  onFlushActions,
  hasPendingRef,
}: UseActionAccumulatorOptions) {
  // ── Accumulation map: `${blockInstanceId}:${verb}` → AccumulatedAction ──
  const pendingRef = useRef<Map<string, AccumulatedAction>>(new Map());

  // Latest values kept in refs so the save-signal effect always reads current
  // instances without needing to re-subscribe.
  const targetIdRef = useRef<number | undefined>(targetId);
  targetIdRef.current = targetId;
  const onFlushActionsRef = useRef<SendActionFn>(onFlushActions);
  onFlushActionsRef.current = onFlushActions;

  // Suppression flag — set to true during programmatic content loads
  // (e.g. initial fetch, setContent) so we don't accumulate spurious
  // lifecycle events from blocks being mounted from server payloads.
  const suppressRef = useRef(false);

  // ── Suppression gate: content-loading ──────────────────────────────────
  useEffect(() => {
    const unsub = bus.on(
      `${workspaceId}.editor.content-loading`,
      (payload: unknown) => {
        suppressRef.current = payload as boolean;
      },
    );
    return unsub;
  }, [bus, workspaceId]);

  // ── Stable lifecycle callback for BlockNodeView ────────────────────────
  //
  // Stable across renders (empty dep array + refs) so it doesn't cause
  // useMemo churn in TipTapRenderer's extension assembly.
  const onLifecycleEvent = useCallback(
    (payload: LifecycleEventPayload) => {
      if (suppressRef.current) return;

      const { blockId, blockInstanceId, verb } = payload;
      const pending = pendingRef.current;
      const key = `${blockInstanceId}:${verb}`;
      const action = `${blockId}.${verb}`;

      // Derive display label and core action_type from the backend
      // action catalog. Falls back to the action string and verb
      // when no catalog entry exists for this action.
      const catalog = ModRegistry.getInstance().getActions(workspaceId);
      const catalogEntry = catalog.find((a) => a.id === action);
      const message = catalogEntry?.label ?? action;
      const coreVerb = catalogEntry?.action_type ?? verb;

      // Keep the accumulator state-consistent for a given block
      // instance: when a "created" event arrives, remove any stale
      // "deleted" entry from the same instance (TipTap NodeView churn
      // can fire a spurious "deleted" between two "created" mounts).
      // Likewise, when "deleted" arrives, remove any "created"/"edited".
      if (verb === "created") {
        pending.delete(`${blockInstanceId}:deleted`);
      } else if (verb === "deleted") {
        pending.delete(`${blockInstanceId}:created`);
        pending.delete(`${blockInstanceId}:edited`);
      }

      pending.set(key, {
        action,
        action_type: coreVerb,
        metadata: { message },
      });
      if (hasPendingRef) hasPendingRef.current = true;
    },
    // workspaceId is captured from the initial render; it's stable across
    // the component lifetime. hasPendingRef is a ref, stable by definition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── Flush on saveSignal transition ─────────────────────────────────────
  const prevSaveSignalRef = useRef<unknown>(saveSignal);

  useEffect(() => {
    const prev = prevSaveSignalRef.current;
    prevSaveSignalRef.current = saveSignal;

    // No-op on initial render (prev === saveSignal)
    if (prev === saveSignal) return;
    // Skip null → value transition (initial load, not a user save)
    if (prev == null) return;

    const numericId = targetIdRef.current;
    if (numericId == null) return;

    const pending = pendingRef.current;
    const actions = Array.from(pending.values());

    if (actions.length === 0) return;

    // Capture actions and clear the map before async work so new events
    // during the flush are accumulated for the next save cycle.
    const flushedActions: AccumulatedAction[] = [...actions];
    pending.clear();
    if (hasPendingRef) hasPendingRef.current = false;

    // Generate a shared request ID so that all block actions flushed in
    // this save cycle can be grouped in the ActivityFeed.
    const sharedRequestId = crypto.randomUUID();

    const send = onFlushActionsRef.current;
    if (!send) return; // no flush function provided (e.g. tests)

    // Fire-and-forget async flush — we don't block the render cycle.
    (async () => {
      let allSucceeded = true;

      for (const action of flushedActions) {
        try {
          await send(
            action.action,
            `${workspaceId}.entry`,
            numericId,
            action.metadata,
            sharedRequestId,
          );
        } catch (err) {
          // Fail-open: logging failure never breaks the UI.
          // Track failure so we can skip the "action.performed" events
          // if any action failed (stale pending items are better than
          // silently lost actions).
          allSucceeded = false;
          console.warn(
            '[%s] Failed to send block action "%s" for entry %s:',
            workspaceId,
            action.action,
            numericId,
            err,
          );
        }
      }

      if (allSucceeded) {
        // Emit each resolved action as a separate bus event so listeners
        // (ActivityFeedBlock) can receive ready-to-render action items
        // without a refetch + reconciliation round-trip.
        for (const action of flushedActions) {
          bus.emit(`${workspaceId}.action.performed`, {
            action: action.action,
            action_type: action.action_type,
            metadata: action.metadata,
            requestId: sharedRequestId,
            targetId: numericId,
          });
        }
      }
    })();
    // saveSignal is the trigger; refs provide current values of everything
    // else without needing to re-run this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSignal]);

  return { onLifecycleEvent };
}
