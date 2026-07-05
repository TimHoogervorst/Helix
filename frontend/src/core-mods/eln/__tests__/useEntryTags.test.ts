/**
 * Tests for useEntryTags — tag management for ELN entries.
 *
 * Covers: optimistic add/remove with rollback, create+attach,
 * search, icon change, and initial tag sync.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEntryTags, type UseEntryTagsOptions } from "../hooks/useEntryTags";
import type { Tag } from "../types";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockListTags = vi.fn();
const mockCreateTag = vi.fn();
const mockAttachTags = vi.fn();
const mockDetachTag = vi.fn();
const mockUpdateTag = vi.fn();

vi.mock("../api", () => ({
  listTags: (...args: unknown[]) => mockListTags(...args),
  createTag: (...args: unknown[]) => mockCreateTag(...args),
  attachTags: (...args: unknown[]) => mockAttachTags(...args),
  detachTag: (...args: unknown[]) => mockDetachTag(...args),
  updateTag: (...args: unknown[]) => mockUpdateTag(...args),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTag(overrides?: Partial<Tag>): Tag {
  return { id: 1, name: "TestTag", color: "enzyme", icon: "circle", ...overrides };
}

function makeOptions(overrides?: Partial<UseEntryTagsOptions>): UseEntryTagsOptions {
  return {
    isNew: false,
    entryId: "E1",
    initialTags: [],
    ...overrides,
  };
}

describe("useEntryTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListTags.mockReset();
    mockCreateTag.mockReset();
    mockAttachTags.mockReset();
    mockDetachTag.mockReset();
    mockUpdateTag.mockReset();
    // Default: listTags returns empty
    mockListTags.mockResolvedValue([]);
  });

  // ── Initial state ────────────────────────────────────────────────────────

  it("initializes tags from initialTags", () => {
    const initial: Tag[] = [makeTag({ id: 1, name: "A" }), makeTag({ id: 2, name: "B" })];
    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ initialTags: initial })),
    );
    expect(result.current.tags).toEqual(initial);
  });

  it("initializes with empty tags", () => {
    const { result } = renderHook(() => useEntryTags(makeOptions()));
    expect(result.current.tags).toEqual([]);
  });

  // ── addTag ────────────────────────────────────────────────────────────────

  it("addTag optimistically appends a tag", async () => {
    const tag = makeTag({ id: 3, name: "NewTag" });
    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ initialTags: [makeTag({ id: 1 })] })),
    );

    await act(async () => {
      await result.current.addTag(tag);
    });

    expect(result.current.tags).toHaveLength(2);
    expect(result.current.tags[1]).toEqual(tag);
  });

  it("addTag does not duplicate existing tag", async () => {
    const tag = makeTag({ id: 1, name: "Existing" });
    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ initialTags: [tag] })),
    );

    await act(async () => {
      await result.current.addTag(tag);
    });

    expect(result.current.tags).toHaveLength(1);
  });

  it("addTag calls attachTags for existing entries", async () => {
    const tag = makeTag({ id: 3 });
    const onEntryUpdate = vi.fn();
    const updatedEntry = { id: 1, display_id: "E1" } as unknown as import("../types").EntryDetail;
    mockAttachTags.mockResolvedValue(updatedEntry);

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ isNew: false, entryId: "E1", onEntryUpdate })),
    );

    await act(async () => {
      await result.current.addTag(tag);
    });

    expect(mockAttachTags).toHaveBeenCalledWith("E1", [3]);
    expect(onEntryUpdate).toHaveBeenCalledWith(updatedEntry);
  });

  it("addTag does not call attachTags for new entries", async () => {
    const tag = makeTag({ id: 3 });

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ isNew: true, entryId: undefined })),
    );

    await act(async () => {
      await result.current.addTag(tag);
    });

    expect(mockAttachTags).not.toHaveBeenCalled();
    expect(result.current.tags).toContainEqual(tag);
  });

  it("addTag rolls back on attachTags failure", async () => {
    const tag = makeTag({ id: 3 });
    mockAttachTags.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ isNew: false, entryId: "E1" })),
    );

    await act(async () => {
      await result.current.addTag(tag);
    });

    // Tag was optimistically added then rolled back
    expect(result.current.tags).toHaveLength(0);
  });

  // ── removeTag ─────────────────────────────────────────────────────────────

  it("removeTag optimistically removes a tag", async () => {
    const tag1 = makeTag({ id: 1, name: "A" });
    const tag2 = makeTag({ id: 2, name: "B" });

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ initialTags: [tag1, tag2] })),
    );

    await act(async () => {
      await result.current.removeTag(1);
    });

    expect(result.current.tags).toHaveLength(1);
    expect(result.current.tags[0].id).toBe(2);
  });

  it("removeTag calls detachTag for existing entries", async () => {
    const tag = makeTag({ id: 1 });
    const onEntryUpdate = vi.fn();
    const updatedEntry = { id: 1 } as unknown as import("../types").EntryDetail;
    mockDetachTag.mockResolvedValue(updatedEntry);

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ initialTags: [tag], onEntryUpdate })),
    );

    await act(async () => {
      await result.current.removeTag(1);
    });

    expect(mockDetachTag).toHaveBeenCalledWith("E1", 1);
    expect(onEntryUpdate).toHaveBeenCalledWith(updatedEntry);
  });

  it("removeTag rolls back on detachTag failure", async () => {
    const tag = makeTag({ id: 1 });
    mockDetachTag.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ initialTags: [tag], isNew: false, entryId: "E1" })),
    );

    await act(async () => {
      await result.current.removeTag(1);
    });

    // Rolled back — tag is restored
    expect(result.current.tags).toHaveLength(1);
    expect(result.current.tags[0].id).toBe(1);
  });

  // ── searchTags ────────────────────────────────────────────────────────────

  it("searchTags returns empty array for empty query", async () => {
    const { result } = renderHook(() => useEntryTags(makeOptions()));
    const tags = await result.current.searchTags("");
    expect(tags).toEqual([]);
  });

  it("searchTags delegates to listTags API", async () => {
    const results: Tag[] = [makeTag({ id: 5, name: "CRISPR" })];
    mockListTags.mockResolvedValue(results);

    const { result } = renderHook(() => useEntryTags(makeOptions()));
    const tags = await result.current.searchTags("CRISPR");

    expect(mockListTags).toHaveBeenCalledWith("CRISPR");
    expect(tags).toEqual(results);
  });

  it("searchTags returns empty array on error", async () => {
    mockListTags.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() => useEntryTags(makeOptions()));
    const tags = await result.current.searchTags("error");

    expect(tags).toEqual([]);
  });

  // ── createAndAttachTag ────────────────────────────────────────────────────

  it("createAndAttachTag creates a new tag and adds it locally", async () => {
    const newTag = makeTag({ id: 10, name: "NewTag", color: "enzyme", icon: "circle" });
    mockListTags.mockResolvedValue([]);
    mockCreateTag.mockResolvedValue(newTag);

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ isNew: true })),
    );

    let created: Tag | null = null;
    await act(async () => {
      created = await result.current.createAndAttachTag("NewTag", "enzyme", "circle");
    });

    expect(mockListTags).toHaveBeenCalledWith("NewTag");
    expect(mockCreateTag).toHaveBeenCalledWith("NewTag", "enzyme", "circle");
    expect(created).toEqual(newTag);
    expect(result.current.tags).toContainEqual(newTag);
  });

  it("createAndAttachTag reuses existing tag when name matches", async () => {
    const existing = makeTag({ id: 7, name: "Existing", color: "flask", icon: "dna" });
    mockListTags.mockResolvedValue([existing]);

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ isNew: true })),
    );

    let created: Tag | null = null;
    await act(async () => {
      created = await result.current.createAndAttachTag("Existing", "enzyme", "circle");
    });

    expect(mockCreateTag).not.toHaveBeenCalled(); // should reuse existing
    expect(created).toEqual(existing);
    expect(result.current.tags).toContainEqual(existing);
  });

  it("createAndAttachTag attaches to existing entry", async () => {
    const newTag = makeTag({ id: 10, name: "Attached" });
    mockListTags.mockResolvedValue([]);
    mockCreateTag.mockResolvedValue(newTag);

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ isNew: false, entryId: "E1" })),
    );

    await act(async () => {
      await result.current.createAndAttachTag("Attached", "enzyme");
    });

    expect(mockAttachTags).toHaveBeenCalledWith("E1", [10]);
  });

  it("createAndAttachTag returns null on error", async () => {
    mockListTags.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ isNew: true })),
    );

    let created: Tag | null = makeTag();
    await act(async () => {
      created = await result.current.createAndAttachTag("Fail", "enzyme");
    });

    expect(created).toBeNull();
  });

  // ── changeTagIcon ─────────────────────────────────────────────────────────

  it("changeTagIcon updates the tag's icon in local state", async () => {
    const tag = makeTag({ id: 1, icon: "circle" });
    const updated = { ...tag, icon: "dna" };
    mockUpdateTag.mockResolvedValue(updated);

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ initialTags: [tag] })),
    );

    await act(async () => {
      await result.current.changeTagIcon(1, "dna");
    });

    expect(mockUpdateTag).toHaveBeenCalledWith(1, { icon: "dna" });
    expect(result.current.tags[0].icon).toBe("dna");
  });

  it("changeTagIcon ignores errors silently", async () => {
    const tag = makeTag({ id: 1, icon: "circle" });
    mockUpdateTag.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ initialTags: [tag] })),
    );

    // Should not throw
    await act(async () => {
      await result.current.changeTagIcon(1, "dna");
    });

    // Local state unchanged since the update failed
    expect(result.current.tags[0].icon).toBe("circle");
  });

  // ── resetTagsToBaseline ─────────────────────────────────────────────────────

  it("resetTagsToBaseline restores tags to initial baseline", async () => {
    const initial: Tag[] = [makeTag({ id: 1, name: "Original" }), makeTag({ id: 2, name: "AlsoOriginal" })];
    const { result } = renderHook(() =>
      useEntryTags(makeOptions({ initialTags: initial })),
    );

    // Add a tag during edit
    await act(async () => {
      await result.current.addTag(makeTag({ id: 3, name: "Added" }));
    });

    expect(result.current.tags).toHaveLength(3);

    // Reset to baseline (simulates cancel)
    act(() => result.current.resetTagsToBaseline());

    expect(result.current.tags).toEqual(initial);
  });

  it("resetTagsToBaseline tracks latest baseline after initialTags change", async () => {
    const initial1: Tag[] = [makeTag({ id: 1, name: "A" })];
    const initial2: Tag[] = [makeTag({ id: 1, name: "A" }), makeTag({ id: 2, name: "B" })];

    const { result, rerender } = renderHook(
      (props) => useEntryTags(makeOptions(props)),
      { initialProps: { initialTags: initial1 } },
    );

    expect(result.current.tags).toEqual(initial1);

    // Simulate initialTags changing (e.g., entry load)
    rerender(makeOptions({ initialTags: initial2 }));

    // Effect should sync tags and baseline to initial2
    await waitFor(() => {
      expect(result.current.tags).toEqual(initial2);
    });

    // Reset should restore to the latest baseline (initial2)
    act(() => result.current.resetTagsToBaseline());
    expect(result.current.tags).toEqual(initial2);
  });
});
