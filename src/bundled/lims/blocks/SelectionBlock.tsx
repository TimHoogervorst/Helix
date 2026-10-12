import type { BlockComponentProps } from "../../../shell/src/mod-system/types";

/**
 * Placeholder block for the Entities Hub sidebar SELECTION section.
 *
 * Renders a static placeholder message. In future iterations, this block
 * will receive the WorkspaceBus and show the selected entity's details.
 *
 * Conforms to the BlockComponentProps contract.
 */
export function SelectionBlock(_props: BlockComponentProps) {
  return (
    <p className="entities-sidebar-placeholder">
      Select an entity to see details.
    </p>
  );
}
