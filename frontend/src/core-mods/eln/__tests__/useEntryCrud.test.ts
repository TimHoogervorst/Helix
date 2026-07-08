/**
 * Tests for useEntryCrud — ELN entry CRUD state machine.
 *
 * Focuses on the interface unique to useEntryCrud:
 * save(folderId, tags) parameterisation, setEntry exposure,
 * initialDescription/initialStatus exposure, and core mode transitions.
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
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();
vi.mock("../../../core/api/client", () => ({
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
vi.mock("../../../core/references/ReferenceProvider", () => ({
  useReferenceContext: () => ({
    resolutionMap: new Map(),
    resolveIds: mockResolveIds,
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
    vi.clearAllMocks();
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockDel.mockReset();
    mockResolveIds.mockReset();
    mockNavigate.mockReset();
    mockGet.mockResolvedValue(makeEntry());
  });

  // ── Initial state ────────────────────────────────────────────────────────

  it("starts in edit-new mode for new entries", () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );
    expect(result.current.mode).toBe("edit-new");
    expect(result.current.entry).toBeNull();
    expect(result.current.title).toBe("");
    expect(result.current.initialDescription).toBe("");
    expect(result.current.initialStatus).toBe("in_progress");
  });

  it("starts in loading mode for existing entries", () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: false, entryId: "E1" })),
    );
    expect(result.current.mode).toBe("loading");
  });

  // ── Entry fetch ──────────────────────────────────────────────────────────

  it("fetches entry and transitions to view mode", async () => {
    const entry = makeEntry({ title: "Loaded", status: "completed" });
    mockGet.mockResolvedValue(entry);

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("view");
    });

    expect(result.current.entry).toEqual(entry);
    expect(result.current.title).toBe("Loaded");
    expect(result.current.initialTitle).toBe("Loaded");
    expect(result.current.description).toBe("Hello");
    expect(result.current.initialDescription).toBe("Hello");
    expect(result.current.status).toBe("completed");
    expect(result.current.initialStatus).toBe("completed");
  });

  it("transitions to error mode on fetch failure", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("error");
    });
    expect(result.current.error).toBe("Network error");
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

  // ── save with parameters ─────────────────────────────────────────────────

  it("save passes folderId and tags to the API", async () => {
    const created = makeEntry({ display_id: "NEW1", id: 10 });
    mockPost.mockResolvedValue(created);

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );

    act(() => result.current.setTitle("My Entry"));

    const tagIds = [1, 2];

    await act(async () => {
      await result.current.save(5, tagIds);
    });

    expect(mockPost).toHaveBeenCalledWith("/eln/entries/", {
      title: "My Entry",
      content: expect.any(Object),
      folder: 5,
      status: "in_progress",
      tag_ids: [1, 2],
    });
    expect(mockNavigate).toHaveBeenCalledWith("/eln/NEW1");
  });

  it("save existing entry passes folderId but not tag_ids", async () => {
    mockGet.mockResolvedValue(makeEntry({ title: "Existing" }));
    const updated = makeEntry({ title: "Updated", content: { type: "doc", content: [] } });
    mockPut.mockResolvedValue(updated);

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("view");
    });

    act(() => result.current.setTitle("Updated"));

    await act(async () => {
      await result.current.save(3, []);
    });

    const callArgs = mockPut.mock.calls[0] as [string, Record<string, unknown>];
    expect(callArgs[0]).toBe("/eln/entries/E1/");
    expect(callArgs[1].folder).toBe(3);
    // tag_ids should not be present for existing entries
    expect(callArgs[1]).not.toHaveProperty("tag_ids");
    expect(result.current.mode).toBe("view");
  });

  it("save does nothing when title is empty", async () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );

    await act(async () => {
      await result.current.save(null, []);
    });

    expect(mockPost).not.toHaveBeenCalled();
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
        makeOptions({ isNew: true, contentRef: { current: contentWithEmptyName } }),
      ),
    );

    act(() => result.current.setTitle("Test"));

    await act(async () => {
      await result.current.save(null, []);
    });

    expect(alertSpy).toHaveBeenCalledWith("Name not filled in.");
    expect(mockPost).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  // ── Cancel ───────────────────────────────────────────────────────────────

  it("cancel navigates to /library for new entries", () => {
    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ isNew: true })),
    );

    act(() => result.current.cancel());
    expect(mockNavigate).toHaveBeenCalledWith("/library");
  });

  it("cancel resets title/description/status and returns to view", async () => {
    mockGet.mockResolvedValue(makeEntry({ title: "Original", status: "in_progress" }));

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("view");
    });

    act(() => {
      result.current.setTitle("Edited");
      result.current.setDescription("Changed desc");
      result.current.setStatus("completed");
    });

    act(() => result.current.cancel());

    expect(result.current.mode).toBe("view");
    expect(result.current.title).toBe("Original");
    expect(result.current.description).toBe("Hello");
    expect(result.current.status).toBe("in_progress");
    expect(mockNavigate).not.toHaveBeenCalled();
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
      expect(result.current.mode).toBe("view");
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

  // ── enterEditMode ────────────────────────────────────────────────────────

  it("enterEditMode transitions to edit-existing", async () => {
    mockGet.mockResolvedValue(makeEntry());

    const { result } = renderHook(() =>
      useEntryCrud(makeOptions({ entryId: "E1" })),
    );

    await waitFor(() => {
      expect(result.current.mode).toBe("view");
    });

    mockResolveIds.mockClear();

    act(() => result.current.enterEditMode());

    expect(result.current.mode).toBe("edit-existing");
  });
});
