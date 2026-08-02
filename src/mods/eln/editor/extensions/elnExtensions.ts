import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Reference from "./Reference";
import UnifiedSuggestion from "./UnifiedSuggestion";

export const elnExtensions = [
  Placeholder.configure({ placeholder: "Start writing…" }),
  Reference,
  UnifiedSuggestion,
  TableKit,
];
