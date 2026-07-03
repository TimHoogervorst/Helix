import { useNavigate } from "react-router-dom";
import { Dna, Pin, PinOff, FileText } from "lucide-react";
import { usePinnedWorkspaces } from "../hooks/usePinnedWorkspaces";

function PinnedWorkspacesSidebar() {
  const navigate = useNavigate();
  const { pins, current, pin, unpin } = usePinnedWorkspaces();

  // ── Derived: is the current workspace already pinned? ──────────────────
  const isCurrentPinned = current
    ? pins.some((p) => p.url === current.url)
    : false;

  // ── Icon resolver ──────────────────────────────────────────────────────
  function workspaceIcon(icon: "lims" | "eln") {
    switch (icon) {
      case "lims":
        return <Dna className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
      case "eln":
        return <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    }
  }

  function handleRowClick(url: string) {
    navigate(url);
  }

  return (
    <>
      {/* Workspace section header */}
      <div className="mt-1 px-3 pb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Workspace
      </div>

      {/* Workspace tree area */}
      <div className="flex-1 overflow-y-auto px-2 pb-6 text-[13px]">
        {/* Current workspace (temporary, not pinned) */}
        {current && !isCurrentPinned && (
          <div className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-0.5 text-left">
            <button
              className="btn-ghost flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pl-2 text-left"
              title={current.displayId}
              aria-label={`Current workspace: ${current.displayId}`}
              onClick={() => handleRowClick(current.url)}
            >
              {workspaceIcon(current.icon)}
              <span className="truncate">{current.displayId}</span>
              <span className="ml-1 shrink-0 rounded bg-muted px-1 font-mono text-[9px] leading-[18px] text-muted-foreground">
                Current
              </span>
            </button>
            <button
              className="btn-ghost grid h-6 w-6 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100"
              title="Pin this workspace"
              aria-label="Pin current workspace"
              onClick={(e) => {
                e.stopPropagation();
                pin();
              }}
            >
              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
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
              <button
                className={`btn-ghost flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pl-2 text-left${isActive ? " bg-muted font-medium text-foreground" : ""}`}
                title={`${p.display_id} — ${p.label}`}
                aria-label={`Open workspace: ${p.display_id}`}
                onClick={() => handleRowClick(p.url)}
              >
                {workspaceIcon(
                  p.url.startsWith("/lims") ? "lims" : "eln",
                )}
                {p.label && p.label !== p.display_id ? (
                  <>
                    <span className="truncate">{p.label}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {p.display_id}
                    </span>
                  </>
                ) : (
                  <span className="truncate">{p.display_id}</span>
                )}
                {isActive && (
                  <span className="ml-1 shrink-0 rounded bg-muted px-1 font-mono text-[9px] leading-[18px] text-muted-foreground">
                    Current
                  </span>
                )}
              </button>
              <button
                className="btn-ghost grid h-6 w-6 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100"
                title="Unpin this workspace"
                aria-label={`Unpin workspace: ${p.display_id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  unpin(p.id);
                }}
              >
                <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default PinnedWorkspacesSidebar;
