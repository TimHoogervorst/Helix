/**
 * Extension factory for the ELN editor.
 *
 * Returns the standard TipTap extension array used by ElnEditor.
 * Pure function — no editor instance or React dependency needed.
 *
 * Legacy TipTap node extensions (LimsTable, TableBlock, CommentBlock,
 * ProtocolBlock) are included directly for backward compatibility with
 * existing database content that uses the old node type names.
 *
 * When optional `bus`, `slotId`, and `context` arguments are provided,
 * new slot-system block nodes (from BlockRegistration entries bound into
 * the named slot) are generated via `createBlockNode()` and appended
 * alongside the legacy node extensions.
 */
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Reference from "./Reference";
import MentionSuggestion from "./MentionSuggestion";
import SlashCommands from "./SlashCommands";
import { ModRegistry } from "../../../../core/mod-system";
import type { SlotContext } from "../../../../core/mod-system/types";
import type { WorkspaceBus } from "../../../../core/workspace/WorkspaceBus";
import { createBlockNode } from "../../../../core/workspace/TipTapRenderer/createBlockNode";
import type { BlockBinding } from "../../../../core/mod-system/types";
import LimsTable from "../../../../core-mods/eln/blocks/LimsTable";
import TableBlock from "../../../../core-mods/eln/blocks/TableBlock";
import CommentBlock from "../../../../core-mods/eln/blocks/CommentBlock";
import ProtocolBlock from "../../../../core-mods/eln/blocks/ProtocolBlock";

/** Legacy TipTap node extensions for backward compat with existing DB content. */
const LEGACY_NODES = [LimsTable, TableBlock, CommentBlock, ProtocolBlock];

export function createElnExtensions(
  bus?: WorkspaceBus,
  slotId?: string,
  context?: SlotContext,
) {
  const tiptapNodes: any[] = [...LEGACY_NODES];

  // ── Slot-system block nodes (BlockRegistration shape) ────────────────
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
