import { LayoutList, Star, User, Archive } from "lucide-react";
import type { BlockComponentProps } from "../../../shell/src/mod-system/types";

/**
 * Placeholder block for the library sidebar VIEWS section.
 *
 * Renders a static navigation list with four items: All Entries, Starred,
 * My Entries, and Archived. Each item carries a Lucide icon and uses the
 * same CSS classes as the previously hardcoded sidebar for zero visual diff.
 *
 * "All Entries" is marked as is-active by default (placeholder behavior).
 *
 * Conforms to the BlockComponentProps contract so it can be bound into
 * any block-accepting slot.
 */
export function ViewsBlock(_props: BlockComponentProps) {
  return (
    <div className="library-sidebar-section">
      <h3 className="library-sidebar-heading">VIEWS</h3>
      <ul className="library-sidebar-views">
        <li className="library-sidebar-view-item is-active">
          <LayoutList
            size={14}
            className="library-sidebar-view-icon"
            aria-hidden="true"
          />
          All Entries
        </li>
        <li className="library-sidebar-view-item">
          <Star
            size={14}
            className="library-sidebar-view-icon"
            aria-hidden="true"
          />
          Starred
        </li>
        <li className="library-sidebar-view-item">
          <User
            size={14}
            className="library-sidebar-view-icon"
            aria-hidden="true"
          />
          My Entries
        </li>
        <li className="library-sidebar-view-item">
          <Archive
            size={14}
            className="library-sidebar-view-icon"
            aria-hidden="true"
          />
          Archived
        </li>
      </ul>
    </div>
  );
}
