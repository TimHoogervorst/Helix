import { useEffect, useMemo, useRef } from "react";
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
 * @param bus      - The workspace-scoped event bus.
 * @returns The stable BlockInstance handle for the block component.
 */
export function useBlockInstance(
  binding: BlockBinding,
  slotId: string,
  bus: WorkspaceBus,
): BlockInstance {
  const instanceRef = useRef<BlockInstance | null>(null);

  // Stable instance identity — re-created only when binding identity or
  // slotId changes (i.e., when the registry re-resolves).
  const instance = useMemo<BlockInstance>(
    () => ({
      id: `${binding.id}::${crypto.randomUUID()}`,
      blockId: binding.id,
      slotId,
      attrs: binding.defaultState,
      updateAttrs: (attrs: Record<string, unknown>) => {
        if (instanceRef.current) {
          instanceRef.current = {
            ...instanceRef.current,
            attrs,
          };
        }
      },
    }),
    [binding.id, binding.defaultState, slotId],
  );

  // Keep ref in sync so updateAttrs always writes to the latest instance
  useEffect(() => {
    instanceRef.current = instance;
  }, [instance]);

  // Subscribe to bus events declared in listensTo, route to onEvent handlers
  useEffect(() => {
    const unsubscribes: Array<() => void> = [];

    for (const event of binding.listensTo) {
      const handler = binding.onEvent[event];
      if (!handler) continue;

      const unsub = bus.on(event, (payload: unknown) => {
        // Use the latest instance from ref so onEvent always has current attrs
        const currentInstance = instanceRef.current ?? instance;
        return handler(currentInstance, payload);
      });
      unsubscribes.push(unsub);
    }

    return () => {
      for (const unsub of unsubscribes) {
        unsub();
      }
    };
  }, [binding.listensTo, binding.onEvent, bus, instance]);

  return instance;
}
