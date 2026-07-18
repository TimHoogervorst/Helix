import type { BlockComponentProps } from "../../../shell/src/mod-system/types";

/**
 * Placeholder block for the library sidebar SELECTION section.
 *
 * Renders a static placeholder message. At this stage the
 * LibraryHub does not track a selected entry; the message always reads
 * "Select an entry to see details."
 *
 * The section heading is provided by SidebarSection in SlotSidebar,
 * so this block only outputs the inner content.
 *
 * Conforms to the BlockComponentProps contract so it can be bound into
 * any block-accepting slot.
 */
export function SelectionBlock(_props: BlockComponentProps) {
  return (
    <p className="library-sidebar-placeholder">
      Select an entry to see details.
    </p>
  );
}
