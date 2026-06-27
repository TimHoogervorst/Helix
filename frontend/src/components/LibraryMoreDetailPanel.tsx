import type { LibraryEntryItem } from "../types/library";
import ElnEditor from "./ElnEditor";
import BrowserWorkspacePanel from "./browser/BrowserWorkspacePanel";

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
    <BrowserWorkspacePanel isExiting={isExiting}>
      <ElnEditor entryId={entry.display_id} embedded />
    </BrowserWorkspacePanel>
  );
}

export default LibraryMoreDetailPanel;
