import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import Reference from "./Reference";
import TrailingParagraph from "./TrailingParagraph";
import UnifiedSuggestion from "./UnifiedSuggestion";
import { PortableBlockNode, PortableInlineNode, PortableMark } from "../portableBlockExtensions";

export const elnExtensions = [
  Placeholder.configure({ placeholder: "Start writing…" }),
  Reference,
  TrailingParagraph,
  UnifiedSuggestion,
  TableKit,
  PortableBlockNode,
  PortableInlineNode,
  PortableMark,
];
