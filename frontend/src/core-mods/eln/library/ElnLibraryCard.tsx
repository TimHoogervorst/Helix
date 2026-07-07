import type { LibraryCardProps } from "../../../core/mod-system/types";

/**
 * ELN-specific card content rendered below the standard library card fields.
 *
 * BaseLibraryCard already handles display ID, title, status chip, description,
 * tags, updated_at, and owner. This component is the extension point for any
 * ELN-specific content that goes below those standard fields.
 *
 * Currently returns null — no ELN-specific card content yet.
 */
export default function ElnLibraryCard(_props: LibraryCardProps) {
  return null;
}
