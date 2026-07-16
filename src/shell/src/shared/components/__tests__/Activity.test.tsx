/**
 * Integration tests for the Activity component — rendering, grouping, expand/collapse,
 * indented children, pending items, and "Show all" toggle.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Activity } from "../Activity";
import type {
  DisplayActionItem,
  GroupedDisplayItem,
  FeedItem,
} from "../../types/actions";

// ── Test helpers ────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<DisplayActionItem["performedBy"]> = {}) {
  return {
    id: 1,
    username: "mirak",
    firstName: "Mira",
    lastName: "Keller",
    color: "#d9b3e6",
    ...overrides,
  };
}

function makeItem(overrides: Partial<DisplayActionItem> = {}): DisplayActionItem {
  return {
    id: 1,
    performedBy: makeUser(),
    actionType: "eln.entry.edited",
    targetType: "eln.entry",
    targetId: 42,
    metadata: {},
    createdAt: new Date(Date.now() - 60_000).toISOString(), // 1m ago
    state: "confirmed",
    ...overrides,
  };
}

function makePendingItem(
  overrides: Partial<DisplayActionItem> = {},
): DisplayActionItem {
  return makeItem({
    id: -1,
    state: "pending",
    requestId: undefined,
    ...overrides,
  });
}

function makeGroup(overrides: Partial<GroupedDisplayItem> = {}): GroupedDisplayItem {
  const children = overrides.children ?? [
    makeItem({
      id: 1,
      requestId: "req-1",
      metadata: { message: "Edited a LimsTable" },
    }),
    makeItem({
      id: 2,
      requestId: "req-1",
      metadata: { message: "Edited a Protocol" },
      createdAt: new Date(Date.now() - 30_000).toISOString(),
    }),
  ];

  // Use most recent child for timestamp/actor
  const mostRecent = children.reduce((a, b) =>
    new Date(a.createdAt).getTime() > new Date(b.createdAt).getTime() ? a : b,
  );

  return {
    type: "group",
    id: "group-req-1",
    summary: "Edited a LimsTable and Edited a Protocol",
    children,
    createdAt: mostRecent.createdAt,
    performedBy: mostRecent.performedBy,
    state: "confirmed",
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Activity", () => {
  // ── Loading / error / empty states ──────────────────────────────────────

  it("renders skeleton placeholders while loading", () => {
    render(<Activity actions={[]} isLoading />);
    // Skeleton <li> elements with animate-pulse class
    const skeletons = document.querySelectorAll("li.animate-pulse");
    expect(skeletons.length).toBe(4);
  });

  it("renders error message when error is set", () => {
    render(<Activity actions={[]} error="Network error" />);
    expect(screen.getByTestId("activity-error")).toBeInTheDocument();
    expect(screen.getByText("Could not load activity")).toBeInTheDocument();
  });

  it("renders retry button when error and onRetry are set", () => {
    const onRetry = () => {};
    render(<Activity actions={[]} error="fail" onRetry={onRetry} />);
    expect(screen.getByTestId("activity-retry")).toBeInTheDocument();
  });

  it("does not render retry button when onRetry is not set", () => {
    render(<Activity actions={[]} error="fail" />);
    expect(screen.queryByTestId("activity-retry")).not.toBeInTheDocument();
  });

  it("renders empty state when actions is empty", () => {
    render(<Activity actions={[]} />);
    expect(screen.getByTestId("activity-empty")).toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
  });

  // ── Flat singletons (no group wrapper) ───────────────────────────────────

  it("renders a confirmed single item as a flat row with no group wrapper", () => {
    const item = makeItem({
      metadata: { message: "Created an entry" },
    });
    render(<Activity actions={[item]} />);

    const row = screen.getByTestId("activity-item");
    expect(row).toBeInTheDocument();
    expect(row.dataset.state).toBe("confirmed");

    // No group toggle button present
    expect(
      screen.queryByTestId("activity-group-toggle"),
    ).not.toBeInTheDocument();

    // Renders actor name and message
    expect(screen.getByText("Mira Keller")).toBeInTheDocument();
    expect(screen.getByText("Created an entry")).toBeInTheDocument();
  });

  it("renders a pending item with pulse styling", () => {
    const item = makePendingItem({
      metadata: { message: "Editing in progress" },
    });
    render(<Activity actions={[item]} />);

    const row = screen.getByTestId("activity-item");
    expect(row.dataset.state).toBe("pending");
    // Pending rows have opacity-60 and animate-pulse classes
    expect(row.className).toContain("opacity-60");
    expect(row.className).toContain("animate-pulse");
  });

  it("falls back to humanized action type when metadata.message is absent", () => {
    const item = makeItem({
      actionType: "eln.entry.created",
      metadata: {},
    });
    render(<Activity actions={[item]} />);
    expect(screen.getByText("Created")).toBeInTheDocument();
  });

  // ── Grouped items — collapsed by default ────────────────────────────────

  it("renders a group as collapsed by default", () => {
    const group = makeGroup();
    render(<Activity actions={[group]} />);

    const toggle = screen.getByTestId("activity-group-toggle");
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    // Children should not be visible when collapsed
    expect(
      screen.queryByTestId("activity-group-child"),
    ).not.toBeInTheDocument();
  });

  it("shows group summary, actor, and relative time from most recent child", () => {
    const children = [
      makeItem({
        id: 1,
        requestId: "req-1",
        performedBy: makeUser({
          username: "older",
          firstName: "Old",
          lastName: "User",
        }),
        metadata: { message: "First change" },
        createdAt: new Date(Date.now() - 120_000).toISOString(),
      }),
      makeItem({
        id: 2,
        requestId: "req-1",
        performedBy: makeUser({
          username: "newer",
          firstName: "New",
          lastName: "User",
        }),
        metadata: { message: "Second change" },
        createdAt: new Date(Date.now() - 30_000).toISOString(),
      }),
    ];

    const group = makeGroup({ children });
    render(<Activity actions={[group]} />);

    // Uses most recent child's actor (New User, not Old User)
    expect(screen.getByText("New User")).toBeInTheDocument();
    // Shows the pre-computed summary
    expect(
      screen.getByText("Edited a LimsTable and Edited a Protocol"),
    ).toBeInTheDocument();
    // Shows relative time for most recent child (30s ago → "just now")
    expect(screen.getByText(/just now/)).toBeInTheDocument();
  });

  it("shows chevron indicator on the group toggle", () => {
    const group = makeGroup();
    render(<Activity actions={[group]} />);

    const toggle = screen.getByTestId("activity-group-toggle");
    // Collapsed → ▸ (right-pointing)
    expect(toggle.textContent).toContain("▸");
  });

  // ── Grouped items — expand / collapse toggle ────────────────────────────

  it("expands group on click and shows indented children with full action messages", async () => {
    const children = [
      makeItem({
        id: 1,
        requestId: "req-1",
        metadata: { message: "Edited a LimsTable" },
      }),
      makeItem({
        id: 2,
        requestId: "req-1",
        metadata: { message: "Edited a Protocol" },
      }),
    ];
    const group = makeGroup({ children, summary: "Two changes" });
    render(<Activity actions={[group]} />);

    // Click to expand
    const toggle = screen.getByTestId("activity-group-toggle");
    fireEvent.click(toggle);

    // Now expanded
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // Chevron should change to ▾ (down-pointing)
    expect(toggle.textContent).toContain("▾");

    // Children should be visible
    const childRows = screen.getAllByTestId("activity-group-child");
    expect(childRows).toHaveLength(2);

    // Each child shows actor and full action message
    expect(screen.getByText("Edited a LimsTable")).toBeInTheDocument();
    expect(screen.getByText("Edited a Protocol")).toBeInTheDocument();
  });

  it("collapses group on second click", async () => {
    const group = makeGroup();
    render(<Activity actions={[group]} />);

    const toggle = screen.getByTestId("activity-group-toggle");

    // Expand
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByTestId("activity-group-child")).toHaveLength(2);

    // Collapse
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      screen.queryByTestId("activity-group-child"),
    ).not.toBeInTheDocument();
  });

  // ── Indented children ───────────────────────────────────────────────────

  it("renders group children with indented layout (left margin and border)", async () => {
    const group = makeGroup();
    render(<Activity actions={[group]} />);

    // Expand
    fireEvent.click(screen.getByTestId("activity-group-toggle"));

    const childRows = screen.getAllByTestId("activity-group-child");
    // Each child should have indentation classes
    for (const row of childRows) {
      expect(row.className).toContain("ml-4");
      expect(row.className).toContain("border-l");
      expect(row.className).toContain("pl-3");
    }
  });

  // ── Pending items never grouped ─────────────────────────────────────────

  it("renders pending items as individual non-grouped rows with pulse styling", () => {
    const pending1 = makePendingItem({
      id: -1,
      metadata: { message: "Adding a table" },
    });
    const confirmed = makeItem({
      id: 1,
      requestId: "req-1",
      metadata: { message: "Saved change" },
    });
    render(<Activity actions={[pending1, confirmed]} />);

    const rows = screen.getAllByTestId("activity-item");
    expect(rows).toHaveLength(2);

    // First row is pending with pulse
    expect(rows[0].dataset.state).toBe("pending");
    expect(rows[0].className).toContain("animate-pulse");

    // Second row is confirmed, no pulse
    expect(rows[1].dataset.state).toBe("confirmed");
    expect(rows[1].className).not.toContain("animate-pulse");
  });

  it("does not wrap a single pending item in a group toggle", () => {
    const pending = makePendingItem();
    render(<Activity actions={[pending]} />);

    expect(screen.getByTestId("activity-item")).toBeInTheDocument();
    expect(
      screen.queryByTestId("activity-group-toggle"),
    ).not.toBeInTheDocument();
  });

  // ── Mixed feed: groups, singles, pending items ──────────────────────────

  it("renders a mixed feed with groups, flat singletons, and pending items", () => {
    const group = makeGroup();
    const single = makeItem({
      id: 3,
      requestId: "req-2",
      metadata: { message: "Created an entry" },
    });
    const pending = makePendingItem({ id: -1 });
    const actions: FeedItem[] = [group, single, pending];

    render(<Activity actions={actions} />);

    // One group toggle (for the grouped item)
    expect(screen.getByTestId("activity-group-toggle")).toBeInTheDocument();

    // Two flat activity items (single + pending)
    const flatRows = screen.getAllByTestId("activity-item");
    // One is the group wrapper (it also has data-testid="activity-item"),
    // the other two are the single and pending items
    expect(flatRows.length).toBeGreaterThanOrEqual(3);
  });

  // ── "Show all / Show less" toggle ──────────────────────────────────────

  it("shows the first 10 items by default and a 'Show all (N)' toggle", () => {
    const items: FeedItem[] = Array.from({ length: 15 }, (_, i) =>
      makeItem({
        id: i + 1,
        requestId: `req-${i}`,
        metadata: { message: `Action ${i + 1}` },
      }),
    );
    render(<Activity actions={items} />);

    const toggle = screen.getByTestId("activity-show-all");
    expect(toggle).toBeInTheDocument();
    expect(toggle.textContent).toBe("Show all (15)");

    // Only 10 items visible
    const rows = screen.getAllByTestId("activity-item");
    expect(rows).toHaveLength(10);
  });

  it("shows all items when 'Show all' is clicked", async () => {
    const items: FeedItem[] = Array.from({ length: 15 }, (_, i) =>
      makeItem({
        id: i + 1,
        requestId: `req-${i}`,
        metadata: { message: `Action ${i + 1}` },
      }),
    );
    render(<Activity actions={items} />);

    const toggle = screen.getByTestId("activity-show-all");
    fireEvent.click(toggle);

    expect(toggle.textContent).toBe("Show less");
    const rows = screen.getAllByTestId("activity-item");
    expect(rows).toHaveLength(15);
  });

  it('collapses back to 10 items when "Show less" is clicked', async () => {
    const items: FeedItem[] = Array.from({ length: 15 }, (_, i) =>
      makeItem({
        id: i + 1,
        requestId: `req-${i}`,
        metadata: { message: `Action ${i + 1}` },
      }),
    );
    render(<Activity actions={items} />);

    const toggle = screen.getByTestId("activity-show-all");
    fireEvent.click(toggle); // Show all
    fireEvent.click(toggle); // Show less

    expect(toggle.textContent).toBe("Show all (15)");
    const rows = screen.getAllByTestId("activity-item");
    expect(rows).toHaveLength(10);
  });

  it("counts group items in the 'Show all' total", () => {
    // 5 groups + 3 singles = 8 total feed items
    const groups: FeedItem[] = [
      makeGroup({ id: "group-1" }),
      makeGroup({ id: "group-2" }),
      makeGroup({ id: "group-3" }),
      makeGroup({ id: "group-4" }),
      makeGroup({ id: "group-5" }),
      makeItem({ id: 10, requestId: "req-a", metadata: { message: "A" } }),
      makeItem({ id: 11, requestId: "req-b", metadata: { message: "B" } }),
      makeItem({ id: 12, requestId: "req-c", metadata: { message: "C" } }),
    ];
    render(<Activity actions={groups} />);

    // 8 items ≤ 10, so no toggle needed
    expect(
      screen.queryByTestId("activity-show-all"),
    ).not.toBeInTheDocument();
  });

  it("counts group items in the 'Show all' total when there are many", () => {
    // 9 groups + 3 singles = 12 feed items > 10, should see toggle
    const groups: FeedItem[] = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeGroup({ id: `group-${i}` }),
      ),
      makeItem({ id: 100, requestId: "req-a", metadata: { message: "A" } }),
      makeItem({ id: 101, requestId: "req-b", metadata: { message: "B" } }),
      makeItem({ id: 102, requestId: "req-c", metadata: { message: "C" } }),
    ];
    render(<Activity actions={groups} />);

    const toggle = screen.getByTestId("activity-show-all");
    expect(toggle.textContent).toBe("Show all (12)");
  });

  // ── No toggle when 10 or fewer items ────────────────────────────────────

  it("does not show the toggle when there are 10 or fewer items", () => {
    const items: FeedItem[] = Array.from({ length: 10 }, (_, i) =>
      makeItem({
        id: i + 1,
        requestId: `req-${i}`,
        metadata: { message: `Action ${i + 1}` },
      }),
    );
    render(<Activity actions={items} />);

    expect(
      screen.queryByTestId("activity-show-all"),
    ).not.toBeInTheDocument();
  });

  // ── Multiple independent groups ─────────────────────────────────────────

  it("renders multiple independent groups, each with its own toggle", () => {
    const group1 = makeGroup({ id: "group-a", summary: "Two table edits" });
    const group2 = makeGroup({ id: "group-b", summary: "Two protocol edits" });
    render(<Activity actions={[group1, group2]} />);

    const toggles = screen.getAllByTestId("activity-group-toggle");
    expect(toggles).toHaveLength(2);
  });

  it("expanding one group does not affect another", async () => {
    const group1 = makeGroup({ id: "group-a", summary: "Two table edits" });
    const group2 = makeGroup({ id: "group-b", summary: "Two protocol edits" });
    render(<Activity actions={[group1, group2]} />);

    const toggles = screen.getAllByTestId("activity-group-toggle");

    // Expand first group only
    fireEvent.click(toggles[0]);

    expect(toggles[0].getAttribute("aria-expanded")).toBe("true");
    expect(toggles[1].getAttribute("aria-expanded")).toBe("false");
  });

  // ── Group with 3+ children ──────────────────────────────────────────────

  it("renders a group with 3+ children correctly", async () => {
    const children = [
      makeItem({ id: 1, requestId: "req-big" }),
      makeItem({ id: 2, requestId: "req-big" }),
      makeItem({ id: 3, requestId: "req-big" }),
    ];
    const group = makeGroup({
      id: "group-big",
      summary: "Made several changes",
      children,
    });
    render(<Activity actions={[group]} />);

    expect(screen.getByText("Made several changes")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("activity-group-toggle"));
    expect(screen.getAllByTestId("activity-group-child")).toHaveLength(3);
  });
});
