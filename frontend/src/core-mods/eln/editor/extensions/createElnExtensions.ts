/**
 * Extension factory for the ELN editor.
 *
 * Returns the standard TipTap extension array used by ElnEditor.
 * Pure function — no editor instance or React dependency needed.
 *
 * TipTap block nodes are discovered from the ModRegistry so that mods can
 * contribute new content blocks (tables, images, attachments, protocols)
 * without the ELN mod importing from them directly.
 */
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Reference from "./Reference";
import MentionSuggestion from "./MentionSuggestion";
import SlashCommands from "./SlashCommands";
import { ModRegistry, BLOCK_TYPE_TIPTAP_NODE, isLegacyBlockConfig, type TipTapBlockPayload } from "../../../../core/mod-system";

export function createElnExtensions() {
  const blocks = ModRegistry.getInstance().getBlocks();
  const tiptapNodes: any[] = [];

  for (const block of blocks.values()) {
    if (isLegacyBlockConfig(block) && block.type === BLOCK_TYPE_TIPTAP_NODE) {
      const payload = block.payload as TipTapBlockPayload;
      tiptapNodes.push(payload.node);
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
