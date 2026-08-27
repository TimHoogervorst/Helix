import { useMemo, type ComponentType } from "react";
import { ModRegistry } from "../mod-system/ModRegistry";
import type { WorkspaceBus } from "./WorkspaceBus";
import type { RendererProps, SlotContext, BaseBinding } from "../mod-system/types";

/**
 * Props for the SlotRenderer component.
 *
 * The SlotRenderer is a thin resolution component: it looks up the slot
 * declaration and its bindings from the registry, then delegates rendering
 * to the slot's configured renderer component.
 */
export interface SlotRendererProps {
  /** The slot to resolve, e.g. "eln.editor". */
  slotId: string;
  /** The optional workspace-scoped event bus, created by the workspace shell. */
  bus?: WorkspaceBus;
  /** Flat bag of metadata available to all blocks and buttons. */
  context: SlotContext;
}

/**
 * Thin resolution component that bridges a slot declaration to its renderer.
 *
 * 1. Looks up the slot from the registry
 * 2. Resolves bindings (targets looked up, defaults merged with overrides)
 * 3. Delegates rendering to the slot's configured renderer component
 *
 * Renders nothing when the slot is not declared or has no valid bindings.
 *
 * The workspace shell creates one bus instance per workspace and passes the
 * same bus to every SlotRenderer, enabling cross-slot communication.
 *
 * @example
 * <SlotRenderer slotId="eln.editor" bus={bus} context={context} />
 */
export function SlotRenderer({ slotId, bus, context }: SlotRendererProps) {
  const resolved = useMemo(() => {
    return ModRegistry.getInstance().resolveSlot(slotId);
  }, [slotId]);

  if (!resolved) return null;

  const { renderer: Renderer, bindings } = resolved;

  // Cast through unknown — renderer is stored as ComponentType<any> in the
  // registry because slot declarations are heterogeneous (block slots receive
  // BlockBinding[], button slots receive ButtonBinding[]). The slot's `accepts`
  // field guarantees the runtime types match, but TypeScript can't prove it.
  const TypedRenderer = Renderer as ComponentType<
    RendererProps<BaseBinding>
  >;

  return (
    <TypedRenderer
      slotId={slotId}
      bindings={bindings}
      bus={bus}
      context={context}
    />
  );
}
