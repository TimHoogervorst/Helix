import type { RendererProps, ButtonBinding } from "../mod-system/types";
import type { WorkspaceBus } from "./WorkspaceBus";

/**
 * Renders buttons horizontally sorted by order.
 *
 * Each button's DOM click event fires its `onClick` handler with
 * `{ bus, context }`. The button author writes bus interaction code
 * inside `onClick` — the renderer just wires the click.
 *
 * Buttons are fire-only: no lifecycle events, no `listensTo`.
 *
 * Layout: horizontal (order: 0 = leftmost).
 */
export function ButtonGroupRenderer({
  bindings,
  bus,
  context,
}: Omit<RendererProps<ButtonBinding>, "bus"> & { bus: WorkspaceBus }) {
  // slotId is available but unused — buttons don't need slot identity
  if (bindings.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {bindings.map((binding) => {
        const Icon = binding.icon;
        return (
          <button
            key={binding.id}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-secondary hover:bg-hover hover:text-primary transition-colors"
            onClick={() => binding.onClick({ bus, context })}
            aria-label={binding.label}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {binding.label}
          </button>
        );
      })}
    </div>
  );
}
