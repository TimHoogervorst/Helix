import { useNavigate } from "react-router-dom";
import { Pin, PinOff, Box } from "lucide-react";
import { usePinnedWorkspaces } from "../hooks/usePinnedWorkspaces";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { extractWorkspaceId } from "../../../shell/src/mod-system/resolveCurrentWorkspace";
import { useSidebar } from "../../../shell/src/workspace/SidebarContext";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { Button } from "../../../shell/src/shared/primitives/Button";

/**
 * Render the icon for a workspace, falling back to a generic Box icon.
 */
function WorkspaceIcon({ workspaceId }: { workspaceId: string }) {
  const config = ModRegistry.getInstance().getWorkspaces().get(workspaceId);
  if (config?.icon) {
    const Icon = config.icon;
    return <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
  return <Box className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

function PinnedWorkspacesSidebar() {
  const navigate = useNavigate();
  const { pins, current, pin, unpin } = usePinnedWorkspaces();
  const { isCollapsed } = useSidebar();

  // ── Derived: is the current workspace already pinned? ──────────────────
  const isCurrentPinned = current
    ? pins.some((p) => p.url === current.url)
    : false;

  function handleRowClick(url: string) {
    navigate(url);
  }

  // ── Collapsed: compact icon-only buttons ─────────────────────────────
  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-2">
        {/* Current workspace (temporary, not pinned) */}
        {current && !isCurrentPinned && (
          <IconButton
            className="flex items-center justify-center w-8 h-8 rounded-md"
            onClick={() => handleRowClick(current.url)}
            title={current.displayId}
            aria-label={`Current workspace: ${current.displayId}`}
          >
            <WorkspaceIcon workspaceId={current.icon} />
          </IconButton>
        )}

        {/* Pinned workspaces */}
        {pins.map((p) => {
          const wsId = extractWorkspaceId(p.url);
          const tooltip =
            p.label && p.label !== p.display_id
              ? `${p.label} — ${p.display_id}`
              : p.display_id;
          return (
            <IconButton
              key={p.id}
              className="flex items-center justify-center w-8 h-8 rounded-md"
              onClick={() => handleRowClick(p.url)}
              title={tooltip}
              aria-label={`Open workspace: ${p.display_id}`}
            >
              {p.icon ? (
                <IconBadge iconKey={p.icon} colorKey={p.color || "muted"} size="sm" />
              ) : wsId ? (
                <WorkspaceIcon workspaceId={wsId} />
              ) : (
                <Box className="h-4 w-4" aria-hidden="true" />
              )}
            </IconButton>
          );
        })}
      </div>
    );
  }

  // ── Expanded: full rows with text, badges, and pin/unpin actions ─────
  return (
    <>
      {/* Workspace tree area */}
      <div className="flex-1 overflow-y-auto px-2 pb-6 text-base">
        {/* Current workspace (temporary, not pinned) */}
        {current && !isCurrentPinned && (
          <div className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-0.5 text-left">
            <Button
              variant="ghost"
              className="min-w-0 flex-1 justify-start rounded-md py-0.5 pl-2 text-left"
              title={current.displayId}
              aria-label={`Current workspace: ${current.displayId}`}
              onClick={() => handleRowClick(current.url)}
            >
              <WorkspaceIcon workspaceId={current.icon} />
              <span className="truncate">{current.displayId}</span>
              <span className="ml-1 shrink-0 rounded bg-muted px-1 font-mono text-2xs leading-[18px] text-muted-foreground">
                Current
              </span>
            </Button>
            <IconButton
              className="grid h-6 w-6 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100"
              title="Pin this workspace"
              aria-label="Pin current workspace"
              onClick={(e) => {
                e.stopPropagation();
                pin();
              }}
            >
              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
            </IconButton>
          </div>
        )}

        {/* Pinned workspaces */}
        {pins.map((p) => {
          const isActive = current?.url === p.url;
          return (
            <div
              key={p.id}
              className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-0.5 text-left"
            >
              <Button
                variant="ghost"
                className={`min-w-0 flex-1 justify-start rounded-md py-0.5 pl-2 text-left${isActive ? " bg-muted font-medium text-foreground" : ""}`}
                title={`${p.display_id} — ${p.label}`}
                aria-label={`Open workspace: ${p.display_id}`}
                onClick={() => handleRowClick(p.url)}
              >
                {p.icon ? (
                  <IconBadge iconKey={p.icon} colorKey={p.color || "muted"} size="sm" />
                ) : (() => {
                  const wsId = extractWorkspaceId(p.url);
                  return wsId ? <WorkspaceIcon workspaceId={wsId} /> : null;
                })()}
                {p.label && p.label !== p.display_id ? (
                  <>
                    <span className="truncate">{p.label}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {p.display_id}
                    </span>
                  </>
                ) : (
                  <span className="truncate">{p.display_id}</span>
                )}
                {isActive && (
                  <span className="ml-1 shrink-0 rounded bg-muted px-1 font-mono text-2xs leading-[18px] text-muted-foreground">
                    Current
                  </span>
                )}
              </Button>
              <IconButton
                className="grid h-6 w-6 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100"
                title="Unpin this workspace"
                aria-label={`Unpin workspace: ${p.display_id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  unpin(p.id);
                }}
              >
                <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default PinnedWorkspacesSidebar;
