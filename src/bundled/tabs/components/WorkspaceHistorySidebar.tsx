import { useLocation, useNavigate } from "react-router-dom";
import { Pin, Box } from "lucide-react";
import { createTab } from "../api";
import {
  useWorkspaceHistory,
  type WorkspaceHistoryItem,
} from "../hooks/useWorkspaceHistory";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { useSidebar } from "../../../shell/src/workspace/SidebarContext";
import { TabRow } from "./TabRow";
import { normalizeWorkspaceUrl } from "../navigation";
import { extractWorkspaceId } from "../../../shell/src/mod-system/resolveCurrentWorkspace";
import { WorkspaceIcon } from "./WorkspaceIcon";

function WorkspaceHistorySidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { history } = useWorkspaceHistory();
  const { isCollapsed } = useSidebar();

  function renderIcon(item: WorkspaceHistoryItem) {
    const workspaceId = extractWorkspaceId(item.url);
    return workspaceId ? <WorkspaceIcon workspaceId={workspaceId} /> : <Box className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }

  async function pin(item: WorkspaceHistoryItem) {
    try {
      await createTab({
        display_id: item.displayId,
        label: item.name === item.displayId ? "" : item.name,
        url: item.url,
      });
      window.dispatchEvent(new Event("helix-tabs-changed"));
    } catch {
      // A failed or duplicate pin does not affect local history.
    }
  }

  function openWorkspace(url: string) {
    navigate(normalizeWorkspaceUrl(url));
  }

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-2">
        {history.map((item) => (
          <IconButton
            key={item.url}
            className="flex h-8 w-8 items-center justify-center rounded-md"
            onClick={() => openWorkspace(item.url)}
            title={item.name === item.displayId ? item.displayId : `${item.name} — ${item.displayId}`}
            aria-label={`Open workspace: ${item.displayId}`}
          >
            {renderIcon(item)}
          </IconButton>
        ))}
      </div>
    );
  }

  return (
    <div className="sidebar-history-list min-h-0 flex-1 px-2 pb-6 text-base">
      {history.map((item) => (
        <div
          key={item.url}
          className="flex w-full items-center gap-1.5 rounded-md py-1 pr-0.5 text-left"
        >
          <TabRow
            displayId={item.displayId}
            name={item.name}
            icon={renderIcon(item)}
            iconAction={<IconButton className="grid h-6 w-6 place-items-center rounded p-0" style={{ width: "1.5rem", height: "1.5rem" }} title="Pin this workspace" aria-label={`Pin workspace: ${item.displayId}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); pin(item); }}><Pin className="h-3.5 w-3.5" aria-hidden="true" /></IconButton>}
            active={item.url === location.pathname}
            ariaLabel={`Open workspace: ${item.displayId}`}
            onClick={() => openWorkspace(item.url)}
          />
        </div>
      ))}
    </div>
  );
}

export default WorkspaceHistorySidebar;
