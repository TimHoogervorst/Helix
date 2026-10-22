/**
 * useTaggableItems — generic attach/detach hook with optimistic updates,
 * rollback on error, and deferred (local-only) mode.
 *
 * Each consuming mod plugs in two thin API calls (`attachFn`, `detachFn`).
 * In deferred mode, add/remove mutate local state only and the hook
 * exposes `pendingTagIds` for batching in the create payload.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import type { Tag } from "../types";

export interface UseTaggableItemsOptions {
  /** Initial tags to populate the list. */
  initialTags: Tag[];
  /** Attach tags via the mod's API. Not called in deferred mode. */
  attachFn?: (tagIds: number[]) => Promise<void>;
  /** Detach a tag via the mod's API. Not called in deferred mode. */
  detachFn?: (tagId: number) => Promise<void>;
  /** Deferred mode: local-only state, exposes pendingTagIds for batching. */
  deferred?: boolean;
}

export interface UseTaggableItemsReturn {
  tags: Tag[];
  /** Tag IDs that have been added in deferred mode (for batching). */
  pendingTagIds: number[];
  addTag: (tag: Tag) => Promise<void>;
  removeTag: (tagId: number) => Promise<void>;
  /** Reset tags to the initial baseline (e.g., on cancel). */
  resetToBaseline: () => void;
}

export function useTaggableItems({
  initialTags,
  attachFn,
  detachFn,
  deferred = false,
}: UseTaggableItemsOptions): UseTaggableItemsReturn {
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [pendingTagIds, setPendingTagIds] = useState<number[]>([]);

  // Store baseline tags for cancel reset.
  const baselineRef = useRef<Tag[]>(initialTags);

  // Synchronize both membership and server-provided tag details.
  const initialTagKey = JSON.stringify(initialTags);
  useEffect(() => {
    setTags(initialTags);
    baselineRef.current = initialTags;
    // Reset pending IDs when initial tags change (e.g., new entity load).
    setPendingTagIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTagKey]);

  // ── Reset to baseline ──
  const resetToBaseline = useCallback(() => {
    setTags(baselineRef.current);
    setPendingTagIds([]);
  }, []);

  // ── Add tag ──

  const addTag = useCallback(
    async (tag: Tag) => {
      setTags((prev) => {
        if (prev.some((t) => t.id === tag.id)) return prev;
        return [...prev, tag];
      });

      if (deferred) {
        setPendingTagIds((prev) => {
          if (prev.includes(tag.id)) return prev;
          return [...prev, tag.id];
        });
        return;
      }

      if (attachFn) {
        try {
          await attachFn([tag.id]);
        } catch {
          setTags((prev) => prev.filter((t) => t.id !== tag.id));
        }
      }
    },
    [deferred, attachFn],
  );

  // ── Remove tag ──

  const removeTag = useCallback(
    async (tagId: number) => {
      const removed = tags.find((t) => t.id === tagId);
      setTags((prev) => prev.filter((t) => t.id !== tagId));

      if (deferred) {
        setPendingTagIds((prev) => prev.filter((id) => id !== tagId));
        return;
      }

      if (detachFn && removed) {
        try {
          await detachFn(tagId);
        } catch {
          setTags((prev) => [...prev, removed]);
        }
      }
    },
    [deferred, detachFn, tags],
  );

  return {
    tags,
    pendingTagIds,
    addTag,
    removeTag,
    resetToBaseline,
  };
}
