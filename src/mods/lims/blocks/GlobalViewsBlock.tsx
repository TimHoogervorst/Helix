import type { BlockComponentProps } from "../../../shell/src/mod-system/types";

/**
 * Placeholder block for the Entities Hub sidebar GLOBAL VIEWS section.
 *
 * Lists public Views shared by other users. Empty placeholder for v1 —
 * View sharing will be implemented in a future iteration (#298).
 *
 * Conforms to the BlockComponentProps contract.
 */
export function GlobalViewsBlock(_props: BlockComponentProps) {
  return (
    <ul className="entities-sidebar-views">
      <li className="entities-sidebar-view-item is-empty">
        No public views yet.
      </li>
    </ul>
  );
}
