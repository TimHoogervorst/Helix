import type { LibraryEntryItem } from "../types/library";
import ElnEditor from "./ElnEditor";

interface LibraryMoreDetailPanelProps {
  entry: LibraryEntryItem;
  isExiting: boolean;
}

/**
 * Expanded right panel for the Library three-step fold.
 * Renders the full ElnEditor in embedded mode — no paper-page,
 * no redundant title (shown in the detail card).
 */
function LibraryMoreDetailPanel({ entry, isExiting }: LibraryMoreDetailPanelProps) {
  return (
    <div
      className={`library-more-detail-panel${isExiting ? " is-exiting" : ""}`}
    >
      <ElnEditor entryId={entry.display_id} embedded />
    </div>
  );
}

export default LibraryMoreDetailPanel;
