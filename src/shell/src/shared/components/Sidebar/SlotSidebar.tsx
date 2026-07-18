import { useMemo } from "react";
import { ModRegistry } from "../../../mod-system/ModRegistry";
import type {
  BlockBinding,
  ButtonBinding,
  SlotContext,
  BlockInstance,
  RendererProps,
} from "../../../mod-system/types";
import { SidebarProvider } from "../../../workspace/SidebarContext";
import { CollapsibleSidebar } from "./CollapsibleSidebar";
import { SidebarSection } from "./SidebarSection";
import { useBlockInstance } from "../../../workspace/useBlockInstance";
import type { WorkspaceBus } from "../../../workspace/WorkspaceBus";

// ── Props ────────────────────────────────────────────────────────────────

/**
 * Props when SlotSidebar is used as a standalone component.
 * Resolves the slot from the registry and renders its block bindings.
 *
 * An optional `context` override provides entry data to blocks;
 * when omitted, a stub context with empty workspace/user/viewMode
 * is used (suitable for hub-level sidebars with static content).
 *
 * An optional `bus` enables workspace event subscriptions for blocks
 * that need them (e.g. ActivityFeedBlock). When omitted, blocks render
 * as static instances without bus access.
 */
export interface SlotSidebarStandaloneProps {
  slotId: string;
  /** Optional context override — carries entry data to sidebar blocks. */
  context?: SlotContext;
  /** Optional workspace bus — enables block event subscriptions. */
  bus?: WorkspaceBus;
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
 * Internally wraps content in a {@link CollapsibleSidebar} (variant
 * `"full-hide"`, `side="right"`) and each block binding in a
 * {@link SidebarSection} whose label and icon come from the block registration.
 *
 * Sidebar collapse and section collapse are independent — collapsing the
 * whole sidebar preserves which sections were collapsed when it re-expands.
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

  // ── Mode discrimination ───────────────────────────────────────────────

  const isRendererMode = "bindings" in props && "bus" in props;
  const context = isRendererMode
    ? props.context
    : (props as SlotSidebarStandaloneProps).context ?? STUB_CONTEXT;
  const bus = isRendererMode
    ? props.bus
    : (props as SlotSidebarStandaloneProps).bus;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <SidebarProvider>
      <CollapsibleSidebar side="right" variant="full-hide">
        {bindings.map((binding) => {
          // Only blocks are rendered in sidebar; buttons are skipped.
          if (binding.type !== "block") return null;

          // Renderer mode with a bus — useBlockInstance for proper state
          // management, event subscriptions, and attrs updates.
          if (bus) {
            return (
              <SlotSidebarBlock
                key={binding.id}
                binding={binding}
                slotId={slotId}
                bus={bus}
                context={context}
              />
            );
          }

          // Standalone mode — static block instance, no bus subscriptions.
          const Component = binding.component;
          const instance: BlockInstance = {
            id: `${binding.id}::static`,
            blockId: binding.id,
            slotId,
            attrs: binding.defaultState,
            updateAttrs: NOOP_UPDATE_ATTRS,
          };

          return (
            <SidebarSection
              key={binding.id}
              id={binding.id}
              label={binding.label}
              icon={binding.icon}
            >
              <Component context={context} instance={instance} />
            </SidebarSection>
          );
        })}
      </CollapsibleSidebar>
    </SidebarProvider>
  );
}

// ── Internal: block with useBlockInstance ────────────────────────────────

interface SlotSidebarBlockProps {
  binding: BlockBinding;
  slotId: string;
  bus: WorkspaceBus;
  context: SlotContext;
}

/**
 * Renders a single block inside a {@link SidebarSection} using
 * {@link useBlockInstance} for proper state management, event
 * subscriptions, and attrs updates.
 *
 * Extracted so {@link useBlockInstance} is called unconditionally
 * in a React component (the hook cannot be inside a conditional).
 */
function SlotSidebarBlock({
  binding,
  slotId,
  bus,
  context,
}: SlotSidebarBlockProps) {
  const Component = binding.component;
  const instance = useBlockInstance(binding, slotId, bus);

  return (
    <SidebarSection
      id={binding.id}
      label={binding.label}
      icon={binding.icon}
    >
      <Component context={context} instance={instance} bus={bus} />
    </SidebarSection>
  );
}
