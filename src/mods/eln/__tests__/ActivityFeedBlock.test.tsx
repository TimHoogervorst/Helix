/**
 * Unit tests for ActivityFeedBlock helpers — mapElnAction.
 *
 * Verifies the mapping from ElnAction (snake_case API shape)
 * to DisplayActionItem (camelCase shared shape).
 */
import { describe, it, expect } from "vitest";
import { mapElnAction } from "../components/ActivityFeedBlock";
import type { ElnAction } from "../types";
import type { DisplayActionItem } from "../../../shell/src/shared/types/actions";

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

describe("mapElnAction", () => {
  it("maps request_id to requestId when present", () => {
    const action = makeElnAction({ request_id: "550e8400-e29b-41d4-a716-446655440000" });
    const result = mapElnAction(action);
    expect(result.requestId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("maps request_id to undefined when absent", () => {
    // API serializes null for absent request_id — mapper must coerce to undefined.
    const action = makeElnAction({ request_id: undefined });
    const result = mapElnAction(action);
    expect(result.requestId).toBeUndefined();
  });

  it("coerces null request_id to undefined", () => {
    // DRF serializes a null UUIDField as JSON null, not undefined.
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
