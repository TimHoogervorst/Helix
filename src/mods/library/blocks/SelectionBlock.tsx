import type { BlockComponentProps } from "../../../shell/src/mod-system/types";

/**
 * Placeholder block for the library sidebar SELECTION section.
 *
 * Renders a static heading + placeholder message. At this stage the
 * LibraryHub does not track a selected entry; the message always reads
 * "Select an entry to see details."
 *
 * Conforms to the BlockComponentProps contract so it can be bound into
 * any block-accepting slot.
 */
export function SelectionBlock(_props: BlockComponentProps) {
  return (
    <div className="library-sidebar-section">
      <h3 className="library-sidebar-heading">SELECTION</h3>
      <p className="library-sidebar-placeholder">
        Select an entry to see details.
      </p>
    </div>
  );
}
