/**
 * Unit tests for groupConfirmedActions — pure utility for grouping consecutive
 * confirmed DisplayActionItems by shared requestId.
 */
import { describe, it, expect } from "vitest";
import { groupConfirmedActions, isGroup } from "../groupActions";
import type { DisplayActionItem } from "../types/actions";

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
    action: "eln.entry.edited",
    actionType: "edited",
    targetType: "eln.entry",
    targetId: 42,
    metadata: {},
    createdAt: "2026-07-16T12:00:00Z",
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe("groupConfirmedActions", () => {
  // ── Empty / trivial ──────────────────────────────────────────────────────

  it("returns an empty array for empty input", () => {
    expect(groupConfirmedActions([])).toEqual([]);
  });

  it("passes through a single confirmed item with no requestId", () => {
    const item = makeItem({ requestId: undefined });
    const result = groupConfirmedActions([item]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(item);
  });

  it("passes through a single pending item", () => {
    const item = makePendingItem();
    const result = groupConfirmedActions([item]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(item);
  });

  // ── Singleton pass-through (1 child, no group wrapper) ───────────────────

  it("passes through a single confirmed item with a requestId as flat", () => {
    const item = makeItem({ requestId: "req-1" });
    const result = groupConfirmedActions([item]);
    expect(result).toHaveLength(1);
    // Must be the flat item, not a group wrapper
    expect(isGroup(result[0])).toBe(false);
    expect(result[0]).toBe(item);
  });

  // ── Pair grouping (2 children → "A and B") ──────────────────────────────

  it("groups two consecutive confirmed items with the same requestId", () => {
    const a = makeItem({
      id: 1,
      requestId: "req-1",
      metadata: { message: "Edited a LimsTable" },
    });
    const b = makeItem({
      id: 2,
      requestId: "req-1",
      metadata: { message: "Edited a Protocol" },
      createdAt: "2026-07-16T12:01:00Z",
    });
    const result = groupConfirmedActions([a, b]);

    expect(result).toHaveLength(1);
    const group = result[0];
    expect(isGroup(group)).toBe(true);
    if (isGroup(group)) {
      expect(group.id).toBe("group-req-1");
      expect(group.summary).toBe("Edited a LimsTable and Edited a Protocol");
      expect(group.children).toEqual([a, b]);
      expect(group.createdAt).toBe(b.createdAt);
      expect(group.performedBy).toEqual(b.performedBy);
      expect(group.state).toBe("confirmed");
    }
  });

  it("joins pair messages with humanized action types when metadata.message is absent", () => {
    const a = makeItem({
      id: 1,
      requestId: "req-2",
      action: "eln.entry.created",
      actionType: "created",
      metadata: {},
    });
    const b = makeItem({
      id: 2,
      requestId: "req-2",
      action: "eln.table.edited",
      actionType: "edited",
      metadata: {},
      createdAt: "2026-07-16T12:01:00Z",
    });
    const result = groupConfirmedActions([a, b]);

    expect(result).toHaveLength(1);
    const group = result[0];
    expect(isGroup(group)).toBe(true);
    if (isGroup(group)) {
      expect(group.summary).toBe("Created and Edited");
    }
  });

  // ── 3+ grouping → "Made several changes" ────────────────────────────────

  it("groups three consecutive confirmed items with the same requestId", () => {
    const items = [
      makeItem({ id: 1, requestId: "req-3" }),
      makeItem({ id: 2, requestId: "req-3", createdAt: "2026-07-16T12:01:00Z" }),
      makeItem({ id: 3, requestId: "req-3", createdAt: "2026-07-16T12:02:00Z" }),
    ];
    const result = groupConfirmedActions(items);

    expect(result).toHaveLength(1);
    const group = result[0];
    expect(isGroup(group)).toBe(true);
    if (isGroup(group)) {
      expect(group.summary).toBe("Made several changes");
      expect(group.children).toHaveLength(3);
      expect(group.createdAt).toBe("2026-07-16T12:02:00Z");
    }
  });

  it("groups 4+ consecutive items under 'Made several changes'", () => {
    const items = [1, 2, 3, 4].map((id) =>
      makeItem({
        id,
        requestId: "req-4",
        createdAt: `2026-07-16T12:0${id - 1}:00Z`,
      }),
    );
    const result = groupConfirmedActions(items);

    expect(result).toHaveLength(1);
    const group = result[0];
    expect(isGroup(group)).toBe(true);
    if (isGroup(group)) {
      expect(group.summary).toBe("Made several changes");
      expect(group.children).toHaveLength(4);
    }
  });

  // ── Pending items pass through ungrouped ────────────────────────────────

  it("does not group pending items — they pass through ungrouped", () => {
    const pending = makePendingItem({ id: -1 });
    const confirmed = makeItem({ id: 1, requestId: "req-5" });
    // Pending items don't carry a requestId by construction, but even if they
    // did, the function checks state === "confirmed" first.
    const result = groupConfirmedActions([pending, confirmed]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(pending);
    expect(result[1]).toBe(confirmed);
  });

  it("does not group a pending item even if it had a requestId", () => {
    const pending = makeItem({
      id: -1,
      state: "pending" as const,
      requestId: "req-6",
    });
    const confirmed = makeItem({ id: 1, requestId: "req-6" });
    const result = groupConfirmedActions([pending, confirmed]);

    // Pending is not grouped — it passes through as flat
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(pending);
    expect(result[1]).toBe(confirmed);
  });

  // ── Consecutive-only grouping ─────────────────────────────────────────────

  it("does not group items with the same requestId separated by an unrelated item", () => {
    const a = makeItem({ id: 1, requestId: "req-7" });
    const unrelated = makeItem({ id: 2, requestId: "req-other" });
    const b = makeItem({ id: 3, requestId: "req-7" });

    const result = groupConfirmedActions([a, unrelated, b]);

    expect(result).toHaveLength(3);
    // All three pass through as flat items
    expect(isGroup(result[0])).toBe(false);
    expect(isGroup(result[1])).toBe(false);
    expect(isGroup(result[2])).toBe(false);
  });

  it("groups only the consecutive run when the same requestId appears in separated batches", () => {
    const batch1_a = makeItem({ id: 1, requestId: "req-8" });
    const batch1_b = makeItem({
      id: 2,
      requestId: "req-8",
      createdAt: "2026-07-16T12:01:00Z",
    });
    const unrelated = makeItem({ id: 3, requestId: "req-other" });
    const batch2_a = makeItem({
      id: 4,
      requestId: "req-8",
      createdAt: "2026-07-16T12:02:00Z",
    });

    const result = groupConfirmedActions([
      batch1_a,
      batch1_b,
      unrelated,
      batch2_a,
    ]);

    expect(result).toHaveLength(3);
    // First two form a group
    expect(isGroup(result[0])).toBe(true);
    if (isGroup(result[0])) {
      expect(result[0].children).toEqual([batch1_a, batch1_b]);
    }
    // Middle item is flat
    expect(isGroup(result[1])).toBe(false);
    expect(result[1]).toBe(unrelated);
    // Last single is flat (singleton pass-through)
    expect(isGroup(result[2])).toBe(false);
    expect(result[2]).toBe(batch2_a);
  });

  // ── Mixed scenarios ──────────────────────────────────────────────────────

  it("handles a mix of singletons, pairs, triples, and pending items", () => {
    const items: DisplayActionItem[] = [
      // A pair at the top
      makeItem({
        id: 1,
        requestId: "req-a",
        metadata: { message: "Edited a LimsTable" },
      }),
      makeItem({
        id: 2,
        requestId: "req-a",
        metadata: { message: "Edited a Protocol" },
        createdAt: "2026-07-16T12:01:00Z",
      }),
      // A pending item
      makePendingItem({ id: -1 }),
      // A singleton
      makeItem({
        id: 3,
        requestId: "req-b",
        metadata: { message: "Created an entry" },
        createdAt: "2026-07-16T12:02:00Z",
      }),
      // A triple
      makeItem({ id: 4, requestId: "req-c", createdAt: "2026-07-16T12:03:00Z" }),
      makeItem({ id: 5, requestId: "req-c", createdAt: "2026-07-16T12:04:00Z" }),
      makeItem({ id: 6, requestId: "req-c", createdAt: "2026-07-16T12:05:00Z" }),
      // Another pending
      makePendingItem({ id: -2 }),
    ];

    const result = groupConfirmedActions(items);

    expect(result).toHaveLength(5);

    // [0] — group (pair)
    expect(isGroup(result[0])).toBe(true);
    if (isGroup(result[0])) {
      expect(result[0].summary).toBe(
        "Edited a LimsTable and Edited a Protocol",
      );
      expect(result[0].children).toHaveLength(2);
    }

    // [1] — pending
    expect(isGroup(result[1])).toBe(false);
    expect((result[1] as DisplayActionItem).state).toBe("pending");

    // [2] — singleton (flat)
    expect(isGroup(result[2])).toBe(false);
    expect((result[2] as DisplayActionItem).id).toBe(3);

    // [3] — group (triple)
    expect(isGroup(result[3])).toBe(true);
    if (isGroup(result[3])) {
      expect(result[3].summary).toBe("Made several changes");
      expect(result[3].children).toHaveLength(3);
    }

    // [4] — pending
    expect(isGroup(result[4])).toBe(false);
    expect((result[4] as DisplayActionItem).state).toBe("pending");
  });

  it("handles all singletons — no grouping at all", () => {
    const items = [
      makeItem({ id: 1, requestId: "req-1" }),
      makeItem({ id: 2, requestId: "req-2" }),
      makeItem({ id: 3, requestId: "req-3" }),
    ];
    const result = groupConfirmedActions(items);

    expect(result).toHaveLength(3);
    result.forEach((item) => {
      expect(isGroup(item)).toBe(false);
    });
  });

  // ── Items without requestId pass through ─────────────────────────────────

  it("passes through confirmed items without a requestId as flat", () => {
    const a = makeItem({ id: 1, requestId: undefined });
    const b = makeItem({ id: 2, requestId: undefined });
    const result = groupConfirmedActions([a, b]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
  });
});
