/**
 * Unit tests for ActivityFeedBlock — helpers and onEvent handlers.
 *
 * Verifies:
 * - mapElnAction mapping from ElnAction → DisplayActionItem
 * - activityFeedOnEvent handlers store payloads in instance attrs
 */
import { describe, it, expect, vi } from "vitest";
import { mapElnAction, activityFeedOnEvent } from "../components/ActivityFeedBlock";
import type { BusActionPayload } from "../components/ActivityFeedBlock";
import type { ElnAction } from "../types";
import type { DisplayActionItem } from "../../../shell/src/shared/types/actions";
import type { BlockInstance } from "../../../shell/src/mod-system/types";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeActionUser(overrides: Partial<ElnAction["performed_by"]> = {}) {
  return {
    id: 1,
    username: "mirak",
    first_name: "Mira",
    last_name: "Keller",
    color: "#d9b3e6",
    ...overrides,
  };
}

function makeElnAction(overrides: Partial<ElnAction> = {}): ElnAction {
  return {
    id: 1,
    action: "eln.entry.edited",
    action_type: "edited",
    target_type: "eln.entry",
    target_id: 42,
    metadata: {},
    created_at: "2026-07-16T12:00:00Z",
    performed_by: makeActionUser(),
    ...overrides,
  };
}

/** Create a minimal BlockInstance stub for testing onEvent handlers. */
function makeInstance(
  attrs: Record<string, unknown> = {},
): BlockInstance {
  const updateAttrs = vi.fn(
    (newAttrs: Record<string, unknown>) => {
      // Merge semantics: simulate the real useBlockInstance updateAttrs
      Object.assign(attrs, newAttrs);
    },
  );
  return {
    id: "test-instance",
    blockId: "eln.activity-feed",
    slotId: "eln.sidebar",
    attrs,
    updateAttrs,
  };
}

function makeBusPayload(
  overrides: Partial<BusActionPayload> = {},
): BusActionPayload {
  return {
    action: "eln.table-block.created",
    actionType: "created",
    label: "Table Created",
    performedBy: { id: "u1", name: "Test User" },
    createdAt: "2026-07-30T10:00:00Z",
    targetId: 42,
    targetType: "eln.entry",
    metadata: { message: "Table Created" },
    requestId: "req-123",
    ...overrides,
  };
}

// ── mapElnAction (existing) ──────────────────────────────────────────────

describe("mapElnAction", () => {
  it("maps request_id to requestId when present", () => {
    const action = makeElnAction({ request_id: "550e8400-e29b-41d4-a716-446655440000" });
    const result = mapElnAction(action);
    expect(result.requestId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("maps request_id to undefined when absent", () => {
    const action = makeElnAction({ request_id: undefined });
    const result = mapElnAction(action);
    expect(result.requestId).toBeUndefined();
  });

  it("coerces null request_id to undefined", () => {
    const action = makeElnAction({ request_id: null as unknown as string | undefined });
    const result = mapElnAction(action);
    expect(result.requestId).toBeUndefined();
  });

  it("returns a confirmed DisplayActionItem with all fields mapped", () => {
    const action = makeElnAction({ request_id: "abc-123" });
    const result: DisplayActionItem = mapElnAction(action);

    expect(result.id).toBe(1);
    expect(result.action).toBe("eln.entry.edited");
    expect(result.actionType).toBe("edited");
    expect(result.targetType).toBe("eln.entry");
    expect(result.targetId).toBe(42);
    expect(result.requestId).toBe("abc-123");
    expect(result.metadata).toEqual({});
    expect(result.createdAt).toBe("2026-07-16T12:00:00Z");
    expect(result.state).toBe("confirmed");
    expect(result.performedBy.firstName).toBe("Mira");
  });
});

// ── activityFeedOnEvent handlers ─────────────────────────────────────────

describe("activityFeedOnEvent", () => {
  describe("eln.action.performed", () => {
    it("appends a bus action payload to instance attrs", () => {
      const instance = makeInstance({});
      const payload = makeBusPayload();

      activityFeedOnEvent["eln.action.performed"](instance, payload);

      expect(instance.updateAttrs).toHaveBeenCalledTimes(1);
      const arg = (instance.updateAttrs as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(arg.busActionPayloads).toEqual([payload]);
    });

    it("appends to existing busActionPayloads", () => {
      const existing = makeBusPayload({ action: "existing.action" });
      const instance = makeInstance({ busActionPayloads: [existing] });
      const payload = makeBusPayload({ action: "new.action" });

      activityFeedOnEvent["eln.action.performed"](instance, payload);

      const arg = (instance.updateAttrs as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(arg.busActionPayloads).toEqual([existing, payload]);
    });

    it("initializes empty array when busActionPayloads is undefined", () => {
      const instance = makeInstance({ otherKey: "value" });
      const payload = makeBusPayload();

      activityFeedOnEvent["eln.action.performed"](instance, payload);

      const arg = (instance.updateAttrs as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(arg.busActionPayloads).toEqual([payload]);
    });
  });

  describe("eln.entry.saved", () => {
    it("increments refetchTrigger from undefined to 1", () => {
      const instance = makeInstance({});

      activityFeedOnEvent["eln.entry.saved"](instance, undefined);

      const arg = (instance.updateAttrs as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(arg.refetchTrigger).toBe(1);
    });

    it("increments refetchTrigger from 0 to 1", () => {
      const instance = makeInstance({ refetchTrigger: 0 });

      activityFeedOnEvent["eln.entry.saved"](instance, undefined);

      const arg = (instance.updateAttrs as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(arg.refetchTrigger).toBe(1);
    });

    it("increments refetchTrigger from 1 to 2", () => {
      const instance = makeInstance({ refetchTrigger: 1 });

      activityFeedOnEvent["eln.entry.saved"](instance, undefined);

      const arg = (instance.updateAttrs as ReturnType<typeof vi.fn>).mock
        .calls[0][0];
      expect(arg.refetchTrigger).toBe(2);
    });
  });
});
