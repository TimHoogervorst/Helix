/**
 * Tests for useSaveQueue — in-memory serial save queue with network-error
 * retry and non-network-error rejection.
 *
 * Covers acceptance criteria from #171:
 * - Initial idle state with queueLength 0
 * - Single enqueue drains and resolves
 * - Serial drain order
 * - NetworkError: pause, retain item, retry on next enqueue
 * - ApiError (non-network): reject, remove, continue draining
 * - saveMode passed through as X-Save-Mode header
 * - lastSavedAt updates on success
 * - Fire-and-forget: no unhandled rejections
 * - Queue drains correctly after network-error recovery
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSaveQueue } from "../hooks/useSaveQueue";
import type { EntryDetail } from "../types";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockPut = vi.fn();

// We need the mocked NetworkError to be importable so tests can create
// instances for the hook's instanceof/name check.
vi.mock("../../../core/api/client", () => {
  class NetworkError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NetworkError";
    }
  }
  return {
    put: (...args: unknown[]) => mockPut(...args),
    NetworkError,
  };
});

import { NetworkError } from "../../../core/api/client";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeEntry(overrides?: Partial<EntryDetail>): EntryDetail {
  return {
    id: 1,
    display_id: "E1",
    title: "Test Entry",
    content: { type: "doc", content: [{ type: "paragraph" }] },
    folder: null,
    folder_name: "",
    folder_path: "",
    author: null,
    author_username: null,
    author_info: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    status: "in_progress",
    status_display: "In Progress",
    tags: [],
    mentions: [],
    ...overrides,
  };
}

const ENTRY_ID = "E-TEST";
const SAVE_URL = `/eln/entries/${ENTRY_ID}/`;

// ── Tests ──────────────────────────────────────────────────────────────────

describe("useSaveQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPut.mockReset();
  });

  // ── Initial state ──────────────────────────────────────────────────────

  it("has idle initial state with queueLength 0", () => {
    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.queueLength).toBe(0);
    expect(result.current.lastSavedAt).toBeNull();
  });

  // ── Single enqueue ─────────────────────────────────────────────────────

  it("single enqueue drains and resolves with entry data", async () => {
    const entry = makeEntry();
    mockPut.mockResolvedValue(entry);

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    let resolved: unknown = null;
    await act(async () => {
      resolved = await result.current.enqueue({ title: "Test" });
    });

    expect(resolved).toEqual(entry);
    expect(mockPut).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(
      SAVE_URL,
      { title: "Test" },
      undefined,
      {},
    );
    expect(result.current.status).toBe("saved");
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it("transitions through saving status during drain", async () => {
    // Delay the put so we can observe the "saving" state
    let resolvePut: (value: EntryDetail) => void;
    const putPromise = new Promise<EntryDetail>((resolve) => {
      resolvePut = resolve;
    });
    mockPut.mockReturnValue(putPromise);

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    let enqueuePromise: Promise<unknown>;
    act(() => {
      enqueuePromise = result.current.enqueue({ title: "Test" });
    });

    // Wait for the setTimeout-deferred drain to start
    await waitFor(() => {
      expect(result.current.status).toBe("saving");
    });
    expect(result.current.queueLength).toBe(1);

    // Complete the save
    await act(async () => {
      resolvePut!(makeEntry());
      await enqueuePromise!;
    });

    expect(result.current.status).toBe("saved");
  });

  // ── Serial drain order ─────────────────────────────────────────────────

  it("drains two enqueues serially, second only starts after first", async () => {
    const callOrder: number[] = [];
    let resolveFirst: (value: EntryDetail) => void;
    const firstPromise = new Promise<EntryDetail>((resolve) => {
      resolveFirst = resolve;
    });

    mockPut
      .mockReturnValueOnce(firstPromise)
      .mockImplementationOnce(() => {
        callOrder.push(2);
        return Promise.resolve(makeEntry({ display_id: "E2" }));
      });

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    // Fire two enqueues rapidly
    let promise1: Promise<unknown>;
    let promise2: Promise<unknown>;
    act(() => {
      promise1 = result.current.enqueue({ title: "First" });
      promise2 = result.current.enqueue({ title: "Second" });
    });

    // Wait for the setTimeout-deferred drain to start and pick up first item
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledTimes(1);
    });
    expect(result.current.queueLength).toBe(2);

    // Resolve first — second should then start
    await act(async () => {
      resolveFirst!(makeEntry({ display_id: "E1" }));
      await promise1!;
    });

    // Now second should have been called
    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(callOrder).toContain(2);

    await act(async () => {
      await promise2!;
    });

    expect(result.current.status).toBe("saved");
    expect(result.current.queueLength).toBe(0);
  });

  // ── NetworkError: pause and lazy retry ──────────────────────────────────

  it("pauses drain on NetworkError, retains item, sets status to error", async () => {
    mockPut.mockRejectedValue(new NetworkError("Connection refused"));

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    act(() => {
      // Fire-and-forget — we don't await because the promise won't resolve
      // until the item is retried successfully
      result.current.enqueue({ title: "Test" });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    // Item should still be in the queue (retained at front)
    expect(result.current.queueLength).toBe(1);
  });

  it("retries stalled item on next enqueue (lazy retry)", async () => {
    // First call: network error
    mockPut.mockRejectedValueOnce(new NetworkError("Connection refused"));
    // Second call (retry): success
    const entry = makeEntry();
    mockPut.mockResolvedValueOnce(entry);

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    // First enqueue fails with network error
    let promise1: Promise<unknown>;
    act(() => {
      promise1 = result.current.enqueue({ title: "First" });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.queueLength).toBe(1);

    // Second enqueue triggers retry
    let promise2: Promise<unknown>;
    await act(async () => {
      promise2 = result.current.enqueue({ title: "Second" });
    });

    // Both should resolve now (first retried, second processed after)
    await act(async () => {
      await promise1!;
      await promise2!;
    });

    expect(mockPut).toHaveBeenCalledTimes(3); // first fail, retry success, second item
    expect(result.current.status).toBe("saved");
    expect(result.current.queueLength).toBe(0);
  });

  // ── Non-network error: reject and continue ─────────────────────────────

  it("rejects item on non-network error and continues draining", async () => {
    const apiError = new Error("API error: 422") as Error & { status: number };
    apiError.status = 422;
    mockPut.mockRejectedValueOnce(apiError);

    const entry = makeEntry({ display_id: "E2" });
    mockPut.mockResolvedValueOnce(entry);

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    let error1: unknown = null;
    let resolved2: unknown = null;

    await act(async () => {
      try {
        await result.current.enqueue({ title: "Bad" });
      } catch (e) {
        error1 = e;
      }
      resolved2 = await result.current.enqueue({ title: "Good" });
    });

    expect(error1).toBe(apiError);
    expect(resolved2).toEqual(entry);
    expect(mockPut).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });

  it("continues draining multiple items after a mid-queue rejection", async () => {
    // Three items: success, failure, success
    mockPut
      .mockResolvedValueOnce(makeEntry({ display_id: "E1" }))
      .mockRejectedValueOnce(new Error("Validation error"))
      .mockResolvedValueOnce(makeEntry({ display_id: "E3" }));

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    let errorCaught = false;
    let thirdResolved = false;

    await act(async () => {
      // First: should succeed
      await result.current.enqueue({ title: "Good 1" });

      // Second: should reject
      try {
        await result.current.enqueue({ title: "Bad" });
      } catch {
        errorCaught = true;
      }

      // Third: should succeed (drain continues past the rejected item)
      await result.current.enqueue({ title: "Good 3" });
      thirdResolved = true;
    });

    expect(errorCaught).toBe(true);
    expect(thirdResolved).toBe(true);
    expect(mockPut).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe("saved");
  });

  // ── saveMode pass-through ──────────────────────────────────────────────

  it("passes saveMode through as X-Save-Mode header", async () => {
    mockPut.mockResolvedValue(makeEntry());

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    await act(async () => {
      await result.current.enqueue({ title: "Test" }, "autosave");
    });

    expect(mockPut).toHaveBeenCalledWith(
      SAVE_URL,
      { title: "Test" },
      undefined,
      { "X-Save-Mode": "autosave" },
    );
  });

  it("omits X-Save-Mode header when saveMode is not provided", async () => {
    mockPut.mockResolvedValue(makeEntry());

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    await act(async () => {
      await result.current.enqueue({ title: "Test" });
    });

    expect(mockPut).toHaveBeenCalledWith(
      SAVE_URL,
      { title: "Test" },
      undefined,
      {},
    );
  });

  it("uses 'manual' saveMode header", async () => {
    mockPut.mockResolvedValue(makeEntry());

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    await act(async () => {
      await result.current.enqueue({ title: "Test" }, "manual");
    });

    expect(mockPut).toHaveBeenCalledWith(
      SAVE_URL,
      { title: "Test" },
      undefined,
      { "X-Save-Mode": "manual" },
    );
  });

  // ── lastSavedAt ────────────────────────────────────────────────────────

  it("lastSavedAt updates on successful save", async () => {
    mockPut.mockResolvedValue(makeEntry());

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    expect(result.current.lastSavedAt).toBeNull();

    await act(async () => {
      await result.current.enqueue({ title: "Test" });
    });

    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
  });

  it("lastSavedAt does not update on failed save", async () => {
    mockPut.mockRejectedValue(new NetworkError("Down"));

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    act(() => {
      result.current.enqueue({ title: "Test" });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.lastSavedAt).toBeNull();
  });

  // ── Fire-and-forget ────────────────────────────────────────────────────

  it("fire-and-forget: enqueue without await does not throw unhandled rejection", async () => {
    // Reject with a non-network error — the promise should be handled
    // internally to prevent unhandled rejections.
    mockPut.mockRejectedValue(new Error("API error"));

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    // Fire and forget — no await, no .catch()
    act(() => {
      result.current.enqueue({ title: "Test" });
    });

    // Wait for drain to process (item should be rejected and removed)
    await waitFor(() => {
      expect(result.current.queueLength).toBe(0);
    });

    // If we got here without vitest complaining about unhandled rejections,
    // the test passes.
    expect(result.current.status).toBe("saved");
  });

  // ── Queue drain after network-error recovery ───────────────────────────

  it("drains correctly after network-error recovery with multiple items", async () => {
    const entry = makeEntry();

    // Scenario: item1 fails with network error, then new enqueue triggers retry
    // Both item1 and item2 should succeed on retry
    mockPut
      .mockRejectedValueOnce(new NetworkError("Down"))
      .mockResolvedValueOnce(entry) // item1 retry
      .mockResolvedValueOnce(makeEntry({ display_id: "E2" })); // item2

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    // Enqueue item1 — it fails
    let promise1: Promise<unknown>;
    act(() => {
      promise1 = result.current.enqueue({ title: "Item 1" });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    // Enqueue item2 — triggers retry of item1, then item2
    let promise2: Promise<unknown>;
    await act(async () => {
      promise2 = result.current.enqueue({ title: "Item 2" });
    });

    await act(async () => {
      await promise1!;
      await promise2!;
    });

    expect(mockPut).toHaveBeenCalledTimes(3);
    expect(result.current.status).toBe("saved");
    expect(result.current.queueLength).toBe(0);
  });

  // ── Queue length tracking ──────────────────────────────────────────────

  it("queueLength decreases as items drain successfully", async () => {
    mockPut.mockResolvedValue(makeEntry());

    const { result } = renderHook(() =>
      useSaveQueue({ entryId: ENTRY_ID }),
    );

    expect(result.current.queueLength).toBe(0);

    let promise1: Promise<unknown>;
    let promise2: Promise<unknown>;
    act(() => {
      promise1 = result.current.enqueue({ title: "A" });
      promise2 = result.current.enqueue({ title: "B" });
    });

    expect(result.current.queueLength).toBe(2);

    await act(async () => {
      await promise1!;
    });

    // After first resolves, second is still in queue or already processed
    await act(async () => {
      await promise2!;
    });

    expect(result.current.queueLength).toBe(0);
  });

  // ── Entry ID changes ───────────────────────────────────────────────────

  it("handles entryId changes between enqueues", async () => {
    const entry1 = makeEntry({ display_id: "E1" });
    const entry2 = makeEntry({ display_id: "E2" });
    mockPut.mockResolvedValue(entry1);

    const { result, rerender } = renderHook(
      ({ entryId }) => useSaveQueue({ entryId }),
      { initialProps: { entryId: "E-FIRST" } },
    );

    await act(async () => {
      await result.current.enqueue({ title: "First entry" });
    });

    expect(mockPut).toHaveBeenCalledWith(
      "/eln/entries/E-FIRST/",
      expect.any(Object),
      undefined,
      expect.any(Object),
    );

    // Switch to a different entry
    mockPut.mockResolvedValue(entry2);
    rerender({ entryId: "E-SECOND" });

    await act(async () => {
      await result.current.enqueue({ title: "Second entry" });
    });

    expect(mockPut).toHaveBeenCalledWith(
      "/eln/entries/E-SECOND/",
      expect.any(Object),
      undefined,
      expect.any(Object),
    );
  });
});
