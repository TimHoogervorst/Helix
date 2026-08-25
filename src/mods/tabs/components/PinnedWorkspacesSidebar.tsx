import { useNavigate } from "react-router-dom";
import { PinOff, Box, GripVertical, Folder, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import React, { type ReactNode } from "react";
import { usePinnedWorkspaces } from "../hooks/usePinnedWorkspaces";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { extractWorkspaceId } from "../../../shell/src/mod-system/resolveCurrentWorkspace";
import { useSidebar } from "../../../shell/src/workspace/SidebarContext";
import { IconBadge } from "../../../shell/src/shared/components/IconBadge";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { TabRow } from "./TabRow";
import { Menu, Modal } from "../../../shell/src/shared/primitives";
import type { CurrentWorkspace, PinnedWorkspace, TabFolder } from "../types";

function SortableTab({
  id,
  sortable = true,
  children,
}: {
  id: number | string;
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
  const { pins, current, unpin, move, createFolder, renameFolder, removeFolder, toggleFolder, folders: loadedFolders } = usePinnedWorkspaces();
  const folders = loadedFolders ?? [];
  const safeMove = move ?? (async () => {});
  const safeCreateFolder = createFolder ?? (async () => null);
  const safeRenameFolder = renameFolder ?? (async () => {});
  const safeRemoveFolder = removeFolder ?? (async () => {});
  const safeToggleFolder = toggleFolder ?? (async () => {});
  const { isCollapsed } = useSidebar();
  const [editing, setEditing] = React.useState<{ id: number | null; value: string }>({ id: null, value: "" });
  const [deleting, setDeleting] = React.useState<TabFolder | null>(null);
  const [creating, setCreating] = React.useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleRowClick(url: string) {
    navigate(url);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith("folder:")) {
      if (!overId.startsWith("folder:")) return;
      const source = Number(activeId.slice(7));
      const target = Number(overId.slice(7));
      if (source !== target) void safeMove(source, target);
      return;
    }
    void safeMove(Number(activeId), overId === "root" ? "root" : overId.startsWith("folder:") ? overId as `folder:${number}` : Number(overId));
  }

  React.useEffect(() => {
    const handler = () => setCreating(true);
    window.addEventListener("helix-create-tab-folder", handler);
    return () => window.removeEventListener("helix-create-tab-folder", handler);
  }, []);

  function submitCreate() {
    const name = editing.value.trim();
    if (name) void safeCreateFolder(name);
    setCreating(false);
    setEditing({ id: null, value: "" });
  }

  function submitRename() {
    if (editing.id !== null && editing.value.trim()) void safeRenameFolder(editing.id, editing.value.trim());
    setEditing({ id: null, value: "" });
  }

  // ── Collapsed: compact icon-only buttons ─────────────────────────────
  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-1 py-2">
        {/* Pinned workspaces */}
    {[...pins].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((p) => {
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
          <SortableContext items={folders.map((folder) => `folder:${folder.id}`)} strategy={verticalListSortingStrategy}>
            {folders.map((folder) => (
              <FolderRow key={folder.id} folder={folder} tabCount={pins.filter((pin) => pin.folder === folder.id).length} editing={editing} setEditing={setEditing} deleting={deleting} setDeleting={setDeleting} onToggle={() => void safeToggleFolder(folder.id)} onSubmitRename={submitRename}>
                {folder.expanded && <SortableContext items={pins.filter((pin) => pin.folder === folder.id).map((pin) => pin.id)} strategy={verticalListSortingStrategy}>
                  {pins.filter((pin) => pin.folder === folder.id).map((p) => <TabItem key={p.id} pin={p} current={current} handleRowClick={handleRowClick} unpin={unpin} />)}
                </SortableContext>}
              </FolderRow>
            ))}
          </SortableContext>
          {creating && <InlineInput value={editing.value} onChange={(value) => setEditing({ id: null, value })} onSubmit={submitCreate} onCancel={() => setCreating(false)} placeholder="Folder name" />}
          <SortableContext items={pins.filter((pin) => pin.folder == null).map((pin) => pin.id)} strategy={verticalListSortingStrategy}>
            {pins.filter((pin) => pin.folder == null).map((p) => {
              return (
                <SortableTab key={p.id} id={p.id}>
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
                active={current?.url === p.url}
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
          <RootDropZone />
        </DndContext>
        <Modal open={deleting !== null} onClose={() => setDeleting(null)} title="Delete tab folder">
          {deleting && (
            <div className="space-y-4">
              <p>Delete “{deleting.name}” and its {pins.filter((pin) => pin.folder === deleting.id).length} tabs?</p>
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded px-3 py-1.5" onClick={() => setDeleting(null)}>Cancel</button>
                <button type="button" className="rounded bg-[var(--color-destructive)] px-3 py-1.5 text-white" onClick={() => { void safeRemoveFolder(deleting.id); setDeleting(null); }}>Delete</button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </>
  );
}

function InlineInput({ value, onChange, onSubmit, onCancel, placeholder }: { value: string; onChange: (value: string) => void; onSubmit: () => void; onCancel: () => void; placeholder: string }) {
  return <input autoFocus value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSubmit(); if (event.key === "Escape") onCancel(); }} className="w-full rounded border border-[var(--color-ink-hairline)] bg-transparent px-2 py-1 text-sm" />;
}

function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: "root" });
  return <div ref={setNodeRef} className={`min-h-2 rounded ${isOver ? "bg-[var(--color-surface-hover)]" : ""}`} aria-label="Move tab to root" />;
}

function TabItem({ pin, current, handleRowClick, unpin }: { pin: PinnedWorkspace; current: CurrentWorkspace | null; handleRowClick: (url: string) => void; unpin: (id: number) => Promise<void> }) {
  const wsId = extractWorkspaceId(pin.url);
  return <SortableTab id={pin.id}><div className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-0.5 text-left"><TabRow displayId={pin.display_id} name={pin.label} icon={pin.icon ? <IconBadge iconKey={pin.icon} colorKey={pin.color || "muted"} size="sm" /> : wsId ? <WorkspaceIcon workspaceId={wsId} /> : <Box className="h-3.5 w-3.5" />} active={current?.url === pin.url} ariaLabel={`Open workspace: ${pin.display_id}`} onClick={() => handleRowClick(pin.url)} trailing={<IconButton className="grid h-7 w-7 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100" title="Unpin this workspace" aria-label={`Unpin workspace: ${pin.display_id}`} onClick={() => void unpin(pin.id)}><PinOff className="h-3.5 w-3.5" /></IconButton>} /></div></SortableTab>;
}

function FolderRow({ folder, tabCount, editing, setEditing, setDeleting, onToggle, children, onSubmitRename }: { folder: TabFolder; tabCount: number; editing: { id: number | null; value: string }; setEditing: (value: { id: number | null; value: string }) => void; deleting: TabFolder | null; setDeleting: (folder: TabFolder | null) => void; onToggle: () => void; children: ReactNode; onSubmitRename: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `folder:${folder.id}` });
  const isEditing = editing.id === folder.id;
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}><div className="group flex items-center gap-1 rounded-md py-1" onClick={(event) => { if ((event.target as HTMLElement).closest("[data-folder-menu]")) return; onToggle(); }}><button type="button" className="grid h-7 w-5 place-items-center" {...attributes} {...listeners}><GripVertical className="h-3.5 w-3.5 text-muted-foreground" /></button><Folder className="h-3.5 w-3.5" /><div className="min-w-0 flex-1">{isEditing ? <InlineInput value={editing.value} onChange={(value) => setEditing({ id: folder.id, value })} onSubmit={onSubmitRename} onCancel={() => setEditing({ id: null, value: "" })} placeholder="Folder name" /> : <button type="button" className="w-full truncate text-left" onClick={onToggle}>{folder.name} <span className="text-xs text-muted-foreground">{tabCount}</span></button>}</div><span data-folder-menu><Menu trigger={<IconButton aria-label={`Folder actions: ${folder.name}`} size="sm"><MoreHorizontal size={15} /></IconButton>} items={[{ id: "rename", label: "Rename", icon: Pencil, onSelect: () => setEditing({ id: folder.id, value: folder.name }) }, { id: "delete", label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleting(folder) }]} /></span></div>{children}</div>;
}

export default PinnedWorkspacesSidebar;
