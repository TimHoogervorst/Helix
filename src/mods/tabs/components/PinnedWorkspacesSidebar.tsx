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
import { IconBadge, resolveColorForeground } from "../../../shell/src/shared/components/IconBadge";
import { IconButton } from "../../../shell/src/shared/primitives/IconButton";
import { TabRow } from "./TabRow";
import { Button, Menu, Modal } from "../../../shell/src/shared/primitives";
import type { CurrentWorkspace, PinnedWorkspace, TabFolder } from "../types";
import type { LayoutDropTarget, LayoutItem } from "../layoutTransition";
import { normalizeWorkspaceUrl } from "../navigation";

function SortableTab({
  id,
  sortable = true,
  children,
}: {
  id: number | string;
  sortable?: boolean;
  children: ReactNode | ((dragHandle: ReactNode) => ReactNode);
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
      className="flex min-w-0 items-center"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {typeof children === "function"
        ? children(
            sortable ? (
              <span
                ref={setActivatorNodeRef}
                className="grid h-6 w-6 place-items-center text-current"
                title="Reorder workspace"
                aria-label="Reorder workspace"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            ) : null,
          )
        : children}
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
    navigate(normalizeWorkspaceUrl(url));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const source = Number(activeId.replace("folder:", ""));
    let target: LayoutDropTarget | number | `folder:${number}` | "root";
    if (overId.startsWith("insert:top")) target = { kind: "top-edge", position: "before" };
    else if (overId.startsWith("insert:bottom")) target = { kind: "top-edge", position: "after" };
    else if (overId.startsWith("insert:before:")) target = { kind: "top", position: "before", item: layoutTargetItem(overId.slice(14)) };
    else if (overId.startsWith("insert:after:")) target = { kind: "top", position: "after", item: layoutTargetItem(overId.slice(13)) };
    else if (overId.startsWith("folder:")) target = overId as `folder:${number}`;
    else target = Number(overId);
    void safeMove(source, target);
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
      <div className="flex-1 overflow-x-hidden overflow-y-auto px-2 pb-6 text-base">
        {/* Pinned workspaces */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={topLevelItems(folders, pins).map((item) => item.kind === "folder" ? `folder:${item.id}` : item.id)} strategy={verticalListSortingStrategy}>
            <InsertionLine id="insert:top" />
            {topLevelItems(folders, pins).map((item, index, all) => <React.Fragment key={`${item.kind}:${item.id}`}>
              {item.kind === "folder" ? <FolderRow folder={item.folder} tabCount={pins.filter((pin) => pin.folder === item.id).length} editing={editing} setEditing={setEditing} deleting={deleting} setDeleting={setDeleting} onToggle={() => void safeToggleFolder(item.id)} onSubmitRename={submitRename}>
                {item.folder.expanded && <SortableContext items={item.children.map((pin) => pin.id)} strategy={verticalListSortingStrategy}>{item.children.map((pin) => <TabItem key={pin.id} pin={pin} current={current} handleRowClick={handleRowClick} unpin={unpin} />)}</SortableContext>}
              </FolderRow> : <TabItem key={item.pin.id} pin={item.pin} current={current} handleRowClick={handleRowClick} unpin={unpin} />}
              <InsertionLine id={index === all.length - 1 ? "insert:bottom" : `insert:before:${all[index + 1].kind === "folder" ? `folder:${all[index + 1].id}` : all[index + 1].id}`} />
            </React.Fragment>)}
          </SortableContext>
          {creating && <InlineInput value={editing.value} onChange={(value) => setEditing({ id: null, value })} onSubmit={submitCreate} onCancel={() => setCreating(false)} placeholder="Folder name" />}
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

function layoutTargetItem(value: string): LayoutItem {
  return value.startsWith("folder:")
    ? { kind: "folder", id: Number(value.slice(7)) }
    : { kind: "tab", id: Number(value), folder: null };
}

function InlineInput({ value, onChange, onSubmit, onCancel, placeholder }: { value: string; onChange: (value: string) => void; onSubmit: () => void; onCancel: () => void; placeholder: string }) {
  return <input autoFocus value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSubmit(); if (event.key === "Escape") onCancel(); }} className="w-full rounded border border-[var(--color-ink-hairline)] bg-transparent px-2 py-1 text-sm" />;
}

function InsertionLine({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={`h-0.5 rounded ${isOver ? "bg-[var(--color-accent)]" : ""}`} aria-label="Insert tab or folder" />;
}

type TopLevelItem =
  | { kind: "folder"; id: number; folder: TabFolder; children: PinnedWorkspace[] }
  | { kind: "tab"; id: number; pin: PinnedWorkspace };

function topLevelItems(folders: TabFolder[], pins: PinnedWorkspace[]): TopLevelItem[] {
  return [...folders.map((folder) => ({ kind: "folder" as const, id: folder.id, folder, children: pins.filter((pin) => pin.folder === folder.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) })), ...pins.filter((pin) => pin.folder == null).map((pin) => ({ kind: "tab" as const, id: pin.id, pin }))].sort((a, b) => ((a.kind === "folder" ? a.folder.order : a.pin.order ?? 0) - (b.kind === "folder" ? b.folder.order : b.pin.order ?? 0)));
}

function TabItem({ pin, current, handleRowClick, unpin }: { pin: PinnedWorkspace; current: CurrentWorkspace | null; handleRowClick: (url: string) => void; unpin: (id: number) => Promise<void> }) {
  const wsId = extractWorkspaceId(pin.url);
  return <SortableTab id={pin.id}>{(dragHandle) => <div className="group flex w-full min-w-0 items-center rounded-md pr-0.5 text-left"><TabRow displayId={pin.display_id} name={pin.label} icon={pin.icon ? <IconBadge iconKey={pin.icon} colorKey={pin.color || "muted"} size="sm" /> : wsId ? <WorkspaceIcon workspaceId={wsId} /> : <Box className="h-3.5 w-3.5" />} dragHandle={dragHandle} dragHandleColor={pin.icon ? resolveColorForeground(pin.color || "muted") : undefined} active={current?.url === pin.url} ariaLabel={`Open workspace: ${pin.display_id}`} onClick={() => handleRowClick(pin.url)} trailing={<IconButton className="grid h-7 w-7 shrink-0 place-items-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100" title="Unpin this workspace" aria-label={`Unpin workspace: ${pin.display_id}`} onClick={() => void unpin(pin.id)}><PinOff className="h-3.5 w-3.5" /></IconButton>} /></div>}</SortableTab>;
}

function FolderRow({ folder, tabCount, editing, setEditing, setDeleting, onToggle, children, onSubmitRename }: { folder: TabFolder; tabCount: number; editing: { id: number | null; value: string }; setEditing: (value: { id: number | null; value: string }) => void; deleting: TabFolder | null; setDeleting: (folder: TabFolder | null) => void; onToggle: () => void; children: ReactNode; onSubmitRename: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: `folder:${folder.id}` });
  const isEditing = editing.id === folder.id;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div
        className="group flex min-w-0 items-center gap-1 rounded-md"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-folder-menu]")) return;
          onToggle();
        }}
      >
        <span
          className="grid h-6 w-6 shrink-0 place-items-center text-muted-foreground group-hover:hidden"
          aria-hidden="true"
        >
          <Folder className="h-3.5 w-3.5" />
        </span>
        <span
          ref={setActivatorNodeRef}
          className="hidden h-6 w-6 shrink-0 cursor-grab place-items-center text-muted-foreground group-hover:grid"
          title="Reorder folder"
          aria-label="Reorder folder"
          onClick={(event) => event.stopPropagation()}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <InlineInput value={editing.value} onChange={(value) => setEditing({ id: folder.id, value })} onSubmit={onSubmitRename} onCancel={() => setEditing({ id: null, value: "" })} placeholder="Folder name" />
          ) : (
            <Button type="button" variant="ghost" className="h-7 w-full min-w-0 justify-start truncate px-1 py-0 text-left" onClick={onToggle}>
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{tabCount}</span>
            </Button>
          )}
        </div>
        <span data-folder-menu>
          <Menu trigger={<IconButton aria-label={`Folder actions: ${folder.name}`} size="sm"><MoreHorizontal size={15} /></IconButton>} items={[{ id: "rename", label: "Rename", icon: Pencil, onSelect: () => setEditing({ id: folder.id, value: folder.name }) }, { id: "delete", label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleting(folder) }]} />
        </span>
      </div>
      {children}
    </div>
  );
}

export default PinnedWorkspacesSidebar;
