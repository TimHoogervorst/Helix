/**
 * Tests for useEntryEditor — the ELN editor state machine hook.
 *
 * Covers: mode transitions, API calls, dirty tracking, beforeunload guard,
 * save/cancel/delete/enterEditMode actions, and collectDisplayIds helper.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useEntryEditor,
  collectDisplayIds,
  validateEntityNames,
  type UseEntryEditorOptions,
} from "../hooks/useEntryEditor";
import { EMPTY_DOC, type TipTapDoc } from "../types";

// ── Mocks ────────────────────────────────────────────────────────────────────

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
const mockDetachTag = vi.fn();
vi.mock("../api", () => ({
  acquireLock: (...args: unknown[]) => mockAcquireLock(...args),
  releaseLock: (...args: unknown[]) => mockReleaseLock(...args),
  attachTags: (...args: unknown[]) => mockAttachTags(...args),
  detachTag: (...args: unknown[]) => mockDetachTag(...args),
  getLockStatus: vi.fn().mockResolvedValue({ locked: false }),
}));

vi.mock("../../../core/user/CurrentUserProvider", () => ({
  useCurrentUser: () => ({
    user: { id: 1, username: "alice", first_name: "", last_name: "", color: "#000", is_active: true, date_joined: "2025-01-01" },
    isChecking: false,
    error: null,
    refresh: vi.fn(),
  }),
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeOptions(
  overrides?: Partial<UseEntryEditorOptions>,
): UseEntryEditorOptions {
  return {
    isNew: false,
    contentRef: { current: EMPTY_DOC },
    ...overrides,
  };
}

/** A stubbed entry detail returned by the API. */
function makeEntry(overrides?: Partial<Record<string, unknown>>) {
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
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useEntryEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    mockDel.mockReset();
    mockResolveIds.mockReset();
    mockNavigate.mockReset();
    mockEnqueue.mockReset();
    mockAcquireLock.mockReset();
    mockReleaseLock.mockReset();
    mockAttachTags.mockReset();
    mockAcquireLock.mockResolvedValue({});
    mockReleaseLock.mockResolvedValue(undefined);
    // Default: successful fetch returns a stubbed entry
    mockGet.mockResolvedValue(makeEntry());
    // Default: enqueue returns saved entry
    mockEnqueue.mockResolvedValue(makeEntry());
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  it("starts in edit-existing mode for a new entry", () => {
    const contentRef = { current: EMPTY_DOC };
    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    expect(result.current.mode).toBe("edit-existing");
    expect(result.current.entry).toBeNull();
    expect(result.current.title).toBe("");
    expect(result.current.isDirty).toBe(false);
  });

  it("starts in loading mode for an existing entry", () => {
    const contentRef = { current: EMPTY_DOC };
    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    expect(result.current.mode).toBe("loading");
  });

  // ── Fetch entry ────────────────────────────────────────────────────────────

  it("fetches an existing entry and transitions to view", async () => {
    const entry = makeEntry({ title: "Loaded Entry" });
    mockGet.mockResolvedValue(entry);
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("edit-existing");
    });

    expect(result.current.entry).toEqual(entry);
    expect(result.current.title).toBe("Loaded Entry");
    expect(result.current.initialTitle).toBe("Loaded Entry");
    // First paragraph extracted as description; body is the rest
    expect(result.current.description).toBe("Hello");
    expect(result.current.initialContent).toEqual({
      type: "doc",
      content: [],
    });
    expect(mockGet).toHaveBeenCalledWith(
      "/eln/entries/E1/",
      expect.any(AbortSignal),
    );
  });

  it("resolves references after loading entry content", async () => {
    const entry = makeEntry({
      content: {
        type: "doc",
        content: [
          { type: "reference", attrs: { displayId: "BLOOD1" } },
        ],
      },
    });
    mockGet.mockResolvedValue(entry);
    const contentRef = { current: EMPTY_DOC };

    renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(mockResolveIds).toHaveBeenCalledWith(["BLOOD1"]);
    });
  });

  it("transitions to error when fetch fails", async () => {
    mockGet.mockRejectedValue(new Error("Network failure"));
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("error");
    });
    expect(result.current.error).toBe("Network failure");
  });

  it("aborts fetch on unmount", () => {
    // Delayed promise — never resolves
    mockGet.mockReturnValue(new Promise(() => {}));
    const contentRef = { current: EMPTY_DOC };

    const { unmount } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    // Signal should be aborted on unmount
    unmount();
    const signal = mockGet.mock.calls[0]?.[1] as AbortSignal | undefined;
    expect(signal?.aborted).toBe(true);
  });

  // ── Fetch folders ──────────────────────────────────────────────────────────

  it("fetches folders on mount", async () => {
    const folders = [
      { id: 1, name: "Experiments" },
      { id: 2, name: "Notes" },
    ];
    mockGet.mockImplementation((path: string) => {
      if (path === "/core/folders/") return Promise.resolve(folders);
      return Promise.resolve(makeEntry());
    });
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: true, contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.folders).toEqual(folders);
    });
  });

  // ── Dirty tracking ─────────────────────────────────────────────────────────

  it("isDirty is true when title differs from initialTitle", async () => {
    const entry = makeEntry({ title: "Original" });
    mockGet.mockResolvedValue(entry);
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("edit-existing");
    });

    act(() => {
      result.current.setTitle("Changed");
    });

    expect(result.current.isDirty).toBe(true);
  });

  it("isDirty is true when content differs from initialContent", () => {
    const changedContent: TipTapDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "changed" }] }],
    };
    const contentRef = { current: changedContent };

    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    expect(result.current.isDirty).toBe(true);
  });

  it("isDirty is false when title and content match initial", async () => {
    const entry = makeEntry({ title: "Same" });
    mockGet.mockResolvedValue(entry);
    // The contentRef reflects the editor body (first paragraph extracted as description)
    const body = { type: "doc", content: [] };
    const contentRef = { current: body };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("edit-existing");
    });

    expect(result.current.isDirty).toBe(false);
  });

  // ── Save ───────────────────────────────────────────────────────────────────

  it("saves a new entry via save queue", async () => {
    const created = makeEntry({ display_id: "NEW1", id: 10 });
    mockEnqueue.mockResolvedValue(created);
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, entryId: "E-NEW", contentRef })),
    );

    act(() => {
      result.current.setTitle("My New Entry");
    });

    await act(async () => {
      await result.current.save();
    });

    // Description is prepended as the first paragraph
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "My New Entry",
        folder: null,
        status: "in_progress",
      }),
      "manual",
    );
  });

  it("does not save when title is empty", async () => {
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, entryId: "E1", contentRef })),
    );

    await act(async () => {
      await result.current.save();
    });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("stays in edit-existing mode on save error", async () => {
    mockEnqueue.mockRejectedValue(new Error("Conflict"));
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, entryId: "E1", contentRef })),
    );

    act(() => {
      result.current.setTitle("Will Fail");
    });

    // Save will reject, but the promise has an internal .catch() for
    // fire-and-forget support, so we need to catch the rejection here too.
    await act(async () => {
      try {
        await result.current.save();
      } catch {
        // Expected — save errors are propagated via the promise chain,
        // but the fire-and-forget catch prevents unhandled rejections.
      }
    });

    // Always editable — mode never changes
    expect(result.current.mode).toBe("edit-existing");
  });

  it("saves an existing entry and stays in edit-existing mode", async () => {
    mockGet.mockResolvedValue(makeEntry({ title: "Existing" }));
    const updatedResponse = makeEntry({ title: "Updated Title", content: { type: "doc", content: [] } });
    mockEnqueue.mockResolvedValue(updatedResponse);
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("edit-existing");
    });

    act(() => {
      result.current.setTitle("Updated Title");
    });

    await act(async () => {
      await result.current.save();
    });

    // Description should be prepended and enqueued
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Updated Title",
        folder: null,
        status: "in_progress",
      }),
      "manual",
    );
    // Always editable — mode never changes
    expect(result.current.mode).toBe("edit-existing");
    expect(result.current.entry).toEqual(updatedResponse);
  });

  // ── Cancel ─────────────────────────────────────────────────────────────────

  it("cancel is a no-op in always-editable mode", () => {
    const contentRef = { current: EMPTY_DOC };
    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, entryId: "E1", contentRef })),
    );

    act(() => {
      result.current.cancel();
    });

    // Cancel is a no-op — always-editable mode has no cancel.
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("cancel is a no-op for existing entries", async () => {
    const entry = makeEntry({ title: "Original", folder: 5 });
    mockGet.mockResolvedValue(entry);
    const contentRef = { current: entry.content };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("edit-existing");
    });

    // Simulate editing: change title
    act(() => {
      result.current.setTitle("Edited Title");
    });

    // Cancel is a no-op in always-editable mode.
    act(() => {
      result.current.cancel();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  it("deletes an entry and navigates to /library", async () => {
    mockGet.mockResolvedValue(makeEntry());
    mockDel.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("edit-existing");
    });

    await act(async () => {
      await result.current.deleteEntry();
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDel).toHaveBeenCalledWith("/eln/entries/E1/");
    expect(mockNavigate).toHaveBeenCalledWith("/library");

    confirmSpy.mockRestore();
  });

  it("does not call API when confirm is cancelled", async () => {
    mockGet.mockResolvedValue(makeEntry());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("edit-existing");
    });

    await act(async () => {
      await result.current.deleteEntry();
    });

    expect(mockDel).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("handles delete error", async () => {
    mockGet.mockResolvedValue(makeEntry());
    mockDel.mockRejectedValue(new Error("Forbidden"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("edit-existing");
    });

    await act(async () => {
      await result.current.deleteEntry();
    });

    expect(result.current.deleting).toBe(false);
    expect(result.current.error).toBe("Forbidden");
  });

  it("does nothing when entryId is missing", async () => {
    const contentRef = { current: EMPTY_DOC };
    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    await act(async () => {
      await result.current.deleteEntry();
    });

    expect(mockDel).not.toHaveBeenCalled();
  });

  // ── enterEditMode ──────────────────────────────────────────────────────────

  it("enterEditMode is a no-op in always-editable mode", async () => {
    const entry = makeEntry();
    const contentWithRef: TipTapDoc = {
      type: "doc",
      content: [
        { type: "reference", attrs: { displayId: "SAMPLE1" } },
      ],
    };
    mockGet.mockResolvedValue(entry);
    const contentRef = { current: contentWithRef };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("edit-existing");
    });

    // enterEditMode is a no-op — editor is always editable.
    act(() => {
      result.current.enterEditMode();
    });

    expect(result.current.mode).toBe("edit-existing");
  });

  // ── beforeunload guard ─────────────────────────────────────────────────────

  it("prevents unload when dirty", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const changedContent: TipTapDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "dirty" }] }],
    };
    const contentRef = { current: changedContent };

    renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );

    // Get the registered handler and verify it prevents default
    const handler = addEventListenerSpy.mock.calls.find(
      (call) => call[0] === "beforeunload",
    )?.[1] as EventListener | undefined;
    expect(handler).toBeDefined();

    // Use a plain object with the right shape so returnValue is writable.
    const event = { preventDefault: vi.fn(), returnValue: "" as string };
    handler?.(event as unknown as Event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe("");

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("does not prevent unload when clean", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const contentRef = { current: EMPTY_DOC };

    renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    const handler = addEventListenerSpy.mock.calls.find(
      (call) => call[0] === "beforeunload",
    )?.[1] as EventListener | undefined;
    expect(handler).toBeDefined();

    const preventDefault = vi.fn();
    const event = { preventDefault, returnValue: "" };
    handler?.(event as unknown as Event);

    expect(preventDefault).not.toHaveBeenCalled();

    addEventListenerSpy.mockRestore();
  });

  it("removes beforeunload listener on unmount", () => {
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
    const contentRef = { current: EMPTY_DOC };

    const { unmount } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );

    removeEventListenerSpy.mockRestore();
  });

  // ── setFolderId ────────────────────────────────────────────────────────────

  it("setFolderId updates folderId", () => {
    const contentRef = { current: EMPTY_DOC };
    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    act(() => {
      result.current.setFolderId(42);
    });

    expect(result.current.folderId).toBe(42);
  });

  // ── initialFolderId ──────────────────────────────────────────────────────

  it("initializes folderId from initialFolderId option", () => {
    const contentRef = { current: EMPTY_DOC };
    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: true, initialFolderId: 7, contentRef }),
      ),
    );

    expect(result.current.folderId).toBe(7);
  });

  it("defaults folderId to null when initialFolderId is not provided", () => {
    const contentRef = { current: EMPTY_DOC };
    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    expect(result.current.folderId).toBeNull();
  });
});

// ── collectDisplayIds ────────────────────────────────────────────────────────

describe("collectDisplayIds", () => {
  it("returns empty array for empty doc", () => {
    const ids = collectDisplayIds({ type: "doc", content: [] });
    expect(ids).toEqual([]);
  });

  it("collects displayId from reference nodes", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
        { type: "reference", attrs: { displayId: "BLOOD1" } },
        { type: "reference", attrs: { displayId: "CELL2" } },
      ],
    };
    expect(collectDisplayIds(doc)).toEqual(["BLOOD1", "CELL2"]);
  });

  it("collects displayId from limsTable entity rows", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            rows: [
              { entityId: 1, displayId: "SAMPLE_A", name: "Sample A" },
              { entityId: 2, displayId: "SAMPLE_B", name: "Sample B" },
            ],
          },
        },
      ],
    };
    expect(collectDisplayIds(doc)).toEqual(["SAMPLE_A", "SAMPLE_B"]);
  });

  it("skips limsTable rows without entityId", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            rows: [
              { displayId: "NO_ENTITY", name: "No Entity" },
              { entityId: 1, displayId: "HAS_ENTITY" },
            ],
          },
        },
      ],
    };
    expect(collectDisplayIds(doc)).toEqual(["HAS_ENTITY"]);
  });

  it("walks nested content recursively", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            { type: "reference", attrs: { displayId: "NESTED_REF" } },
          ],
        },
      ],
    };
    expect(collectDisplayIds(doc)).toEqual(["NESTED_REF"]);
  });

  it("handles null / undefined gracefully", () => {
    const ids = collectDisplayIds(null as unknown as TipTapDoc);
    expect(ids).toEqual([]);
  });
});

// ── validateEntityNames ───────────────────────────────────────────────────────

describe("validateEntityNames", () => {
  it("returns true for empty doc (no tables)", () => {
    expect(validateEntityNames({ type: "doc", content: [] })).toBe(true);
  });

  it("returns true for plain table (no schemaId)", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            schemaId: null,
            rows: [
              { displayId: "#1", values: {} },
            ],
          },
        },
      ],
    };
    expect(validateEntityNames(doc)).toBe(true);
  });

  it("returns true when all schema-backed rows have __name", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            schemaId: 1,
            rows: [
              { entityId: null, displayId: "#1", __name: "Alpha", values: {} },
              { entityId: null, displayId: "#2", __name: "Beta", values: {} },
            ],
          },
        },
      ],
    };
    expect(validateEntityNames(doc)).toBe(true);
  });

  it("returns false when a schema-backed row has empty __name", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            schemaId: 1,
            rows: [
              { entityId: null, displayId: "#1", __name: "Alpha", values: {} },
              { entityId: null, displayId: "#2", __name: "", values: {} },
            ],
          },
        },
      ],
    };
    expect(validateEntityNames(doc)).toBe(false);
  });

  it("returns false when a schema-backed row is missing __name", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            schemaId: 1,
            rows: [
              { entityId: null, displayId: "#1", __name: "Alpha", values: {} },
              { entityId: null, displayId: "#2", values: {} },
            ],
          },
        },
      ],
    };
    expect(validateEntityNames(doc)).toBe(false);
  });

  it("returns false when __name is whitespace only", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            schemaId: 1,
            rows: [
              { entityId: null, displayId: "#1", __name: "   ", values: {} },
            ],
          },
        },
      ],
    };
    expect(validateEntityNames(doc)).toBe(false);
  });

  it("walks nested content for limsTable nodes", () => {
    const doc: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "limsTable",
              attrs: {
                schemaId: 1,
                rows: [
                  { entityId: null, displayId: "#1", __name: "", values: {} },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(validateEntityNames(doc)).toBe(false);
  });

  it("handles null / undefined gracefully", () => {
    expect(validateEntityNames(null as unknown as TipTapDoc)).toBe(true);
  });
});

describe("save with name validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    mockEnqueue.mockReset();
    mockNavigate.mockReset();
    mockAcquireLock.mockReset();
    mockReleaseLock.mockReset();
    mockAcquireLock.mockResolvedValue({});
    mockReleaseLock.mockResolvedValue(undefined);
    // Default: folders fetch returns empty array (prevents crash on mount)
    mockGet.mockResolvedValue([]);
    mockEnqueue.mockResolvedValue(makeEntry());
  });

  it("shows alert and does not save when Name cells are empty", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const contentWithEmptyName: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            schemaId: 1,
            rows: [
              { entityId: null, displayId: "#1", __name: "", values: {} },
            ],
          },
        },
      ],
    };
    const contentRef = { current: contentWithEmptyName };

    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, entryId: "E1", contentRef })),
    );

    act(() => {
      result.current.setTitle("Test");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(alertSpy).toHaveBeenCalledWith("Name not filled in.");
    expect(mockEnqueue).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("saves when all Name cells are filled", async () => {
    mockEnqueue.mockResolvedValue(makeEntry({ display_id: "NEW1", id: 10 }));
    const contentWithNames: TipTapDoc = {
      type: "doc",
      content: [
        {
          type: "limsTable",
          attrs: {
            schemaId: 1,
            rows: [
              { entityId: null, displayId: "#1", __name: "Alpha", values: {} },
            ],
          },
        },
      ],
    };
    const contentRef = { current: contentWithNames };

    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, entryId: "E1", contentRef })),
    );

    act(() => {
      result.current.setTitle("Test");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(mockEnqueue).toHaveBeenCalled();
    // Verify the content has the description paragraph prepended
    const callArgs = mockEnqueue.mock.calls[0] as [Record<string, unknown>, string];
    const payload = callArgs[0];
    const content = payload.content as TipTapDoc;
    expect(Array.isArray(content.content)).toBe(true);
    expect((content.content as Array<unknown>).length).toBe(2); // description para + limsTable
  });
});
