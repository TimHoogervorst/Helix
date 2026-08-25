import { useNavigate } from "react-router-dom";
import { PinOff, Box, GripVertical } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { usePinnedWorkspaces } from "../hooks/usePinnedWorkspaces";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { extractWorkspaceId } from "../../../shell/src/mod-system/resolveCurrentWorkspace";
import { useSidebar } from "../../../shell/src/workspace/SidebarContext";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { TabRow } from "./TabRow";

function SortableTab({
  id,
  sortable = true,
  children,
}: {
  id: number;
  sortable?: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({
    id,
    disabled: !sortable,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {sortable && (
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="grid h-7 w-5 shrink-0 place-items-center rounded border-0 bg-transparent text-muted-foreground"
          title="Reorder workspace"
          aria-label="Reorder workspace"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      {children}
    </div>
  );
}

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
  const { pins, current, unpin, reorder } = usePinnedWorkspaces();
  const { isCollapsed } = useSidebar();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleRowClick(url: string) {
    navigate(url);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) {
      void reorder(Number(active.id), Number(over.id));
    }
  }

  // ── Collapsed: compact icon-only buttons ─────────────────────────────
  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-2">
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
        {/* Pinned workspaces */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={pins.filter((pin) => pin.folder == null).map((pin) => pin.id)}
            strategy={verticalListSortingStrategy}
          >
            {pins.map((p) => {
              const isActive = current?.url === p.url;
              return (
                <SortableTab key={p.id} id={p.id} sortable={p.folder == null}>
              <div className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-0.5 text-left">
                <TabRow
                displayId={p.display_id}
                name={p.label}
                icon={
                  p.icon ? (
                    <IconBadge iconKey={p.icon} colorKey={p.color || "muted"} size="sm" />
                  ) : (() => {
                    const wsId = extractWorkspaceId(p.url);
                    return wsId ? (
                      <WorkspaceIcon workspaceId={wsId} />
                    ) : (
                      <Box className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    );
                  })()
                }
                active={isActive}
                ariaLabel={`Open workspace: ${p.display_id}`}
                onClick={() => handleRowClick(p.url)}
                trailing={
                  <IconButton
                    className="grid h-7 w-7 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    title="Unpin this workspace"
                    aria-label={`Unpin workspace: ${p.display_id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      unpin(p.id);
                    }}
                  >
                    <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                  </IconButton>
                }
                />
              </div>
                </SortableTab>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>
    </>
  );
}

export default PinnedWorkspacesSidebar;
