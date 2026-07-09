/**
 * Extension factory for the ELN editor.
 *
 * Returns the standard TipTap extension array used by ElnEditor.
 * Pure function — no editor instance or React dependency needed.
 */
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Reference from "./Reference";
import MentionSuggestion from "./MentionSuggestion";
import LimsTable from "../../blocks/LimsTable";
import SlashCommands from "./SlashCommands";
export function createElnExtensions() {
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
    LimsTable,
  ];
}
