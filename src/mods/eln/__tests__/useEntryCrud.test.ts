/**
 * Tests for useEntryCrud — always-editable CRUD hook with save queue integration.
 *
 * Focuses on: entry fetch, isReady/error state, setTitle/setDescription/setStatus,
 * autoSave (fire-and-forget), save (manual), applySavedEntry, deleteEntry,
 * and lock lifecycle on mount/unmount.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useEntryCrud,
  type UseEntryCrudOptions,
} from "../hooks/useEntryCrud";
import { EMPTY_DOC, type TipTapDoc } from "../types";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const mockGet = vi.fn();
const mockDel = vi.fn();
vi.mock("../../../core/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  del: (...args: unknown[]) => mockDel(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`API error: ${status}`);
      this.status = status;
    }
  },
}));

const mockResolveIds = vi.fn();
vi.mock("../../../core/mentions/MentionProvider", () => ({
  useMentionContext: () => ({
    resolutionMap: new Map(),
    resolveIds: mockResolveIds,
  }),
}));

const mockAcquireLock = vi.fn().mockResolvedValue({});
const mockReleaseLock = vi.fn().mockResolvedValue(undefined);
const mockAttachTags = vi.fn();
const mockGetLockStatus = vi.fn().mockResolvedValue({ locked: false });
vi.mock("../api", () => ({
  acquireLock: (...args: unknown[]) => mockAcquireLock(...args),
  releaseLock: (...args: unknown[]) => mockReleaseLock(...args),
  attachTags: (...args: unknown[]) => mockAttachTags(...args),
  getLockStatus: (...args: unknown[]) => mockGetLockStatus(...args),
}));

const mockUser = { id: 1, username: "alice", first_name: "", last_name: "", color: "#000", is_active: true, date_joined: "2025-01-01" };
vi.mock("../../../core/user/CurrentUserProvider", () => ({
  useCurrentUser: () => ({ user: mockUser, isChecking: false, error: null, refresh: vi.fn() }),
}));

const mockEnqueue = vi.fn();
vi.mock("../hooks/useSaveQueue", () => ({
  useSaveQueue: () => ({
    status: "idle" as const,
    lastSavedAt: null,
    queueLength: 0,
    enqueue: mockEnqueue,
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeOptions(
  overrides?: Partial<UseEntryCrudOptions>,
): UseEntryCrudOptions {
  return {
    isNew: false,
    contentRef: { current: EMPTY_DOC },
    ...overrides,
  };
}

function makeEntry(overrides?: Record<string, unknown>) {
  return {
    id: 1,
    display_id: "E1",
    title: "Test Entry",
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
    folder: null,
    folder_name: "",
    folder_path: "",
    author: null,
    author_username: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    status: "in_progress",
    status_display: "In Progress",
    tags: [],
    mentions: [],
    ...overrides,
  };
}

describe("useEntryCrud", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockGet.mockReset();
    mockDel.mockReset();
    mockResolveIds.mockReset();
    mockNavigate.mockReset();
    mockEnqueue.mockReset();
    mockAcquireLock.mockReset();
    mockReleaseLock.mockReset();
    mockAttachTags.mockReset();
    mockGetLockStatus.mockReset();
    mockGet.mockResolvedValue(makeEntry());
    mockAcquireLock.mockResolvedValue({});
    mockReleaseLock.mockResolvedValue(undefined);
    mockGetLockStatus.mockResolvedValue({ locked: false });
  });

  // ── Initial state ────────────────────────────────────────────────────────

  it("starts with isReady false, then transitions to true after fetch", async () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: false, entryId: "E1" })),
    );

    // Initially not ready (loading)
    expect(result.current.isReady).toBe(false);
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });

  it("isReady is true immediately for new entries without entryId", () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );
    expect(result.current.isReady).toBe(true);
    expect(result.current.entry).toBeNull();
    expect(result.current.title).toBe("");
  });

  // ── Entry fetch ──────────────────────────────────────────────────────────

  it("fetches entry and populates state", async () => {
    const entry = makeEntry({ title: "Loaded", status: "completed" });
    mockGet.mockResolvedValue(entry);

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.entry).toEqual(entry);
    expect(result.current.title).toBe("Loaded");
    expect(result.current.description).toBe("Hello");
    expect(result.current.status).toBe("completed");
  });

  it("sets error on fetch failure", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.error).toBe("Network error");
    });
    // isReady stays false on error
    expect(result.current.isReady).toBe(false);
  });

  // ── setTitle / setDescription / setStatus ─────────────────────────────────

  it("setTitle updates title", () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );
    act(() => result.current.setTitle("New Title"));
    expect(result.current.title).toBe("New Title");
  });

  it("setDescription updates description", () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );
    act(() => result.current.setDescription("A description"));
    expect(result.current.description).toBe("A description");
  });

  it("setStatus updates status", () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );
    act(() => result.current.setStatus("completed"));
    expect(result.current.status).toBe("completed");
  });

  // ── setEntry exposure ────────────────────────────────────────────────────

  it("exposes setEntry for external entry updates", () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );

    const updated = makeEntry({ title: "Updated Externally" }) as unknown as import("../types").EntryDetail;
    act(() => result.current.setEntry(updated));
    expect(result.current.entry).toEqual(updated);
  });

  // ── autoSave (fire-and-forget) ────────────────────────────────────────────

  it("autoSave enqueues with autosave saveMode and resolves reference IDs from response", async () => {
    const saved = makeEntry({ title: "Auto Saved", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Saved desc" }] }] } });
    mockEnqueue.mockResolvedValue(saved);
    mockGet.mockResolvedValue(makeEntry({ title: "Original" }));

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.setTitle("Auto Saved");
    });

    act(() => {
      result.current.autoSave(3);
    });

    // Verify enqueue was called with autosave mode
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Auto Saved" }),
      "autosave",
    );

    // After the promise resolves, title stays as-is (auto-save does NOT
    // overwrite local state — the user may have edited since the save
    // was triggered).
    await waitFor(() => {
      expect(result.current.title).toBe("Auto Saved");
    });

    // entry state is NOT updated by auto-save — only manual save does that.
    expect(result.current.entry?.title).toBe("Original");
  });

  it("autoSave skips when title is empty", () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    act(() => {
      result.current.autoSave(null);
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("autoSave validates entity names and skips on invalid", () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const contentWithEmptyName: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            schemaId: 1,
            rows: [{ entityId: null, displayId: "#1", __name: "", values: {} }],
          },
        },
      ],
    };

    const { result } = renderHook(() =>
      useEntryCrud(
        makeOptions({ isNew: true, entryId: "E1", contentRef: { current: contentWithEmptyName } }),
      ),
    );

    act(() => {
      result.current.setTitle("Test");
      result.current.autoSave(null);
    });

    // autoSave silently skips (no alert, no enqueue)
    expect(mockEnqueue).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  // ── save (manual) ────────────────────────────────────────────────────────

  it("save enqueues with manual saveMode", async () => {
    const saved = makeEntry({ title: "Manual Saved", content: { type: "doc", content: [] } });
    mockEnqueue.mockResolvedValue(saved);
    mockGet.mockResolvedValue(makeEntry({ title: "Original" }));

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.setTitle("Manual Saved");
    });

    await act(async () => {
      await result.current.save(5, []);
    });

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Manual Saved", folder: 5 }),
      "manual",
    );
  });

  it("save validates entity names and shows alert", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const contentWithEmptyName: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            schemaId: 1,
            rows: [{ entityId: null, displayId: "#1", __name: "", values: {} }],
          },
        },
      ],
    };

    const { result } = renderHook(() =>
      useEntryCrud(
        makeOptions({ isNew: true, entryId: "E1", contentRef: { current: contentWithEmptyName } }),
      ),
    );

    act(() => { result.current.setTitle("Test"); });

    await act(async () => {
      await result.current.save(null, []);
    });

    expect(alertSpy).toHaveBeenCalledWith("Name not filled in.");
    expect(mockEnqueue).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("save for isNew attaches deferred tags after save", async () => {
    const saved = makeEntry({ title: "Tagged", content: { type: "doc", content: [] } });
    mockEnqueue.mockResolvedValue(saved);
    const withTags = makeEntry({ title: "Tagged", tags: [{ id: 1, name: "tag1", icon: null }] });
    mockAttachTags.mockResolvedValue(withTags);

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E-NEW", isNew: true })),
    );

    act(() => { result.current.setTitle("Tagged"); });

    await act(async () => {
      await result.current.save(7, [1]);
    });

    expect(mockEnqueue).toHaveBeenCalled();
    expect(mockAttachTags).toHaveBeenCalledWith("E-NEW", [1]);
    expect(result.current.entry?.tags).toEqual([{ id: 1, name: "tag1", icon: null }]);
  });

  it("save does nothing when title is empty", async () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true, entryId: "E1" })),
    );

    await act(async () => {
      await result.current.save(null, []);
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  // ── applySavedEntry ──────────────────────────────────────────────────────

  it("applySavedEntry updates local state from server response", () => {
    const saved = makeEntry({ title: "Server Title", status: "completed", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Server desc" }] }] } });

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );

    act(() => {
      result.current.applySavedEntry(saved as unknown as import("../types").EntryDetail);
    });

    expect(result.current.entry?.title).toBe("Server Title");
    expect(result.current.title).toBe("Server Title");
    expect(result.current.description).toBe("Server desc");
    expect(result.current.status).toBe("completed");
  });

  // ── Delete ───────────────────────────────────────────────────────────────

  it("deleteEntry calls API and navigates to /library", async () => {
    mockGet.mockResolvedValue(makeEntry());
    mockDel.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    await act(async () => {
      await result.current.deleteEntry();
    });

    expect(mockDel).toHaveBeenCalledWith("/eln/entries/E1/");
    expect(mockNavigate).toHaveBeenCalledWith("/library");
  });

  it("deleteEntry does nothing without entryId", async () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );

    await act(async () => {
      await result.current.deleteEntry();
    });

    expect(mockDel).not.toHaveBeenCalled();
  });

  // ── Lock lifecycle ───────────────────────────────────────────────────────

  it("acquires lock on mount when entryId is present", async () => {
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));

    renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(mockAcquireLock).toHaveBeenCalledWith("E1");
    });
  });

  it("defers release on unmount and releases after timeout", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));

    const { unmount } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    // Flush microtasks and any pending timers so the effect runs.
    await vi.advanceTimersByTimeAsync(0);
    expect(mockAcquireLock).toHaveBeenCalled();

    unmount();

    // Should NOT release synchronously — the release is deferred by 500ms.
    expect(mockReleaseLock).not.toHaveBeenCalled();

    // After 500ms the release fires.
    await vi.advanceTimersByTimeAsync(500);
    expect(mockReleaseLock).toHaveBeenCalledWith("E1");

    vi.useRealTimers();
  });

  it("skips deferred release for an entry that was re-acquired within the timeout", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));

    const { rerender } = renderHook(
      ({ entryId }) => useEntryCrud(makeOptions({ entryId })),
      { initialProps: { entryId: "E1" } },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(mockAcquireLock).toHaveBeenCalledTimes(1);
    mockAcquireLock.mockClear();

    // Switch to a different entry — cleanup schedules deferred release for "E1".
    mockGet.mockResolvedValue(makeEntry({ display_id: "E2" }));
    rerender({ entryId: "E2" });

    await vi.advanceTimersByTimeAsync(0);
    expect(mockAcquireLock).toHaveBeenCalledWith("E2");

    // Switch back to "E1" within the 500ms deferral window — this bumps
    // E1's generation before the stale release fires.
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));
    mockAcquireLock.mockClear();
    rerender({ entryId: "E1" });

    await vi.advanceTimersByTimeAsync(0);
    expect(mockAcquireLock).toHaveBeenCalledWith("E1");

    // Fast-forward past the first cleanup's 500ms timeout.
    // The release for E1 should be skipped because a new acquire bumped its generation.
    mockReleaseLock.mockClear();
    await vi.advanceTimersByTimeAsync(500);

    // releaseLock should NOT have been called for "E1" because the generation was
    // bumped by the re-acquire. (It may have been called for "E2" on its cleanup,
    // but E2's generation wasn't bumped so that's fine.)
    expect(mockReleaseLock).not.toHaveBeenCalledWith("E1");

    vi.useRealTimers();
  });

  it("does not acquire lock when no entryId", () => {
    renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );

    expect(mockAcquireLock).not.toHaveBeenCalled();
  });

  // ── Lock status check ───────────────────────────────────────────────────

  it("checks lock status on mount when entryId is present", async () => {
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));

    renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(mockGetLockStatus).toHaveBeenCalledWith("E1");
    });
  });

  it("does not check lock status when no entryId", () => {
    renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );

    expect(mockGetLockStatus).not.toHaveBeenCalled();
  });

  it("sets isLockedByOther and lockHeldBy when locked by another user", async () => {
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 99,
      held_by_username: "bob",
    });

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isLockedByOther).toBe(true);
    });
    expect(result.current.lockHeldBy).toBe("bob");
  });

  it("does not set isLockedByOther when locked by self", async () => {
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 1, // same as mockUser.id
    });

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(result.current.isLockedByOther).toBe(false);
  });

  it("does not set isLockedByOther when entry is unlocked", async () => {
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));
    mockGetLockStatus.mockResolvedValue({ locked: false });

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(result.current.isLockedByOther).toBe(false);
  });

  it("acquireLock still fires on mount even when locked by other — backend rejects it", async () => {
    // acquireLock fires synchronously on mount before getLockStatus resolves,
    // so it always fires. The backend rejects it if another user holds the lock.
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 99,
      held_by_username: "bob",
    });

    renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(mockAcquireLock).toHaveBeenCalledWith("E1");
    });
  });

  it("autoSave is gated when isLockedByOther is true", async () => {
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 99,
      held_by_username: "bob",
    });

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isLockedByOther).toBe(true);
    });

    act(() => {
      result.current.setTitle("Changed Title");
      result.current.autoSave(null);
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("save is gated when isLockedByOther is true", async () => {
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 99,
      held_by_username: "bob",
    });

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isLockedByOther).toBe(true);
    });

    act(() => {
      result.current.setTitle("Changed Title");
    });

    await act(async () => {
      await result.current.save(null, []);
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("uses lockHeldBy username fallback when held_by_username is missing", async () => {
    mockGet.mockResolvedValue(makeEntry({ display_id: "E1" }));
    mockGetLockStatus.mockResolvedValue({
      locked: true,
      held_by: 99,
      // held_by_username intentionally absent
    });

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isLockedByOther).toBe(true);
    });
    expect(result.current.lockHeldBy).toBeNull();
  });
});
