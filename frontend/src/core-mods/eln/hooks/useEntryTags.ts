/**
 * useEntryTags — tag management for ELN entries.
 *
 * Owns: tag list state, optimistic attach/detach with rollback,
 * tag search, create-and-attach flow, and icon changes.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { listTags, createTag, attachTags, detachTag, updateTag } from "../api";
import type { EntryDetail, Tag } from "../types";

export interface UseEntryTagsOptions {
  /** Whether this is a new (unsaved) entry. */
  isNew: boolean;
  /** Entry display ID — required for backend tag operations on existing entries. */
  entryId?: string;
  /** Initial tags to populate the list (e.g. from a loaded entry). */
  initialTags: Tag[];
  /** Called after attachTags/detachTag succeeds so the CRUD hook can sync its entry state. */
  onEntryUpdate?: (entry: EntryDetail) => void;
}

export interface UseEntryTagsReturn {
  tags: Tag[];
  addTag: (tag: Tag) => Promise<void>;
  removeTag: (tagId: number) => Promise<void>;
  createAndAttachTag: (name: string, color: string, icon?: string) => Promise<Tag | null>;
  changeTagIcon: (tagId: number, icon: string) => Promise<void>;
  searchTags: (query: string) => Promise<Tag[]>;
  /** Reset tags to the initial baseline (used on cancel). */
  resetTagsToBaseline: () => void;
}

export function useEntryTags({
  isNew,
  entryId,
  initialTags,
  onEntryUpdate,
}: UseEntryTagsOptions): UseEntryTagsReturn {
  const [tags, setTags] = useState<Tag[]>(initialTags);

  // Store baseline tags for cancel reset.
  const baselineRef = useRef<Tag[]>(initialTags);

  // Derive a stable key from tag IDs so the effect only fires when
  // the tag set actually changes, not on every re-render.
  const initialTagIds = initialTags.map((t) => t.id).sort((a, b) => a - b).join(",");
  useEffect(() => {
    setTags(initialTags);
    baselineRef.current = initialTags;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTagIds]);

  // ── Reset tags to baseline (called on cancel) ──
  const resetTagsToBaseline = useCallback(() => {
    setTags(baselineRef.current);
  }, []);

  // ── Attach an existing tag (optimistic with rollback) ──
  const addTag = useCallback(async (tag: Tag) => {
    setTags((prev) => {
      if (prev.some((t) => t.id === tag.id)) return prev;
      return [...prev, tag];
    });

    if (!isNew && entryId) {
      try {
        const updated = await attachTags(entryId, [tag.id]);
        onEntryUpdate?.(updated);
      } catch {
        setTags((prev) => prev.filter((t) => t.id !== tag.id));
      }
    }
  }, [isNew, entryId, onEntryUpdate]);

  // ── Detach a tag (optimistic with rollback) ──
  const removeTag = useCallback(async (tagId: number) => {
    const removed = tags.find((t) => t.id === tagId);
    setTags((prev) => prev.filter((t) => t.id !== tagId));

    if (!isNew && entryId && removed) {
      try {
        const updated = await detachTag(entryId, tagId);
        onEntryUpdate?.(updated);
      } catch {
        setTags((prev) => [...prev, removed]);
      }
    }
  }, [isNew, entryId, tags, onEntryUpdate]);

  // ── Search existing tags ──
  const searchTags = useCallback(async (query: string): Promise<Tag[]> => {
    if (!query.trim()) return [];
    try {
      return await listTags(query);
    } catch {
      return [];
    }
  }, []);

  // ── Create a new tag and attach it ──
  const createAndAttachTag = useCallback(async (
    name: string,
    color: string,
    icon?: string,
  ): Promise<Tag | null> => {
    try {
      // Check for existing tag with same name
      const existingList = await listTags(name);
      const exactMatch = existingList.find(
        (t) => t.name.toLowerCase() === name.toLowerCase(),
      );

      let tag: Tag;
      if (exactMatch) {
        tag = exactMatch;
      } else {
        tag = await createTag(name, color, icon);
      }

      if (!isNew && entryId) {
        await attachTags(entryId, [tag.id]);
      }
      setTags((prev) => [...prev, tag]);
      return tag;
    } catch {
      return null;
    }
  }, [isNew, entryId]);

  // ── Change a tag's icon ──
  const changeTagIcon = useCallback(async (tagId: number, icon: string) => {
    try {
      const updated = await updateTag(tagId, { icon });
      setTags((prev) => prev.map((t) => (t.id === tagId ? updated : t)));
    } catch {
      // Silently ignore — no rollback needed
    }
  }, []);

  return {
    tags,
    addTag,
    removeTag,
    createAndAttachTag,
    changeTagIcon,
    searchTags,
    resetTagsToBaseline,
  };
}
