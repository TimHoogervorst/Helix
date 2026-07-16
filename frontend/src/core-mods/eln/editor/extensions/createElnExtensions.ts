/**
 * Extension factory for the ELN editor.
 *
 * Returns the standard TipTap extension array used by ElnEditor.
 * Pure function — no editor instance or React dependency needed.
 *
 * TipTap block nodes are discovered from the ModRegistry so that mods can
 * contribute new content blocks (tables, images, attachments, protocols)
 * without the ELN mod importing from them directly.
 *
 * When optional `bus`, `slotId`, and `context` arguments are provided,
 * new slot-system block nodes (from BlockRegistration entries bound into
 * the named slot) are generated via `createBlockNode()` and appended
 * alongside the legacy TipTap node extensions. Both old and new node
 * types coexist in the schema — old types render existing DB content,
 * new types emit lifecycle events on new content (via the workspace bus).
 */
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Reference from "./Reference";
import MentionSuggestion from "./MentionSuggestion";
import SlashCommands from "./SlashCommands";
import {
  ModRegistry,
  BLOCK_TYPE_TIPTAP_NODE,
  isLegacyBlockConfig,
  type TipTapBlockPayload,
} from "../../../../core/mod-system";
import type { SlotContext } from "../../../../core/mod-system/types";
import type { WorkspaceBus } from "../../../../core/workspace/WorkspaceBus";
import { createBlockNode } from "../../../../core/workspace/TipTapRenderer/createBlockNode";
import type { BlockBinding } from "../../../../core/mod-system/types";

export function createElnExtensions(
  bus?: WorkspaceBus,
  slotId?: string,
  context?: SlotContext,
) {
  const blocks = ModRegistry.getInstance().getBlocks();
  const tiptapNodes: any[] = [];

  for (const block of blocks.values()) {
    if (isLegacyBlockConfig(block) && block.type === BLOCK_TYPE_TIPTAP_NODE) {
      const payload = block.payload as TipTapBlockPayload;
      tiptapNodes.push(payload.node);
    }
  }

  // ── Slot-system block nodes (new BlockRegistration shape) ────────────
  // When bus, slotId, and context are provided, resolve the slot and
  // generate a TipTap Node extension for each resolved BlockBinding.
  // These coexist with the legacy node types above — old content uses
  // legacy node types (elnTable, limsTable, etc.), new blocks from the
  // slot system use node names like "eln.table-block", "eln.comment-block".
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
    MentionSuggestion,
    SlashCommands,
    TableKit,
    ...tiptapNodes,
  ];
}
