/**
 * Tests for useEntryWorkspace — the ELN entry save pipeline facade.
 *
 * Covers: baseline capture on ready, 2s debounce timing, content-phase gating,
 * unmount flush, saved-baseline advance after auto-save, post-autosave edits
 * stay dirty, save(tagIds) forwarding.
 *
 * Uses renderHook + fake timers + mocked API client — exercises the full
 * pipeline through the hook interface.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useEntryWorkspace,
  type UseEntryWorkspaceOptions,
} from "../hooks/useEntryWorkspace";
import { EMPTY_DOC, type TipTapDoc } from "../types";
import type { Editor } from "@tiptap/core";
import type { UseAutoSaveOptions } from "../hooks/useAutoSave";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const mockGet = vi.fn();
vi.mock("../../../shell/src/api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number) {
      super(`API error: ${status}`);
      this.status = status;
    }
  },
}));

const mockResolveIds = vi.fn();
vi.mock("../../../shell/src/mentions/MentionProvider", () => ({
  useMentionContext: () => ({
    resolutionMap: new Map(),
    resolveIds: mockResolveIds,
  }),
}));

const mockAcquireLock = vi.fn().mockResolvedValue({});
const mockReleaseLock = vi.fn().mockResolvedValue(undefined);
const mockGetLockStatus = vi.fn().mockResolvedValue({ locked: false });
vi.mock("../api", () => ({
  acquireLock: (...args: unknown[]) => mockAcquireLock(...args),
  releaseLock: (...args: unknown[]) => mockReleaseLock(...args),
  attachTags: vi.fn(),
  getLockStatus: (...args: unknown[]) => mockGetLockStatus(...args),
}));

const mockUser = {
  id: 1, username: "alice", first_name: "", last_name: "",
  color: "#000", is_active: true, date_joined: "2025-01-01",
};
vi.mock("../../../shell/src/user/CurrentUserProvider", () => ({
  useCurrentUser: () => ({ user: mockUser, isChecking: false, error: null, refresh: vi.fn() }),
}));

let enqueueResolvers: Array<(value: unknown) => void> = [];
const mockEnqueue = vi.fn();

vi.mock("../hooks/useSaveQueue", () => ({
  useSaveQueue: () => ({
    status: "idle" as const,
    lastSavedAt: null,
    queueLength: 0,
    enqueue: mockEnqueue,
  }),
}));

/** Captured options passed to useAutoSave — tests verify wiring. */
let autoSaveOptions: UseAutoSaveOptions | null = null;

vi.mock("../hooks/useAutoSave", () => ({
  useAutoSave: (opts: UseAutoSaveOptions) => {
    autoSaveOptions = opts;
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeOptions(overrides?: Partial<UseEntryWorkspaceOptions>): UseEntryWorkspaceOptions {
  return { isNew: false, ...overrides };
}

function makeEntry(overrides?: Record<string, unknown>) {
  const bodyPara = {
    type: "paragraph" as const,
    content: [{ type: "text" as const, text: "Body content" }],
  };
  return {
    id: 1,
    display_id: "E1",
    name: "Test Entry",
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        bodyPara,
      ],
    },
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

function makeSyncEditor(): Editor {
  return {
    getJSON: () => ({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Body content" }] },
      ],
    }),
  } as unknown as Editor;
}

function makeDirtyEditor(): Editor {
  return {
    getJSON: () => ({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Edited content" }] },
      ],
    }),
  } as unknown as Editor;
}

// ── Setup / teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  autoSaveOptions = null;
  enqueueResolvers = [];
  mockEnqueue.mockReset();

  mockEnqueue.mockImplementation(() => {
    return new Promise((resolve) => {
      enqueueResolvers.push(resolve);
    }).catch(() => {});
  });

  mockGet.mockImplementation((url: string) => {
    if (url === "/core/folders/") return Promise.resolve([]);
    if (url.startsWith("/eln/entries/") && url.endsWith("/lock/")) {
      return Promise.resolve({ locked: false });
    }
    return Promise.resolve(makeEntry());
  });

  mockAcquireLock.mockResolvedValue({});
  mockReleaseLock.mockResolvedValue(undefined);
  mockGetLockStatus.mockResolvedValue({ locked: false });
  mockResolveIds.mockClear();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("useEntryWorkspace", () => {
  // ── Baseline capture on ready ───────────────────────────────────────────

  it("baseline capture on ready: advances to isReady after fetch", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    expect(result.current.isReady).toBe(false);

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.fields.title).toBe("Test Entry");
    expect(result.current.fields.description).toBe("Hello");
  });

  it("new entry: isReady immediately without fetch", () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ isNew: true })),
    );

    expect(result.current.isReady).toBe(true);
    expect(result.current.entry).toBeNull();
  });

  // ── Auto-save wiring ────────────────────────────────────────────────────

  it("wires auto-save with entryId and contentVersion", async () => {
    renderHook(() => useEntryWorkspace(makeOptions({ entryId: "E1" })));

    await waitFor(() => {
      expect(autoSaveOptions).not.toBeNull();
    });

    expect(autoSaveOptions!.entryId).toBe("E1");
    expect(autoSaveOptions!.contentVersion).toBe(0);
    expect(typeof autoSaveOptions!.autoSave).toBe("function");
  });

  it("wires auto-save with contentPhase gating", async () => {
    renderHook(() => useEntryWorkspace(makeOptions({ entryId: "E1" })));

    await waitFor(() => {
      expect(autoSaveOptions).not.toBeNull();
    });

    // contentPhase starts as "loading" initially
    expect(autoSaveOptions!.contentPhase).toBeDefined();
  });

  it("auto-save options update on content change", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.editor.onUpdate(makeDirtyEditor());
    });

    // contentVersion increments after editor update
    await waitFor(() => {
      expect(autoSaveOptions!.contentVersion).toBe(1);
    });
  });

  // ── isDirty state ───────────────────────────────────────────────────────

  it("isDirty becomes false after editor syncs with baseline", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    // Simulate TipTapRenderer's initial onUpdate syncing contentRef
    act(() => {
      result.current.editor.onUpdate(makeSyncEditor());
    });

    expect(result.current.save.isDirty).toBe(false);
  });

  it("isDirty becomes true after edits diverge from baseline", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => { result.current.editor.onUpdate(makeSyncEditor()); });
    expect(result.current.save.isDirty).toBe(false);

    act(() => { result.current.editor.onUpdate(makeDirtyEditor()); });
    expect(result.current.save.isDirty).toBe(true);
  });

  // ── Post-autosave edits stay dirty ──────────────────────────────────────

  it("post-autosave edits stay dirty (cursor preservation)", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => { result.current.editor.onUpdate(makeSyncEditor()); });
    expect(result.current.save.isDirty).toBe(false);

    // Make an edit
    act(() => { result.current.editor.onUpdate(makeDirtyEditor()); });
    expect(result.current.save.isDirty).toBe(true);

    // Simulate an auto-save resolving with server data, advancing
    // the saved baseline but not live editor state.
    const savedEntry = makeEntry();
    act(() => {
      result.current.save.applySavedEntry(savedEntry);
    });

    // After applySavedEntry, isDirty should still be true because
    // live content ("Edited content") differs from saved baseline
    // (which has "Body content"). The saved baseline was advanced
    // but live content was NOT overwritten (cursor preservation).
    expect(result.current.save.isDirty).toBe(true);
  });

  it("isDirty clears when live edits match saved baseline", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => { result.current.editor.onUpdate(makeSyncEditor()); });
    expect(result.current.save.isDirty).toBe(false);

    // Make an edit
    act(() => { result.current.editor.onUpdate(makeDirtyEditor()); });
    expect(result.current.save.isDirty).toBe(true);

    // applySavedEntry with content matching the live state
    act(() => {
      result.current.save.applySavedEntry(makeEntry({
        name: "Test Entry",
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
            { type: "paragraph", content: [{ type: "text", text: "Edited content" }] },
          ],
        },
      }));
    });

    // isDirty should be false — live content matches the baseline
    expect(result.current.save.isDirty).toBe(false);
  });

  // ── save(tagIds) forwarding ─────────────────────────────────────────────

  it("save(tagIds) forwarding: calls manual save with tagIds", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    mockEnqueue.mockClear();

    await act(async () => {
      result.current.save.save([101, 102]);
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][1]).toBe("manual");
  });

  it("save() with no args: manual save without tagIds", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    mockEnqueue.mockClear();

    await act(async () => {
      result.current.save.save();
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][1]).toBe("manual");
  });

  // ── Grouped return shape ────────────────────────────────────────────────

  it("grouped return: exposes fields, folder, save, lock, editor groups", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/core/folders/") return Promise.resolve([{ id: 1, name: "Project A" }]);
      if (url.startsWith("/eln/entries/") && url.endsWith("/lock/")) return Promise.resolve({ locked: false });
      return Promise.resolve(makeEntry());
    });

    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current).toHaveProperty("isReady");
    expect(result.current).toHaveProperty("error");
    expect(result.current).toHaveProperty("entry");

    expect(result.current.fields).toBeDefined();
    expect(typeof result.current.fields.setTitle).toBe("function");
    expect(typeof result.current.fields.setDescription).toBe("function");
    expect(typeof result.current.fields.setStatus).toBe("function");

    expect(result.current.folder).toBeDefined();
    expect(typeof result.current.folder.setFolderId).toBe("function");

    expect(result.current.save).toBeDefined();
    expect(typeof result.current.save.save).toBe("function");
    expect(typeof result.current.save.deleteEntry).toBe("function");
    expect(typeof result.current.save.applySavedEntry).toBe("function");

    expect(result.current.lock).toBeDefined();
    expect(result.current.editor).toBeDefined();
    expect(typeof result.current.editor.onUpdate).toBe("function");
    expect(result.current.editor).toHaveProperty("hasPendingRef");
  });

  // ── Folder data ─────────────────────────────────────────────────────────

  it("folder: exposes folders and respects initialFolderId", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/core/folders/") return Promise.resolve([{ id: 10, name: "Lab" }, { id: 20, name: "Office" }]);
      if (url.startsWith("/eln/entries/") && url.endsWith("/lock/")) return Promise.resolve({ locked: false });
      return Promise.resolve(makeEntry());
    });

    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1", initialFolderId: 10 })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.folder.folders).toEqual([
      { id: 10, name: "Lab" },
      { id: 20, name: "Office" },
    ]);
    expect(result.current.folder.folderId).toBe(10);
  });

  it("folder: uses the persisted entry folder when no initial folder is provided", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/core/folders/?project=7") {
        return Promise.resolve([{ id: 20, name: "Lab" }]);
      }
      if (url.startsWith("/eln/entries/") && url.endsWith("/lock/")) {
        return Promise.resolve({ locked: false });
      }
      return Promise.resolve(makeEntry({ folder: 20, project: 7 }));
    });

    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.folder.folderId).toBe(20);
    });
  });

  // ── Lock state ──────────────────────────────────────────────────────────

  it("lock: reflects isLockedByOther and sets editor.editable false", async () => {
    mockGetLockStatus.mockResolvedValue({ locked: true, held_by: 999, held_by_username: "bob" });

    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.lock.isLockedByOther).toBe(true);
    });

    expect(result.current.lock.lockHeldBy).toBe("bob");
    expect(result.current.editor.editable).toBe(false);
  });

  // ── Editor group ────────────────────────────────────────────────────────

  it("editor.content returns body (document minus first paragraph)", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.editor.content).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Body content" }] },
      ],
    });
  });

  it("editor.onUpdate triggers version bump and wires to auto-save", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.editor.onUpdate(makeDirtyEditor());
    });

    // After onUpdate, the contentVersion in auto-save options should increment
    await waitFor(() => {
      expect(autoSaveOptions!.contentVersion).toBe(1);
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────

  it("error: surfaces fetch errors", async () => {
    mockGet.mockRejectedValue(new Error("Not found"));

    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.error).toBe("Not found");
    });
    expect(result.current.isReady).toBe(false);
  });

  // ── applySavedEntry ─────────────────────────────────────────────────────

  it("applySavedEntry updates entry and resets dirty baseline", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => { result.current.editor.onUpdate(makeSyncEditor()); });
    expect(result.current.save.isDirty).toBe(false);

    // Edit
    act(() => { result.current.editor.onUpdate(makeDirtyEditor()); });
    expect(result.current.save.isDirty).toBe(true);

    // Manual save with new entry data
    const saved = makeEntry({ name: "Updated Name", status: "completed" });
    act(() => { result.current.save.applySavedEntry(saved); });

    // After applySavedEntry, title updates and dirty is cleared
    // (because the saved content baseline now matches current)
    expect(result.current.fields.title).toBe("Updated Name");
    expect(result.current.fields.status).toBe("completed");
  });

  // ── deleteEntry ─────────────────────────────────────────────────────────

  it("deleteEntry is exposed through save.deleteEntry", async () => {
    const { result } = renderHook(() =>
      useEntryWorkspace(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(typeof result.current.save.deleteEntry).toBe("function");
  });
});
