import type { PinnedWorkspace } from "./types";

/** Return a new tab list with one item moved to the position of another. */
export function reorderRootTabs(
  tabs: PinnedWorkspace[],
  activeId: number,
  overId: number,
): PinnedWorkspace[] {
  const oldIndex = tabs.findIndex((tab) => tab.id === activeId);
  const newIndex = tabs.findIndex((tab) => tab.id === overId);

  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return tabs;

  const next = [...tabs];
  const [moved] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, moved);
  return next;
}

export type LayoutItem =
  | { kind: "tab"; id: number; folder: number | null }
  | { kind: "folder"; id: number };

export type LayoutDropTarget =
  | { kind: "top"; position: "before" | "after"; item: LayoutItem }
  | { kind: "top-edge"; position: "before" | "after" }
  | { kind: "folder"; id: number }
  | { kind: "tab"; id: number };

function topLevelIndex(items: LayoutItem[], target: LayoutItem): number {
  return items.findIndex((item) => item.kind === target.kind && item.id === target.id && (item.kind === "folder" || item.folder === null));
}

/** Move a tab or a folder (including its tabs) to a valid layout position. */
export function moveLayoutItem(
  items: LayoutItem[],
  activeId: number,
  target: LayoutDropTarget,
): LayoutItem[] {
  const activeIndex = items.findIndex((item) => item.id === activeId);
  if (activeIndex < 0) return items;
  const active = items[activeIndex];
  const movingFolder = active.kind === "folder";
  if (movingFolder && target.kind !== "top" && target.kind !== "top-edge") return items;

  const moving = movingFolder
    ? items.filter((item) => item.kind === "folder" && item.id === activeId || item.kind === "tab" && item.folder === activeId)
    : [active];
  const remaining = items.filter((item) => !moving.includes(item));

  if (!movingFolder && target.kind === "folder") {
    const folderIndex = remaining.findIndex((item) => item.kind === "folder" && item.id === target.id);
    if (folderIndex < 0) return items;
    const tab = { ...active, folder: target.id } as LayoutItem;
    const childEnd = remaining.reduce((index, item, indexInList) =>
      item.kind === "tab" && item.folder === target.id ? indexInList + 1 : index, folderIndex + 1);
    remaining.splice(childEnd, 0, tab);
    return remaining;
  }

  if (!movingFolder && target.kind === "tab") {
    const targetIndex = remaining.findIndex((item) => item.kind === "tab" && item.id === target.id);
    if (targetIndex < 0) return items;
    const over = remaining[targetIndex];
    if (over.kind !== "tab") return items;
    remaining.splice(targetIndex, 0, { ...active, folder: over.folder });
    return remaining;
  }

  if (target.kind !== "top" && target.kind !== "top-edge") return items;

  const targetIndex = target.kind === "top-edge"
    ? (target.position === "before" ? 0 : remaining.length)
    : topLevelIndex(remaining, target.item) + (target.position === "after" ? 1 : 0);
  if (targetIndex < 0) return items;
  const moved = moving.map((item) => movingFolder ? item : { ...item, folder: null });
  const insertionIndex = targetIndex > remaining.length ? remaining.length : targetIndex;
  remaining.splice(insertionIndex, 0, ...moved);
  return remaining;
}

/** Move a tab to another tab position or into a folder without allowing nesting. */
export function moveTab(
  items: LayoutItem[],
  activeId: number,
  overId: number | "root" | `folder:${number}`,
): LayoutItem[] {
  if (overId === "root") {
    return moveLayoutItem(items, activeId, { kind: "top-edge", position: "after" });
  }
  if (typeof overId === "string") {
    const folderId = Number(overId.slice("folder:".length));
    if (!Number.isInteger(folderId)) return items;
    return moveLayoutItem(items, activeId, { kind: "folder", id: folderId });
  }
  return moveLayoutItem(items, activeId, { kind: "tab", id: overId });
}

/** A folder drop target must never become a child of another folder. */
export function rejectFolderNesting(items: LayoutItem[], activeId: number, overId: number): LayoutItem[] {
  const active = items.find((item) => item.kind === "folder" && item.id === activeId);
  const over = items.find((item) => item.kind === "folder" && item.id === overId);
  return active && over ? items : items;
}

/** Folder ids can only be reordered at the root; a folder target is never valid. */
export function reorderFolders(
  folders: number[],
  activeId: number,
  overId: number | `folder:${number}`,
): number[] {
  if (typeof overId === "string") return folders;
  const oldIndex = folders.indexOf(activeId);
  const newIndex = folders.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return folders;
  const next = [...folders];
  const [moved] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, moved);
  return next;
}
