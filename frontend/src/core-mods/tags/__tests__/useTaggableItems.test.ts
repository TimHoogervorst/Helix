/**
 * Tests for useTaggableItems — generic attach/detach hook with
 * optimistic updates, rollback, and deferred mode.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useTaggableItems } from "../hooks/useTaggableItems";
import type { Tag } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTag(overrides?: Partial<Tag>): Tag {
  return { id: 1, name: "TestTag", color: "enzyme", icon: "circle", ...overrides };
}

describe("useTaggableItems", () => {
  // ── Non-deferred mode ────────────────────────────────────────────────────

  describe("non-deferred mode", () => {
    it("initializes tags from initialTags", () => {
      const initial = [makeTag({ id: 1 }), makeTag({ id: 2 })];
      const { result } = renderHook(() =>
        useTaggableItems({ initialTags: initial }),
      );
      expect(result.current.tags).toEqual(initial);
    });

    it("addTag optimistically appends a tag", async () => {
      const attachFn = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useTaggableItems({
          initialTags: [makeTag({ id: 1 })],
          attachFn,
        }),
      );

      const newTag = makeTag({ id: 3 });
      await act(async () => {
        await result.current.addTag(newTag);
      });

      expect(result.current.tags).toHaveLength(2);
      expect(result.current.tags[1]).toEqual(newTag);
      expect(attachFn).toHaveBeenCalledWith([3]);
    });

    it("addTag does not duplicate existing tag in local state", async () => {
      const tag = makeTag({ id: 1 });
      const attachFn = vi.fn().mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useTaggableItems({ initialTags: [tag], attachFn }),
      );

      await act(async () => {
        await result.current.addTag(tag);
      });

      // Local state should not duplicate
      expect(result.current.tags).toHaveLength(1);
    });

    it("addTag rolls back on attachFn failure", async () => {
      const attachFn = vi.fn().mockRejectedValue(new Error("Network error"));
      const { result } = renderHook(() =>
        useTaggableItems({ initialTags: [], attachFn }),
      );

      await act(async () => {
        await result.current.addTag(makeTag({ id: 3 }));
      });

      expect(result.current.tags).toHaveLength(0);
    });

    it("removeTag optimistically removes a tag", async () => {
      const detachFn = vi.fn().mockResolvedValue(undefined);
      const tag1 = makeTag({ id: 1 });
      const tag2 = makeTag({ id: 2 });

      const { result } = renderHook(() =>
        useTaggableItems({ initialTags: [tag1, tag2], detachFn }),
      );

      await act(async () => {
        await result.current.removeTag(1);
      });

      expect(result.current.tags).toHaveLength(1);
      expect(result.current.tags[0].id).toBe(2);
      expect(detachFn).toHaveBeenCalledWith(1);
    });

    it("removeTag rolls back on detachFn failure", async () => {
      const detachFn = vi.fn().mockRejectedValue(new Error("Network error"));
      const tag = makeTag({ id: 1 });

      const { result } = renderHook(() =>
        useTaggableItems({ initialTags: [tag], detachFn }),
      );

      await act(async () => {
        await result.current.removeTag(1);
      });

      expect(result.current.tags).toHaveLength(1);
      expect(result.current.tags[0].id).toBe(1);
    });

    it("works without attachFn/detachFn (local-only without deferred)", async () => {
      const { result } = renderHook(() =>
        useTaggableItems({ initialTags: [] }),
      );

      await act(async () => {
        await result.current.addTag(makeTag({ id: 1 }));
      });

      expect(result.current.tags).toHaveLength(1);
      // No API call made, no error thrown
    });

    // ── resetToBaseline ────────────────────────────────────────────────────

    it("resetToBaseline restores tags to initial baseline", async () => {
      const initial = [makeTag({ id: 1 }), makeTag({ id: 2 })];
      const { result } = renderHook(() =>
        useTaggableItems({ initialTags: initial }),
      );

      await act(async () => {
        await result.current.addTag(makeTag({ id: 3 }));
      });
      expect(result.current.tags).toHaveLength(3);

      act(() => result.current.resetToBaseline());
      expect(result.current.tags).toEqual(initial);
    });

    it("resetToBaseline tracks latest baseline after initialTags change", async () => {
      const initial1 = [makeTag({ id: 1 })];
      const initial2 = [makeTag({ id: 1 }), makeTag({ id: 2 })];

      const { result, rerender } = renderHook(
        (props) => useTaggableItems(props),
        { initialProps: { initialTags: initial1 } },
      );

      rerender({ initialTags: initial2 });

      await waitFor(() => {
        expect(result.current.tags).toEqual(initial2);
      });

      act(() => result.current.resetToBaseline());
      expect(result.current.tags).toEqual(initial2);
    });
  });

  // ── Deferred mode ────────────────────────────────────────────────────────

  describe("deferred mode", () => {
    it("addTag updates local state but does not call attachFn", async () => {
      const attachFn = vi.fn();
      const { result } = renderHook(() =>
        useTaggableItems({
          initialTags: [],
          attachFn,
          deferred: true,
        }),
      );

      await act(async () => {
        await result.current.addTag(makeTag({ id: 1 }));
      });

      expect(result.current.tags).toHaveLength(1);
      expect(attachFn).not.toHaveBeenCalled();
      expect(result.current.pendingTagIds).toEqual([1]);
    });

    it("removeTag updates local state but does not call detachFn", async () => {
      const detachFn = vi.fn();
      const tag = makeTag({ id: 1 });
      const { result } = renderHook(() =>
        useTaggableItems({
          initialTags: [tag],
          detachFn,
          deferred: true,
        }),
      );

      await act(async () => {
        await result.current.removeTag(1);
      });

      expect(result.current.tags).toHaveLength(0);
      expect(detachFn).not.toHaveBeenCalled();
      expect(result.current.pendingTagIds).toEqual([]);
    });

    it("pendingTagIds tracks added tags", async () => {
      const { result } = renderHook(() =>
        useTaggableItems({
          initialTags: [makeTag({ id: 1 })],
          deferred: true,
        }),
      );

      await act(async () => {
        await result.current.addTag(makeTag({ id: 2 }));
      });
      await act(async () => {
        await result.current.addTag(makeTag({ id: 3 }));
      });

      expect(result.current.pendingTagIds).toEqual([2, 3]);
    });

    it("pendingTagIds removes tags on remove", async () => {
      const { result } = renderHook(() =>
        useTaggableItems({
          initialTags: [],
          deferred: true,
        }),
      );

      await act(async () => {
        await result.current.addTag(makeTag({ id: 1 }));
        await result.current.addTag(makeTag({ id: 2 }));
      });

      await act(async () => {
        await result.current.removeTag(1);
      });

      expect(result.current.pendingTagIds).toEqual([2]);
    });

    it("resetToBaseline clears pendingTagIds", async () => {
      const { result } = renderHook(() =>
        useTaggableItems({
          initialTags: [makeTag({ id: 1 })],
          deferred: true,
        }),
      );

      await act(async () => {
        await result.current.addTag(makeTag({ id: 2 }));
      });

      act(() => result.current.resetToBaseline());
      expect(result.current.pendingTagIds).toEqual([]);
      expect(result.current.tags).toEqual([makeTag({ id: 1 })]);
    });

    it("pendingTagIds does not duplicate", async () => {
      const { result } = renderHook(() =>
        useTaggableItems({
          initialTags: [],
          deferred: true,
        }),
      );

      const tag = makeTag({ id: 1 });
      await act(async () => {
        await result.current.addTag(tag);
        await result.current.addTag(tag);
      });

      expect(result.current.pendingTagIds).toEqual([1]);
    });
  });
});
