/**
 * Extension factory for the ELN editor.
 *
 * Returns the standard TipTap extension array used by ElnEditor.
 * Pure function — no editor instance or React dependency needed.
 *
 * When optional `bus`, `slotId`, and `context` arguments are provided,
 * slot-system block nodes (from BlockRegistration entries bound into
 * the named slot) are generated via `createBlockNode()` and included
 * in the extension array.
 */
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Reference from "./Reference";
import UnifiedSuggestion from "./UnifiedSuggestion";
import { ModRegistry } from "../../../../shell/src/mod-system";
import type { SlotContext } from "../../../../shell/src/mod-system/types";
import type { WorkspaceBus } from "../../../../shell/src/workspace/WorkspaceBus";
import { createBlockNode } from "../../../../shell/src/workspace/TipTapRenderer/createBlockNode";
import type { BlockBinding } from "../../../../shell/src/mod-system/types";

export function createElnExtensions(
  bus?: WorkspaceBus,
  slotId?: string,
  context?: SlotContext,
) {
  const tiptapNodes: any[] = [];

  // ── Slot-system block nodes (BlockRegistration shape) ────────────────
  // When bus, slotId, and context are provided, resolve the slot and
  // generate a TipTap Node extension for each resolved BlockBinding.
  if (bus && slotId && context) {
    const resolved = ModRegistry.getInstance().resolveSlot(slotId);
    if (resolved) {
      for (const binding of resolved.bindings) {
        if (binding.type === "block") {
          const blockBinding = binding as BlockBinding;
          tiptapNodes.push(createBlockNode(blockBinding, bus, slotId, context));
        }
      }
    }
  }

  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Placeholder.configure({
      placeholder: "Start writing…",
    }),
    Reference,
    UnifiedSuggestion,
    TableKit,
    ...tiptapNodes,
  ];
}
