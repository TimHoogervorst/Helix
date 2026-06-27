import type { LibraryEntryItem } from "../../types/library";
import ElnEditor from "../../components/ElnEditor";
import ConsoleWorkspacePanel from "../../console/core/ConsoleWorkspacePanel";

interface ElnWorkspaceProps {
  entry: LibraryEntryItem;
  isExiting: boolean;
}

/**
 * Expanded right panel for the Library three-step fold.
 * Renders the full ElnEditor in embedded mode — no paper-page,
 * no redundant title (shown in the detail card).
 */
function ElnWorkspace({ entry, isExiting }: ElnWorkspaceProps) {
  return (
    <ConsoleWorkspacePanel isExiting={isExiting}>
      <ElnEditor entryId={entry.display_id} embedded />
    </ConsoleWorkspacePanel>
  );
}

export default ElnWorkspace;
