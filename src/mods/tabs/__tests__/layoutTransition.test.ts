import { describe, expect, it } from "vitest";
import { moveLayoutItem, moveTab, rejectFolderNesting, reorderFolders, reorderRootTabs } from "../layoutTransition";
import type { PinnedWorkspace } from "../types";

function tab(id: number): PinnedWorkspace {
  return {
    id,
    display_id: `TAB${id}`,
    label: `Tab ${id}`,
    url: `/lims/TAB${id}`,
    icon: "",
    color: "",
    created_at: "2025-01-01T00:00:00Z",
  };
}

describe("reorderRootTabs", () => {
  it.each([
    [1, 2, [2, 1, 3]],
    [2, 1, [2, 1, 3]],
    [1, 3, [2, 3, 1]],
    [3, 1, [3, 1, 2]],
  ])("moves tab %i over tab %i", (activeId, overId, expected) => {
    const tabs = [tab(1), tab(2), tab(3)];

    expect(reorderRootTabs(tabs, activeId, overId).map(({ id }) => id)).toEqual(expected);
    expect(tabs.map(({ id }) => id)).toEqual([1, 2, 3]);
  });

  it("returns the original list for an unknown or unchanged move", () => {
    const tabs = [tab(1), tab(2)];

    expect(reorderRootTabs(tabs, 1, 1)).toBe(tabs);
    expect(reorderRootTabs(tabs, 1, 99)).toBe(tabs);
  });
});

describe("folder layout transitions", () => {
  it("moves a folder and all of its children as one subtree", () => {
    const items = [
      { kind: "folder" as const, id: 10 },
      { kind: "tab" as const, id: 1, folder: 10 },
      { kind: "tab" as const, id: 2, folder: null },
      { kind: "folder" as const, id: 20 },
      { kind: "tab" as const, id: 3, folder: 20 },
    ];

    expect(moveLayoutItem(items, 10, { kind: "top", position: "after", item: { kind: "tab", id: 2, folder: null } })).toEqual([
      { kind: "tab", id: 2, folder: null },
      { kind: "folder", id: 10 },
      { kind: "tab", id: 1, folder: 10 },
      { kind: "folder", id: 20 },
      { kind: "tab", id: 3, folder: 20 },
    ]);
  });

  it("moves a root tab before and after top-level items", () => {
    const items = [
      { kind: "folder" as const, id: 10 },
      { kind: "tab" as const, id: 1, folder: null },
      { kind: "tab" as const, id: 2, folder: null },
    ];

    expect(moveLayoutItem(items, 2, { kind: "top-edge", position: "before" }).map((item) => item.id)).toEqual([2, 10, 1]);
    expect(moveLayoutItem(items, 1, { kind: "top", position: "after", item: { kind: "folder", id: 10 } }).map((item) => item.id)).toEqual([10, 1, 2]);
  });

  it("moves a root tab into a folder", () => {
    const items = [
      { kind: "folder" as const, id: 10 },
      { kind: "tab" as const, id: 1, folder: null },
    ];

    expect(moveTab(items, 1, "folder:10")).toEqual([
      { kind: "folder", id: 10 },
      { kind: "tab", id: 1, folder: 10 },
    ]);
  });

  it("moves a tab between folders using the target tab", () => {
    const items = [
      { kind: "folder" as const, id: 10 },
      { kind: "tab" as const, id: 1, folder: 10 },
      { kind: "folder" as const, id: 20 },
      { kind: "tab" as const, id: 2, folder: 20 },
    ];

    expect(moveTab(items, 1, 2)).toEqual([
      { kind: "folder", id: 10 },
      { kind: "folder", id: 20 },
      { kind: "tab", id: 1, folder: 20 },
      { kind: "tab", id: 2, folder: 20 },
    ]);
  });

  it("reorders folders only at the root", () => {
    expect(reorderFolders([10, 20], 20, 10)).toEqual([20, 10]);
    expect(reorderFolders([10, 20], 20, "folder:10")).toEqual([10, 20]);
  });

  it("rejects dropping a folder onto another folder", () => {
    const items = [{ kind: "folder" as const, id: 10 }, { kind: "folder" as const, id: 20 }];
    expect(rejectFolderNesting(items, 10, 20)).toBe(items);
  });

  it("moves a folder tab back to the root", () => {
    const items = [{ kind: "tab" as const, id: 1, folder: 10 }];
    expect(moveTab(items, 1, "root")).toEqual([{ kind: "tab", id: 1, folder: null }]);
  });
});
