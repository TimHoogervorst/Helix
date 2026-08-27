import { useMemo } from "react";
import type { RendererProps, BlockBinding, SlotContext } from "../mod-system/types";
import { useBlockInstance } from "./useBlockInstance";

/**
 * Renders blocks as vertically stacked panels.
 *
 * No lifecycle events — a block in a sidebar isn't "created" or "deleted",
 * it's just rendered or not. Event routing: subscribes to `bus.on()` for
 * each block's `listensTo` events and routes to `onEvent` handlers.
 *
 * The renderer manages mount/unmount lifecycle — when a block is removed,
 * its bus subscriptions are cleaned up.
 *
 * Layout: vertical (order: 0 = topmost).
 */
export function PanelRenderer({
  slotId,
  bindings,
  bus,
  context,
}: RendererProps<BlockBinding>) {
  if (bindings.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {bindings.map((binding) => (
        <PanelBlock
          key={binding.id}
          binding={binding}
          slotId={slotId}
          bus={bus}
          context={context}
        />
      ))}
    </div>
  );
}

// ── Internal: single panel block ────────────────────────────────────────

interface PanelBlockProps {
  binding: BlockBinding;
  slotId: string;
  bus: RendererProps<BlockBinding>["bus"];
  context: RendererProps<BlockBinding>["context"];
}

function PanelBlock({ binding, slotId, bus, context }: PanelBlockProps) {
  const Component = binding.component;
  const instance = useBlockInstance(binding, slotId, bus);

  // Build typed emitter functions from the binding's emits declarations.
  const emits: Record<string, { fire: (payload: Record<string, unknown>) => void }> =
    {};
  if (binding.emits) {
    for (const e of binding.emits) {
      emits[e.id] = {
        fire: (payload: Record<string, unknown>) => {
          if (!bus) return;

          bus.emit(`${binding.id}.${e.id}`, {
            blockInstanceId: instance.id,
            blockId: binding.id,
            localId: e.id,
            category: e.category,
            core: e.core,
            payload,
          });
        },
      };
    }
  }

  // Augment context with a block-specific emitAction that derives the
  // global action ID as {blockId}.{localId} and emits on the workspace bus.
  const augmentedContext: SlotContext = useMemo(
    () => ({
      ...context,
      emitAction: (localId: string, payload?: Record<string, unknown>) => {
        if (!bus) return;

        bus.emit(`${binding.id}.${localId}`, {
          blockInstanceId: instance.id,
          blockId: binding.id,
          localId,
          payload,
        });
      },
    }),
    [context, binding.id, bus, instance.id],
  );

  // Blocks can opt out of the card wrapper via `noCard: true` in overrides.
  const noCard = binding.overrides?.noCard === true;

  if (noCard) {
    return (
      <Component
        context={augmentedContext}
        instance={instance}
        overrides={binding.overrides}
        emits={emits}
      />
    );
  }

  return (
    <div className="rounded-lg border border-hairline bg-background p-4">
      <Component
        context={augmentedContext}
        instance={instance}
        overrides={binding.overrides}
        emits={emits}
      />
    </div>
  );
}
