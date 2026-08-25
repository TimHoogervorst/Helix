import { describe, expect, it } from "vitest";
import { reorderRootTabs } from "../layoutTransition";
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
