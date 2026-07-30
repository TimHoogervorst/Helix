import { useMemo, useState } from "react";
import type { RendererProps, BlockBinding, SlotContext } from "../mod-system/types";
import { useBlockInstance } from "./useBlockInstance";

/**
 * Renders blocks as tabs in a tabbed interface.
 *
 * Uses each block's `label` as the tab name and `icon` as the tab icon.
 * All tabs are subscribed to bus events regardless of which tab is active —
 * inactive tabs are hidden via `display: none` rather than unmounted, so
 * their bus subscriptions remain live.
 *
 * Layout: vertical — tabs stacked, content area below.
 */
export function TabRenderer({
  slotId,
  bindings,
  bus,
  context,
}: RendererProps<BlockBinding>) {
  // Initialize from bindings directly to avoid double-render
  const [activeId, setActiveId] = useState<string | null>(
    bindings.length > 0 ? bindings[0].id : null,
  );

  if (bindings.length === 0) return null;

  // If active binding was removed, fall back to first
  const activeExists = bindings.some((b) => b.id === activeId);
  const effectiveActiveId = activeExists ? activeId : bindings[0].id;

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-hairline" role="tablist">
        {bindings.map((binding) => {
          const Icon = binding.icon;
          const isActive = binding.id === effectiveActiveId;
          return (
            <button
              key={binding.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-secondary hover:text-primary hover:bg-hover"
              }`}
              onClick={() => setActiveId(binding.id)}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {binding.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — all tabs rendered, inactive hidden via display:none
          so bus subscriptions remain live. */}
      {bindings.map((binding) => (
        <TabContent
          key={binding.id}
          binding={binding}
          slotId={slotId}
          bus={bus}
          context={context}
          hidden={binding.id !== effectiveActiveId}
        />
      ))}
    </div>
  );
}

// ── Internal: single tab content with event routing ─────────────────────

interface TabContentProps {
  binding: BlockBinding;
  slotId: string;
  bus: RendererProps<BlockBinding>["bus"];
  context: RendererProps<BlockBinding>["context"];
  hidden: boolean;
}

function TabContent({
  binding,
  slotId,
  bus,
  context,
  hidden,
}: TabContentProps) {
  const Component = binding.component;
  const instance = useBlockInstance(binding, slotId, bus);

  // Augment context with a block-specific emitAction that derives the
  // global action ID as {blockId}.{localId} and emits on the workspace bus.
  const augmentedContext: SlotContext = useMemo(
    () => ({
      ...context,
      emitAction: (localId: string, payload?: Record<string, unknown>) => {
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

  return (
    <div className="p-4" style={{ display: hidden ? "none" : undefined }}>
      <Component
        context={augmentedContext}
        instance={instance}
        overrides={binding.overrides}
      />
    </div>
  );
}
