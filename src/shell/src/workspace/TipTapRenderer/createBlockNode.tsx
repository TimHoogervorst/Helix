/**
 * Factory that creates a TipTap Node extension for a single BlockBinding.
 *
 * Each block binding becomes a named node type in the ProseMirror schema.
 * The node stores block state as a single opaque `content` attribute via
 * the block's `serialize`/`deserialize` functions.
 *
 * A React NodeView renders the block's component inside the editor,
 * passing `BlockComponentProps` (`{ context, instance }` — no `bus`).
 * Lifecycle events (`created`, `edited`, `deleted`) and event routing
 * (`listensTo` → `onEvent`) are managed by BlockNodeView.
 */
import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { BlockNodeView } from "./BlockNodeView";
import type { BlockBinding, SlotContext } from "../../mod-system/types";
import type { WorkspaceBus } from "../WorkspaceBus";
import type { LifecycleEventPayload } from "./useActionAccumulator";

/**
 * Create a TipTap Node extension from a resolved BlockBinding.
 *
 * The returned Node extension is ready to be passed to `useEditor({ extensions })`.
 * Each call returns a distinct Node type named after `binding.id` (e.g. "eln.table").
 *
 * Override semantics (from merged slot defaults + per-binding overrides):
 * - `overrides.nodeType: "inline"` → `group: "inline"` (default: "block")
 * - `overrides.atom: false` → content is editable (default: true, void node)
 * - `overrides.group: string` → explicit ProseMirror group
 *
 * @param binding - Resolved block binding with merged overrides.
 * @param bus     - Workspace-scoped event bus for lifecycle events and event routing.
 * @param slotId  - The slot this block is rendered in.
 * @param context - Flat metadata bag available to the block component.
 * @param onLifecycleEvent - Callback from useActionAccumulator for block lifecycle events.
 */
export function createBlockNode(
  binding: BlockBinding,
  bus: WorkspaceBus,
  slotId: string,
  context: SlotContext,
  onLifecycleEvent?: (payload: LifecycleEventPayload) => void,
): Node {
  // Determine ProseMirror group from overrides
  const group =
    typeof binding.overrides.group === "string"
      ? binding.overrides.group
      : binding.overrides.nodeType === "inline"
        ? "inline"
        : "block";

  // Determine atom from overrides (default: true — void node)
  const atom = binding.overrides.atom !== false;

  // Default serialized content
  const defaultContent = binding.serialize(binding.defaultState);

  // NodeView wrapper — captures binding/bus/slotId/context via closure
  // so each node type gets its own data without storing it on the extension.
  function WrapperNodeView(props: NodeViewProps) {
    return (
      <BlockNodeView
        {...props}
        binding={binding}
        bus={bus}
        slotId={slotId}
        context={context}
        onLifecycleEvent={onLifecycleEvent}
      />
    );
  }

  return Node.create({
    name: binding.id,
    group,
    atom,

    addAttributes() {
      return {
        content: {
          default: defaultContent,
          parseHTML: (element) => {
            const raw = element.getAttribute("data-content");
            return raw ?? defaultContent;
          },
          renderHTML: (attributes) => ({
            "data-content": attributes.content,
          }),
        },
      };
    },

    parseHTML() {
      // Use a data attribute for tag matching since block IDs
      // contain dots (e.g. "eln.table") which are invalid in HTML tag names.
      return [{ tag: `div[data-block-type="${binding.id}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        {
          "data-block-type": binding.id,
          ...HTMLAttributes,
        },
      ];
    },

    addNodeView() {
      return ReactNodeViewRenderer(WrapperNodeView, {
        stopEvent: ({ event }) => {
          const target = event.target as HTMLElement;

          // Interactive elements and their descendants should always be
          // handled by the block's own UI, not ProseMirror.
          // Use closest() instead of exact tag check so clicks on SVG
          // icons and spans inside buttons are also stopped.
          const isInteractive =
            target.matches("input, button, select, textarea") ||
            target.closest("input, button, select, textarea") !== null ||
            target.isContentEditable;

          if (
            isInteractive &&
            event.type !== "drop" &&
            !event.type.startsWith("drag")
          ) {
            return true;
          }

          // Clipboard events inside an interaction-controlled table cell
          // are handled by the block itself (TSV copy/paste via
          // useTableInteraction) — ProseMirror must not also serialise or
          // insert at the editor selection.
          if (
            (event.type === "copy" ||
              event.type === "paste" ||
              event.type === "cut") &&
            target.closest("[data-table-cell]") !== null
          ) {
            return true;
          }

          // Clipboard events go to ProseMirror for integration.
          if (
            event.type === "copy" ||
            event.type === "paste" ||
            event.type === "cut"
          ) {
            return false;
          }

          // Drag events go to ProseMirror.
          if (event.type.startsWith("drag") || event.type === "drop") {
            return false;
          }

          // Stop all other events (click, dblclick, keydown, mousedown, etc.)
          // from reaching ProseMirror. This prevents NodeSelection when
          // clicking on non-interactive content inside the block.
          return true;
        },
      });
    },
  });
}
