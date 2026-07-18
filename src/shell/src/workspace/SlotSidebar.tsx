import { useMemo } from "react";
import { ModRegistry } from "../mod-system/ModRegistry";
import type {
  BlockBinding,
  ButtonBinding,
  SlotContext,
  BlockInstance,
  RendererProps,
} from "../mod-system/types";

// ── Props ────────────────────────────────────────────────────────────────

/**
 * Props when SlotSidebar is used as a standalone component.
 * Resolves the slot from the registry and renders its block bindings.
 */
export interface SlotSidebarStandaloneProps {
  slotId: string;
}

/**
 * Union of the two prop shapes SlotSidebar accepts:
 * - Standalone: `{ slotId }` — resolves the slot from the registry internally
 * - Renderer: `RendererProps<BlockBinding>` — receives resolved bindings from SlotRenderer
 */
export type SlotSidebarProps =
  | SlotSidebarStandaloneProps
  | RendererProps<BlockBinding>;

// ── Helpers ──────────────────────────────────────────────────────────────

/** Minimal stub context for hub-level sidebars that lack a workspace bus. */
const STUB_CONTEXT: SlotContext = {
  workspaceId: "",
  user: null,
  viewMode: null,
};

/** Stub no-op updateAttrs for static blocks. */
const NOOP_UPDATE_ATTRS = () => {};

// ── Component ────────────────────────────────────────────────────────────

/**
 * Renders a sidebar region filled with block content driven by slot bindings.
 *
 * Works in two modes:
 *
 * 1. **Standalone** — `<SlotSidebar slotId="library.sidebar" />`
 *    Resolves the slot from the registry and renders its block bindings.
 *    Use this for hub-level sidebars that lack a workspace bus.
 *
 * 2. **Renderer** — deployed as the `renderer` of a slot declaration and
 *    invoked by SlotRenderer. Receives resolved bindings, bus, and context
 *    via RendererProps.
 *
 * Blocks are rendered in order without card wrappers — each block owns its
 * own section markup including headings and containers.
 */
export function SlotSidebar(props: SlotSidebarProps) {
  // ── Resolve bindings ──────────────────────────────────────────────────

  // Discriminate: RendererProps has a `bindings` array, standalone does not.
  const bindings: (BlockBinding | ButtonBinding)[] = useMemo(() => {
    if ("bindings" in props) {
      // Renderer mode — bindings are passed in from SlotRenderer
      return props.bindings;
    }
    // Standalone mode — resolve from the registry
    const resolved = ModRegistry.getInstance().resolveSlot(props.slotId);
    return resolved?.bindings ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, ["bindings" in props ? props.bindings : props.slotId]);

  if (bindings.length === 0) return null;

  // Both union members carry slotId — read it directly.
  const slotId = props.slotId;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <aside className="library-sidebar">
      {bindings.map((binding) => {
        // Only blocks are rendered in sidebar; buttons are skipped.
        if (binding.type !== "block") return null;

        const Component = binding.component;
        const instance: BlockInstance = {
          id: `${binding.id}::static`,
          blockId: binding.id,
          slotId,
          attrs: binding.defaultState,
          updateAttrs: NOOP_UPDATE_ATTRS,
        };

        return (
          <Component
            key={binding.id}
            context={STUB_CONTEXT}
            instance={instance}
          />
        );
      })}
    </aside>
  );
}
