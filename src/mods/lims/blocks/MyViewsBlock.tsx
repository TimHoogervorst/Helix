import type { BlockComponentProps } from "../../../shell/src/mod-system/types";

/**
 * Placeholder block for the Entities Hub sidebar MY VIEWS section.
 *
 * Lists the current user's saved Views. Empty placeholder for v1 —
 * View saving will be implemented in a future iteration (#298).
 *
 * Conforms to the BlockComponentProps contract.
 */
export function MyViewsBlock(_props: BlockComponentProps) {
  return (
    <ul className="entities-sidebar-views">
      <li className="entities-sidebar-view-item is-empty">
        No saved views yet.
      </li>
    </ul>
  );
}
