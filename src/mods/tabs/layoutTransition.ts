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
