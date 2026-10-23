/**
 * useTagSearch — search + create-new state machine.
 *
 * Manages: query → suggestions, pending name/color/icon state,
 * and the create-on-color-click flow for inline tag creation.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { listTags, createTag } from "../api";
import type { Tag } from "../types";

export interface UseTagSearchOptions {
  /** IDs of tags already attached — filtered out of suggestions. */
  attachedTagIds: number[];
  /** Called after a new tag is created via the create-new flow. */
  onTagCreated?: (tag: Tag) => void;
}

export interface UseTagSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  suggestions: Tag[];
  isSearching: boolean;
  isCreating: boolean;
  pendingName: string | null;
  pendingColor: string;
  pendingIcon: string;
  /** Enter the "create new" state for the given name. */
  startCreate: (name: string) => void;
  /** Create the tag with the chosen colour. Resolves with the new tag or null. */
  pickColor: (color: string) => Promise<Tag | null>;
  /** Change the pending icon before creation. */
  pickIcon: (icon: string) => void;
  /** Cancel tag creation and return to searching. */
  cancelCreate: () => void;
  /** Reset everything back to idle. */
  clearSearch: () => void;
}

export function useTagSearch({
  attachedTagIds,
  onTagCreated,
}: UseTagSearchOptions): UseTagSearchReturn {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [pendingColor, setPendingColor] = useState("muted");
  const [pendingIcon, setPendingIcon] = useState("circle");

  // Track the latest query for race-condition handling.
  const queryRef = useRef(query);
  queryRef.current = query;

  // Attached IDs as a stable Set for filtering.
  const attachedRef = useRef(attachedTagIds);
  attachedRef.current = attachedTagIds;

  // ── Search effect: triggers on query change ──
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    listTags(query)
      .then((results) => {
        if (cancelled) return;
        // Filter out already-attached tags and deduplicate by name.
        const seen = new Set<string>();
        const filtered = results.filter((t) => {
          if (attachedRef.current.includes(t.id)) return false;
          const lower = t.name.toLowerCase();
          if (seen.has(lower)) return false;
          seen.add(lower);
          return true;
        });
        setSuggestions(filtered);
        setIsSearching(false);
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
          setIsSearching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  // ── Create-new flow ──

  const isCreating = pendingName !== null;

  const startCreate = useCallback((name: string) => {
    setPendingName(name);
    setPendingColor("muted");
    setPendingIcon("circle");
    setSuggestions([]);
  }, []);

  const pickIcon = useCallback((icon: string) => {
    setPendingIcon(icon);
  }, []);

  const pickColor = useCallback(
    async (color: string): Promise<Tag | null> => {
      if (!pendingName) return null;
      const name = pendingName;
      const icon = pendingIcon;

      // Clear the pending state immediately so the UI snaps out of
      // the creation flow.
      setPendingName(null);
      setPendingColor("muted");
      setPendingIcon("circle");
      setQuery("");
      setSuggestions([]);

      try {
        // Check for existing tag with same name (dedup).
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

        onTagCreated?.(tag);
        return tag;
      } catch {
        // Restore the create-new state so the user can try again.
        setPendingName(name);
        setPendingColor(color);
        setPendingIcon(icon);
        return null;
      }
    },
    [pendingName, pendingIcon, onTagCreated],
  );

  const cancelCreate = useCallback(() => {
    setPendingName(null);
    setPendingColor("muted");
    setPendingIcon("circle");
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    setSuggestions([]);
    setIsSearching(false);
    setPendingName(null);
    setPendingColor("muted");
    setPendingIcon("circle");
  }, []);

  return {
    query,
    setQuery,
    suggestions,
    isSearching,
    isCreating,
    pendingName,
    pendingColor,
    pendingIcon,
    startCreate,
    pickColor,
    pickIcon,
    cancelCreate,
    clearSearch,
  };
}
