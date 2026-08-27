import { useEffect, useMemo, useRef, useState } from "react";
import type { WorkspaceBus } from "./WorkspaceBus";
import type { BlockBinding, BlockInstance } from "../mod-system/types";

/**
 * Creates a stable BlockInstance for a block binding and manages bus
 * event subscriptions for the block's `listensTo`/`onEvent` declarations.
 *
 * Shared by PanelRenderer and TabRenderer — both render blocks into
 * non-editor slots and need the same instance + event routing logic.
 *
 * @param binding  - The resolved block binding from the registry.
 * @param slotId   - The slot this block lives in.
 * @param bus      - The optional workspace-scoped event bus.
 * @returns The stable BlockInstance handle for the block component.
 */
export function useBlockInstance(
  binding: BlockBinding,
  slotId: string,
  bus?: WorkspaceBus,
): BlockInstance {
  // Reactive attrs — setState triggers re-render so the returned instance
  // always reflects the latest committed state.  Previously this was a
  // useRef / useMemo pair that mutated instanceRef.current inside
  // updateAttrs but never updated the returned instance object, so
  // instance.attrs was always binding.defaultState.
  const [attrs, setAttrs] = useState<Record<string, unknown>>(
    binding.defaultState,
  );

  const instanceRef = useRef<BlockInstance | null>(null);

  // Stable id — re-created only when binding identity or slotId changes
  // (i.e., when the registry re-resolves).
  const id = useMemo(
    () => `${binding.id}::${crypto.randomUUID()}`,
    [binding.id, slotId],
  );

  // Reset attrs when the binding is re-resolved with different
  // defaultState (e.g. after a registry update).  This matches the
  // original useMemo[keyed on binding.defaultState] behaviour.
  useEffect(() => {
    setAttrs(binding.defaultState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding.defaultState]);

  // Build instance from reactive state during render — instance.attrs is
  // always current because it's backed by useState, not a stale useMemo.
  const instance: BlockInstance = {
    id,
    blockId: binding.id,
    slotId,
    attrs,
    updateAttrs: (newAttrs: Record<string, unknown>) => {
      setAttrs((prev) => ({ ...prev, ...newAttrs }));
    },
  };

  // Keep ref in sync so event handlers always read the latest instance.
  instanceRef.current = instance;

  // Subscribe to bus events declared in listensTo, route to onEvent handlers.
  // Dependencies intentionally omit `instance` — handlers read
  // instanceRef.current at call time, which is always the latest instance
  // (synced during render).  Omitting `instance` avoids tearing down and
  // recreating subscriptions on every attrs change.
  useEffect(() => {
    if (!bus) return;

    const unsubscribes: Array<() => void> = [];

    for (const event of binding.listensTo) {
      const handler = binding.onEvent[event];
      if (!handler) continue;

      const unsub = bus.on(event, (payload: unknown) => {
        // Always read the latest instance from ref — it is synced during
        // render so event handlers see current attrs.
        const currentInstance = instanceRef.current;
        if (currentInstance) {
          return handler(currentInstance, payload);
        }
        return undefined;
      });
      unsubscribes.push(unsub);
    }

    return () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    };
  }, [binding.listensTo, binding.onEvent, bus]);

  return instance;
}
