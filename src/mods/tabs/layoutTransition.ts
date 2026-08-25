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

/** Move a tab to another tab position or into a folder without allowing nesting. */
export function moveTab(
  items: LayoutItem[],
  activeId: number,
  overId: number | "root" | `folder:${number}`,
): LayoutItem[] {
  const activeIndex = items.findIndex((item) => item.kind === "tab" && item.id === activeId);
  if (activeIndex < 0) return items;
  const next = [...items];
  const [active] = next.splice(activeIndex, 1);
  if (!active || active.kind !== "tab") return items;

  if (overId === "root") {
    active.folder = null;
    next.push(active);
    return next;
  }
  if (typeof overId === "string") {
    const folderId = Number(overId.slice("folder:".length));
    if (!Number.isInteger(folderId) || !next.some((item) => item.kind === "folder" && item.id === folderId)) return items;
    active.folder = folderId;
    const folderIndex = next.findIndex((item) => item.kind === "folder" && item.id === folderId);
    next.splice(folderIndex + 1, 0, active);
    return next;
  }

  const overIndex = next.findIndex((item) => item.kind === "tab" && item.id === overId);
  if (overIndex < 0) return items;
  const over = next[overIndex];
  if (!over || over.kind !== "tab") return items;
  active.folder = over.folder;
  next.splice(overIndex, 0, active);
  return next;
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
