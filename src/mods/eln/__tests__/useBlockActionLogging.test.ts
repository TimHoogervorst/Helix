/**
 * Tests for useBlockActionLogging — accumulates block lifecycle events
 * and flushes each action individually via sendAction() → POST /api/actions/
 * on entry save (#327).
 *
 * Covers acceptance criteria from #223 (retained) and #327 (new):
 * - Lifecycle events are accumulated per (blockInstanceId, verb)
 * - Dedup: multiple edits to the same block → one action row
 * - Different verbs for same block both survive
 * - Each accumulated action is sent individually via sendAction() on save
 * - sendAction is called with correct (actionType, targetType, targetId, metadata)
 * - No sendAction calls without a save event (no orphaned actions)
 * - No sendAction calls when accumulator is empty
 * - No sendAction calls when numericEntryId is undefined (new entry)
 * - Map is cleared after successful flush
 * - eln.actions.flushed is emitted with flushed keys on success
 * - Partial failure: actions after a failed sendAction are still attempted
 * - eln.actions.flushed is NOT emitted when any sendAction fails
 * - Fail-open: sendAction rejection is caught, does not throw
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createTestBus } from "../../../shell/src/workspace/WorkspaceBus";
import type { WorkspaceBus } from "../../../shell/src/workspace/WorkspaceBus";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { useBlockActionLogging } from "../hooks/useBlockActionLogging";

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
 * Render the hook and return the bus + a mock sendAction so tests can
 * drive and assert.
 */
function renderWithBus(
  entryId: string | undefined,
  numericEntryId: number | undefined,
  mockSendAction?: ReturnType<typeof vi.fn>,
) {
  const bus = createTestBus();
  const sendAction = mockSendAction ?? vi.fn().mockResolvedValue(undefined);
  const { unmount } = renderHook(() =>
    useBlockActionLogging(bus, entryId, numericEntryId, BLOCK_IDS, sendAction),
  );
  return { bus, unmount, sendAction };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("useBlockActionLogging", () => {
  beforeEach(() => {
    // Register stub blocks and hydrate the action catalog so message
    // derivation works via the backend catalog (not static `messages`).
    ModRegistry._reset();
    const registry = ModRegistry.getInstance();
    const stubComponent = () => null;
    registry.registerBlock({
      id: "eln.table-block",
      label: "Table",
      icon: stubComponent,
      component: stubComponent,
      listensTo: [],
      onEvent: {},
      getDisplayName: (attrs: Record<string, unknown>) =>
        (attrs as Record<string, string>).title ?? "Table",
      serialize: () => "{}",
      deserialize: () => ({}),
      defaultState: {},
    });
    registry.registerBlock({
      id: "eln.comment-block",
      label: "Comment",
      icon: stubComponent,
      component: stubComponent,
      listensTo: [],
      onEvent: {},
      getDisplayName: () => "Comment",
      serialize: () => "{}",
      deserialize: () => ({}),
      defaultState: {},
    });

    // Hydrate the action catalog so getActions("eln") returns block-action
    // labels.  The catalog is the single source of truth for action labels.
    registry.hydrateFromBackend(
      {
        eln: {
          workspaceId: "eln",
          schemaTypes: [],
          actions: [
            { id: "eln.table-block.created", label: "Table Created", core: false },
            { id: "eln.table-block.edited", label: "Table Edited", core: false },
            { id: "eln.table-block.deleted", label: "Table Deleted", core: false },
            { id: "eln.comment-block.created", label: "Comment Created", core: false },
            { id: "eln.comment-block.edited", label: "Comment Edited", core: false },
            { id: "eln.comment-block.deleted", label: "Comment Deleted", core: false },
          ],
        },
      },
      new Map(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Accumulation + flush via sendAction ──────────────────────────────────

  it("accumulates lifecycle events and flushes each via sendAction on save", async () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.comment-block", "created", "inst-2");

    emitSave(bus, "E-001");

    // Wait for the async flush to complete
    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(2);
    });

    expect(mockSendAction).toHaveBeenCalledWith(
      "eln.table-block.created",
      "eln.entry",
      42,
      { message: "Table Created" },
    );
    expect(mockSendAction).toHaveBeenCalledWith(
      "eln.comment-block.created",
      "eln.entry",
      42,
      { message: "Comment Created" },
    );
  });

  // ── Dedup: same (blockInstanceId, verb) ────────────────────────────────

  it("deduplicates multiple edits to the same block instance", async () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    // Two edits to the same block instance — only the last one survives
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1", { title: "v1" });
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1", { title: "v2" });

    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(1);
    });

    expect(mockSendAction).toHaveBeenCalledWith(
      "eln.table-block.edited",
      "eln.entry",
      42,
      { message: "Table Edited" },
    );
  });

  // ── Different verbs for the same blockInstanceId both survive ───────────

  it("preserves both created and edited for the same block instance", async () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1");

    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(2);
    });

    const calls = mockSendAction.mock.calls;
    const actionTypes = calls.map((c: unknown[]) => c[0]);
    expect(actionTypes).toContain("eln.table-block.created");
    expect(actionTypes).toContain("eln.table-block.edited");
  });

  // ── No orphaned actions: no save → no sendAction calls ─────────────────

  it("does not call sendAction when no save event fires", () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1");

    // No save event emitted — sendAction should not be called
    expect(mockSendAction).not.toHaveBeenCalled();
  });

  // ── No-op on empty accumulator ─────────────────────────────────────────

  it("does not call sendAction when the accumulator is empty on save", () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    emitSave(bus, "E-001");

    // No lifecycle events were emitted — should be a no-op
    expect(mockSendAction).not.toHaveBeenCalled();
  });

  // ── No-op on missing numericEntryId ────────────────────────────────────

  it("does not call sendAction when numericEntryId is undefined (new entry)", () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus(undefined, undefined, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitSave(bus, "");

    expect(mockSendAction).not.toHaveBeenCalled();
  });

  // ── No-op when entryId is set but numericEntryId is undefined ──────────

  it("does not call sendAction when entryId is set but numericEntryId is undefined", () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", undefined, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitSave(bus, "E-001");

    expect(mockSendAction).not.toHaveBeenCalled();
  });

  // ── Clear after flush ─────────────────────────────────────────────────

  it("clears accumulated actions after flush so they are not sent twice", async () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(1);
    });

    // Second save without new lifecycle events — should be a no-op
    emitSave(bus, "E-001");

    // No additional call — the map was cleared
    expect(mockSendAction).toHaveBeenCalledTimes(1);
  });

  // ── New events after flush are accumulated for the next save cycle ────

  it("accumulates new events after flush for the next save cycle", async () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    // First cycle
    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(1);
    });

    // Second cycle — new event after flush
    emitLifecycle(bus, "eln.comment-block", "created", "inst-2");
    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(2);
    });

    // The second call should be the comment block action
    const lastCall = mockSendAction.mock.calls[1];
    expect(lastCall[0]).toBe("eln.comment-block.created");
  });

  // ── sendAction called with correct targetType and targetId ─────────────

  it("calls sendAction with targetType='eln.entry' and the numeric entry ID", async () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", 99, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "deleted", "inst-1");
    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(1);
    });

    expect(mockSendAction).toHaveBeenCalledWith(
      "eln.table-block.deleted",
      "eln.entry",
      99,
      { message: "Table Deleted" },
    );
  });

  // ── Fail-open: sendAction failure is caught ────────────────────────────

  it("handles sendAction failure gracefully (fail-open)", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const mockSendAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network down"));
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitSave(bus, "E-001");

    // Should not throw — the hook swallows errors
    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(1);
    });

    // Should log a warning
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[eln] Failed to send block action "eln.table-block.created" for entry E-001:',
      expect.any(Error),
    );

    consoleWarnSpy.mockRestore();
  });

  // ── Multiple block types ──────────────────────────────────────────────

  it("handles events from multiple block types in one save cycle", async () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.comment-block", "created", "inst-2");
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1");
    emitLifecycle(bus, "eln.comment-block", "deleted", "inst-3");

    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(4);
    });
  });

  // ── Unmount discards accumulated actions ───────────────────────────────

  it("discards accumulated actions on unmount without calling sendAction", () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus, unmount } = renderWithBus("E-001", 42, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");

    unmount();

    // After unmount, even if save fires, the listener is gone
    emitSave(bus, "E-001");
    expect(mockSendAction).not.toHaveBeenCalled();
  });

  // ── eln.actions.flushed event is emitted on success ───────────────────

  it("emits eln.actions.flushed with flushed keys on successful flush", async () => {
    const mockSendAction = vi.fn().mockResolvedValue(undefined);
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    const flushedKeys: string[] = [];
    bus.on("eln.actions.flushed", (payload: unknown) => {
      const { keys } = payload as { keys: string[] };
      flushedKeys.push(...keys);
    });

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.comment-block", "edited", "inst-2");
    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(2);
    });

    // Should contain both keys
    expect(flushedKeys).toHaveLength(2);
    expect(flushedKeys).toContain("inst-1:created");
    expect(flushedKeys).toContain("inst-2:edited");
  });

  // ── eln.actions.flushed is NOT emitted on partial failure ──────────────

  it("does not emit eln.actions.flushed when any sendAction fails", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const mockSendAction = vi
      .fn()
      .mockResolvedValueOnce(undefined) // first succeeds
      .mockRejectedValueOnce(new Error("Network down")); // second fails
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    let flushedEmitted = false;
    bus.on("eln.actions.flushed", () => {
      flushedEmitted = true;
    });

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.comment-block", "edited", "inst-2");
    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(2);
    });

    // eln.actions.flushed should NOT be emitted because one action failed
    expect(flushedEmitted).toBe(false);

    consoleWarnSpy.mockRestore();
  });

  // ── Partial failure: all actions are still attempted ───────────────────

  it("attempts all actions even when an earlier one fails", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const mockSendAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("First failed"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const { bus } = renderWithBus("E-001", 42, mockSendAction);

    emitLifecycle(bus, "eln.table-block", "created", "inst-1");
    emitLifecycle(bus, "eln.table-block", "edited", "inst-1");
    emitLifecycle(bus, "eln.comment-block", "created", "inst-2");
    emitSave(bus, "E-001");

    await vi.waitFor(() => {
      expect(mockSendAction).toHaveBeenCalledTimes(3);
    });

    consoleWarnSpy.mockRestore();
  });
});
