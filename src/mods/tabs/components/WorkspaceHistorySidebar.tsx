import { useLocation, useNavigate } from "react-router-dom";
import { Pin, Trash2, Box } from "lucide-react";
import { createTab } from "../api";
import {
  useWorkspaceHistory,
  type WorkspaceHistoryItem,
} from "../hooks/useWorkspaceHistory";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { useSidebar } from "../../../shell/src/workspace/SidebarContext";
import { TabRow } from "./TabRow";
import { normalizeWorkspaceUrl } from "../navigation";

function WorkspaceHistorySidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { history, remove } = useWorkspaceHistory();
  const { isCollapsed } = useSidebar();

  function renderIcon(item: WorkspaceHistoryItem) {
    return item.icon ? (
      <IconBadge iconKey={item.icon} colorKey="muted" size="sm" />
    ) : (
      <Box className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    );
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
    <div className="flex-1 overflow-y-auto px-2 pb-6 text-base">
      {history.map((item) => (
        <div
          key={item.url}
          className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-0.5 text-left"
        >
          <TabRow
            displayId={item.displayId}
            name={item.name}
            icon={renderIcon(item)}
            active={item.url === location.pathname}
            ariaLabel={`Open workspace: ${item.displayId}`}
            onClick={() => openWorkspace(item.url)}
            trailing={
              <>
                <IconButton
                  className="grid h-7 w-7 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  title="Pin this workspace"
                  aria-label={`Pin workspace: ${item.displayId}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    pin(item);
                  }}
                >
                  <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
                <IconButton
                  className="grid h-7 w-7 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  title="Remove from history"
                  aria-label={`Remove workspace from history: ${item.displayId}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    remove(item.url);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </IconButton>
              </>
            }
          />
        </div>
      ))}
    </div>
  );
}

export default WorkspaceHistorySidebar;
