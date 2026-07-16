/**
 * Tests for useTagSearch — search + create-new state machine.
 *
 * Covers: query → suggestions, dedup by name & attached IDs,
 * create-new flow (startCreate → pickIcon → pickColor), cancel,
 * and error handling.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTagSearch } from "../hooks/useTagSearch";
import type { Tag } from "../types";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockListTags = vi.fn();
const mockCreateTag = vi.fn();

vi.mock("../api", () => ({
  listTags: (...args: unknown[]) => mockListTags(...args),
  createTag: (...args: unknown[]) => mockCreateTag(...args),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTag(overrides?: Partial<Tag>): Tag {
  return { id: 1, name: "TestTag", color: "enzyme", icon: "circle", ...overrides };
}

describe("useTagSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListTags.mockReset();
    mockCreateTag.mockReset();
    mockListTags.mockResolvedValue([]);
  });

  // ── Initial state ────────────────────────────────────────────────────────

  it("starts with empty query and no suggestions", () => {
    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    expect(result.current.query).toBe("");
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.isCreating).toBe(false);
    expect(result.current.pendingName).toBeNull();
  });

  // ── Search / suggestions ─────────────────────────────────────────────────

  it("fetches suggestions when query is set", async () => {
    const results: Tag[] = [
      makeTag({ id: 1, name: "CRISPR" }),
      makeTag({ id: 2, name: "qPCR" }),
    ];
    mockListTags.mockResolvedValue(results);

    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    act(() => result.current.setQuery("CR"));

    await waitFor(() => {
      expect(result.current.suggestions).toEqual(results);
    });

    expect(mockListTags).toHaveBeenCalledWith("CR");
  });

  it("filters out attached tags from suggestions", async () => {
    const results: Tag[] = [
      makeTag({ id: 1, name: "CRISPR" }),
      makeTag({ id: 2, name: "qPCR" }),
    ];
    mockListTags.mockResolvedValue(results);

    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [1] }),
    );

    act(() => result.current.setQuery("C"));

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(1);
      expect(result.current.suggestions[0].id).toBe(2);
    });
  });

  it("deduplicates suggestions by name", async () => {
    const results: Tag[] = [
      makeTag({ id: 1, name: "CRISPR" }),
      makeTag({ id: 2, name: "CRISPR" }),
      makeTag({ id: 3, name: "qPCR" }),
    ];
    mockListTags.mockResolvedValue(results);

    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    act(() => result.current.setQuery("C"));

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(2);
    });
  });

  it("clears suggestions when query is empty", async () => {
    mockListTags.mockResolvedValue([makeTag()]);

    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    act(() => result.current.setQuery("test"));
    await waitFor(() => {
      expect(result.current.suggestions.length).toBeGreaterThan(0);
    });

    act(() => result.current.setQuery(""));
    expect(result.current.suggestions).toEqual([]);
  });

  it("handles search errors gracefully", async () => {
    mockListTags.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    act(() => result.current.setQuery("error"));

    await waitFor(() => {
      expect(result.current.suggestions).toEqual([]);
      expect(result.current.isSearching).toBe(false);
    });
  });

  // ── Create-new flow ──────────────────────────────────────────────────────

  it("enters creating state on startCreate", () => {
    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    act(() => result.current.startCreate("NewTag"));

    expect(result.current.isCreating).toBe(true);
    expect(result.current.pendingName).toBe("NewTag");
    expect(result.current.pendingColor).toBe("muted");
    expect(result.current.pendingIcon).toBe("circle");
    expect(result.current.suggestions).toEqual([]);
  });

  it("updates pending icon via pickIcon", () => {
    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    act(() => result.current.startCreate("NewTag"));
    act(() => result.current.pickIcon("dna"));

    expect(result.current.pendingIcon).toBe("dna");
  });

  it("pickColor creates tag and clears state", async () => {
    const newTag = makeTag({ id: 10, name: "NewTag", color: "enzyme", icon: "dna" });
    mockListTags.mockResolvedValue([]);
    mockCreateTag.mockResolvedValue(newTag);

    const onTagCreated = vi.fn();
    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [], onTagCreated }),
    );

    act(() => result.current.startCreate("NewTag"));
    act(() => result.current.pickIcon("dna"));

    let created: Tag | null = null;
    await act(async () => {
      created = await result.current.pickColor("enzyme");
    });

    expect(mockCreateTag).toHaveBeenCalledWith("NewTag", "enzyme", "dna");
    expect(created).toEqual(newTag);
    expect(onTagCreated).toHaveBeenCalledWith(newTag);
    expect(result.current.isCreating).toBe(false);
    expect(result.current.query).toBe("");
  });

  it("pickColor reuses existing tag with same name", async () => {
    const existing = makeTag({ id: 7, name: "Existing", color: "flask", icon: "dna" });
    mockListTags.mockResolvedValue([existing]);

    const onTagCreated = vi.fn();
    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [], onTagCreated }),
    );

    act(() => result.current.startCreate("Existing"));

    let created: Tag | null = null;
    await act(async () => {
      created = await result.current.pickColor("enzyme");
    });

    expect(mockCreateTag).not.toHaveBeenCalled();
    expect(created).toEqual(existing);
    expect(onTagCreated).toHaveBeenCalledWith(existing);
  });

  it("pickColor returns null and restores state on error", async () => {
    mockListTags.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    act(() => result.current.startCreate("Fail"));

    let created: Tag | null = makeTag();
    await act(async () => {
      created = await result.current.pickColor("enzyme");
    });

    expect(created).toBeNull();
    // State should be restored so the user can try again
    expect(result.current.isCreating).toBe(true);
    expect(result.current.pendingName).toBe("Fail");
    expect(result.current.pendingColor).toBe("enzyme");
  });

  it("pickColor returns null when no pending name", async () => {
    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    let created: Tag | null = makeTag();
    await act(async () => {
      created = await result.current.pickColor("enzyme");
    });

    expect(created).toBeNull();
  });

  it("cancelCreate exits creating state", () => {
    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    act(() => result.current.startCreate("NewTag"));
    expect(result.current.isCreating).toBe(true);

    act(() => result.current.cancelCreate());
    expect(result.current.isCreating).toBe(false);
    expect(result.current.pendingName).toBeNull();
  });

  // ── clearSearch ──────────────────────────────────────────────────────────

  it("clearSearch resets everything to idle", async () => {
    mockListTags.mockResolvedValue([makeTag({ id: 1, name: "Test" })]);

    const { result } = renderHook(() =>
      useTagSearch({ attachedTagIds: [] }),
    );

    act(() => result.current.setQuery("test"));
    await waitFor(() => {
      expect(result.current.suggestions.length).toBeGreaterThan(0);
    });

    act(() => result.current.clearSearch());

    expect(result.current.query).toBe("");
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.isCreating).toBe(false);
    expect(result.current.pendingName).toBeNull();
  });
});
