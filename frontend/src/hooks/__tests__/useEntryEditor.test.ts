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
} from "../useEntryEditor";
import { EMPTY_DOC, type TipTapDoc } from "../../types/eln";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();
vi.mock("../../api/client", () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
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
vi.mock("../../components/ReferenceProvider", () => ({
  useReferenceContext: () => ({
    resolutionMap: new Map(),
    resolveIds: mockResolveIds,
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
    // Safe resets — avoid touching mock state between tests
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockDel.mockReset();
    mockResolveIds.mockReset();
    mockNavigate.mockReset();
    // Default: successful fetch returns a stubbed entry
    mockGet.mockResolvedValue(makeEntry());
    // Default: folders fetch
    mockGet.mockResolvedValue([]);
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  it("starts in edit-new mode for a new entry", () => {
    const contentRef = { current: EMPTY_DOC };
    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    expect(result.current.mode).toBe("edit-new");
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
      expect(result.current.mode).toBe("view");
    });

    expect(result.current.entry).toEqual(entry);
    expect(result.current.title).toBe("Loaded Entry");
    expect(result.current.initialTitle).toBe("Loaded Entry");
    expect(result.current.initialContent).toEqual(entry.content);
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
      expect(result.current.mode).toBe("view");
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
    const contentRef = { current: entry.content };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("view");
    });

    expect(result.current.isDirty).toBe(false);
  });

  // ── Save ───────────────────────────────────────────────────────────────────

  it("saves a new entry and navigates to it", async () => {
    const created = makeEntry({ display_id: "NEW1", id: 10 });
    mockPost.mockResolvedValue(created);
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    act(() => {
      result.current.setTitle("My New Entry");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(mockPost).toHaveBeenCalledWith("/eln/entries/", {
      title: "My New Entry",
      content: EMPTY_DOC,
      folder: null,
    });
    expect(mockNavigate).toHaveBeenCalledWith("/eln/NEW1");
  });

  it("does not save when title is empty", async () => {
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    await act(async () => {
      await result.current.save();
    });

    expect(mockPost).not.toHaveBeenCalled();
  });

  it("stays in edit-new mode on save error", async () => {
    mockPost.mockRejectedValue(new Error("Conflict"));
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    act(() => {
      result.current.setTitle("Will Fail");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.mode).toBe("edit-new");
    expect(result.current.error).toBe("Conflict");
  });

  it("saves an existing entry and stays in view mode", async () => {
    mockGet.mockResolvedValue(makeEntry({ title: "Existing" }));
    const updatedResponse = makeEntry({ title: "Updated Title", content: { type: "doc", content: [] } });
    mockPut.mockResolvedValue(updatedResponse);
    const contentRef = { current: EMPTY_DOC };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("view");
    });

    act(() => {
      result.current.setTitle("Updated Title");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(mockPut).toHaveBeenCalledWith("/eln/entries/E1/", {
      title: "Updated Title",
      content: EMPTY_DOC,
      folder: null,
    });
    expect(result.current.mode).toBe("view");
    expect(result.current.initialTitle).toBe("Updated Title");
  });

  // ── Cancel ─────────────────────────────────────────────────────────────────

  it("navigates to /library on cancel for a new entry", () => {
    const contentRef = { current: EMPTY_DOC };
    const { result } = renderHook(() =>
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    act(() => {
      result.current.cancel();
    });

    expect(mockNavigate).toHaveBeenCalledWith("/library");
  });

  it("resets title and returns to view on cancel after edit", async () => {
    const entry = makeEntry({ title: "Original", folder: 5 });
    mockGet.mockResolvedValue(entry);
    const contentRef = { current: entry.content };

    const { result } = renderHook(() =>
      useEntryEditor(
        makeOptions({ isNew: false, entryId: "E1", contentRef }),
      ),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("view");
    });

    // Simulate editing: change title
    act(() => {
      result.current.setTitle("Edited Title");
    });

    // Cancel
    act(() => {
      result.current.cancel();
    });

    expect(result.current.mode).toBe("view");
    expect(result.current.title).toBe("Original");
    expect(result.current.folderId).toBe(5);
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
      expect(result.current.mode).toBe("view");
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
      expect(result.current.mode).toBe("view");
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
      expect(result.current.mode).toBe("view");
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

  it("transitions to edit-existing and resolves references", async () => {
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
      expect(result.current.mode).toBe("view");
    });

    // Clear mock to verify fresh call
    mockResolveIds.mockClear();

    act(() => {
      result.current.enterEditMode();
    });

    expect(result.current.mode).toBe("edit-existing");
    expect(mockResolveIds).toHaveBeenCalledWith(["SAMPLE1"]);
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
    mockPost.mockReset();
    mockPut.mockReset();
    mockNavigate.mockReset();
    // Default: folders fetch returns empty array (prevents crash on mount)
    mockGet.mockResolvedValue([]);
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
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    act(() => {
      result.current.setTitle("Test");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(alertSpy).toHaveBeenCalledWith("Name not filled in.");
    expect(mockPost).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("saves when all Name cells are filled", async () => {
    mockPost.mockResolvedValue(makeEntry({ display_id: "NEW1", id: 10 }));
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
      useEntryEditor(makeOptions({ isNew: true, contentRef })),
    );

    act(() => {
      result.current.setTitle("Test");
    });

    await act(async () => {
      await result.current.save();
    });

    expect(mockPost).toHaveBeenCalled();
  });
});
