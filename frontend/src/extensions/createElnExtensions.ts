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
import ReferenceSuggestion from "./ReferenceSuggestion";
import LimsTable from "./LimsTable";
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
    ReferenceSuggestion,
    SlashCommands,
    TableKit,
    LimsTable,
  ];
}
