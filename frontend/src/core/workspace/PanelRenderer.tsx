import type { RendererProps, BlockBinding } from "../mod-system/types";
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

  // Blocks can opt out of the card wrapper via `noCard: true` in overrides.
  const noCard = binding.overrides?.noCard === true;

  if (noCard) {
    return <Component context={context} instance={instance} bus={bus} />;
  }

  return (
    <div className="rounded-lg border border-hairline bg-background p-4">
      <Component context={context} instance={instance} bus={bus} />
    </div>
  );
}
