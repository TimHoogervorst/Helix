/**
 * Tests for useBlockActionLogging — accumulates block lifecycle events
 * and flushes batched block-declared actions on entry save.
 *
 * Covers acceptance criteria from #223:
 * - Lifecycle events are accumulated per (blockInstanceId, verb)
 * - Dedup: multiple edits to the same block → one action row
 * - Different verbs for same block both survive
 * - Batched flush on "eln.entry.saved" event
 * - No API call without a save event (no orphaned actions)
 * - No API call when accumulator is empty
 * - No API call when entryId is undefined (new entry)
 * - Map is cleared after successful flush
 * - Fail-open: POST failure is caught, does not throw
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createTestBus } from "../../../core/workspace/WorkspaceBus";
import type { WorkspaceBus } from "../../../core/workspace/WorkspaceBus";
import { useBlockActionLogging } from "../hooks/useBlockActionLogging";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockPost = vi.fn();

vi.mock("../../../core/api/client", () => ({
  post: (...args: unknown[]) => mockPost(...args),
}));

// ── Constants ──────────────────────────────────────────────────────────────

const BLOCK_IDS = ["eln.table-block", "eln.comment-block"];

// ── Helpers ────────────────────────────────────────────────────────────────

interface LifecyclePayload {
  blockId: string;
  slotId: string;
  blockInstanceId: string;
  attrs?: Record<string, unknown>;
  changedAttrs?: Record<string, unknown>;
}

/** Emit a block lifecycle event on the bus. */
function emitLifecycle(
  bus: WorkspaceBus,
  blockId: string,
  verb: "created" | "edited" | "deleted",
  blockInstanceId: string,
  attrs?: Record<string, unknown>,
): void {
  const event = `${blockId}.${verb}`;
  const payload: LifecyclePayload = {
    blockId,
    slotId: "eln.editor",
    blockInstanceId,
  };
  if (verb === "created") {
    payload.attrs = attrs ?? {};
  } else if (verb === "edited") {
    payload.changedAttrs = attrs ?? {};
  }
  bus.emit(event, payload);
}

/** Emit the save event on the bus. */
function emitSave(bus: WorkspaceBus, entryId: string): void {
  bus.emit("eln.entry.saved", { entryId });
}

/**
 * Render the hook and return the bus so tests can drive it.
 * Returns a `flush` helper that emits a save and returns the mockPost
 * promise resolution (or rejection).
 */
function renderWithBus(entryId: string | undefined) {
  const bus = createTestBus();
  const { unmount } = renderHook(() =>
    useBlockActionLogging(bus, entryId, BLOCK_IDS),
  );
  return { bus, unmount };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("useBlockActionLogging", () => {
  beforeEach(() => {
    mockPost.mockClear();
    // Default: resolve successfully
    mockPost.mockResolvedValue({ count: 1, request_id: "test-req-id" });
  });

  afterEach(() => {
    mockPost.mockReset();
  });

  // ── Accumulation ───────────────────────────────────────────────────────

  it("accumulates lifecycle events and flushes them on save", async () => {
    const { bus } = renderWithBus("E-001");

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.comment-block", "created", "inst-2");

    emitSave(bus, "E-001");

    // Wait for the async flush to complete
    await vi.waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    const [path, body] = mockPost.mock.calls[0];
    expect(path).toBe("/eln/entries/E-001/actions/batch/");
    expect(body.actions).toHaveLength(2);
    expect(body.actions).toContainEqual({
      action_type: "eln.table-block.created",
      metadata: {},
    });
    expect(body.actions).toContainEqual({
      action_type: "eln.comment-block.created",
      metadata: {},
    });
  });

  // ── Dedup: same (blockInstanceId, verb) ────────────────────────────────

  it("deduplicates multiple edits to the same block instance", async () => {
    const { bus } = renderWithBus("E-001");

    // Two edits to the same block instance — only the last one survives
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1", { title: "v1" });
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1", { title: "v2" });

    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    const [, body] = mockPost.mock.calls[0];
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0]).toEqual({
      action_type: "eln.table-block.edited",
      metadata: {},
    });
  });

  // ── Different verbs for the same blockInstanceId both survive ───────────

  it("preserves both created and edited for the same block instance", async () => {
    const { bus } = renderWithBus("E-001");

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1");

    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    const [, body] = mockPost.mock.calls[0];
    expect(body.actions).toHaveLength(2);
    expect(body.actions).toContainEqual({
      action_type: "eln.table-block.created",
      metadata: {},
    });
    expect(body.actions).toContainEqual({
      action_type: "eln.table-block.edited",
      metadata: {},
    });
  });

  // ── No orphaned actions: no save → no API call ────────────────────────

  it("does not call the API when no save event fires", () => {
    const { bus } = renderWithBus("E-001");

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1");

    // No save event emitted — API should not be called
    expect(mockPost).not.toHaveBeenCalled();
  });

  // ── No-op on empty accumulator ─────────────────────────────────────────

  it("does not call the API when the accumulator is empty on save", () => {
    const { bus } = renderWithBus("E-001");

    emitSave(bus, "E-001");

    // No lifecycle events were emitted — should be a no-op
    expect(mockPost).not.toHaveBeenCalled();
  });

  // ── No-op on missing entryId ──────────────────────────────────────────

  it("does not call the API when entryId is undefined (new entry)", () => {
    const { bus } = renderWithBus(undefined);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitSave(bus, ""); // Save with no real ID

    expect(mockPost).not.toHaveBeenCalled();
  });

  // ── Clear after flush ─────────────────────────────────────────────────

  it("clears accumulated actions after flush so they are not sent twice", async () => {
    const { bus } = renderWithBus("E-001");

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    // Second save without new lifecycle events — should be a no-op
    emitSave(bus, "E-001");

    // No additional call — the map was cleared
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  // ── New events after flush are accumulated for the next save cycle ────

  it("accumulates new events after flush for the next save cycle", async () => {
    const { bus } = renderWithBus("E-001");

    // First cycle
    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    // Second cycle — new event after flush
    emitLifecycle(bus, "eln.comment-block", "created", "inst-2");
    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(2);
    });

    const [, body] = mockPost.mock.calls[1];
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0]).toEqual({
      action_type: "eln.comment-block.created",
      metadata: {},
    });
  });

  // ── Fail-open: POST failure is caught ──────────────────────────────────

  it("handles API failure gracefully (fail-open)", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    mockPost.mockRejectedValueOnce(new Error("Network down"));

    const { bus } = renderWithBus("E-001");

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitSave(bus, "E-001");

    // Should not throw — the hook swallows errors
    await vi.waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    // Should log a warning
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[eln] Failed to flush block action log for entry E-001:",
      expect.any(Error),
    );

    consoleWarnSpy.mockRestore();
  });

  // ── Multiple block types ──────────────────────────────────────────────

  it("handles events from multiple block types in one batch", async () => {
    const { bus } = renderWithBus("E-001");

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.comment-block", "created", "inst-2");
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1");
    emitLifecycle(bus, "eln.comment-block", "deleted", "inst-3");

    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    const [, body] = mockPost.mock.calls[0];
    expect(body.actions).toHaveLength(4);
  });

  // ── Unmount discards accumulated actions ───────────────────────────────

  it("discards accumulated actions on unmount without calling the API", () => {
    const { bus, unmount } = renderWithBus("E-001");

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");

    unmount();

    // After unmount, even if save fires, the listener is gone
    emitSave(bus, "E-001");
    expect(mockPost).not.toHaveBeenCalled();
  });
});
