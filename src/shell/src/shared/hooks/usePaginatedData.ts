import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Panel view state for row-click behavior — kept for backward compatibility. */
type PanelViewState = "list" | "detail" | "expanded";

/** Action returned by handleRowClick to signal what the view layer should do. */
interface RowClickAction {
  type: "select" | "deselect" | "none";
}

/** Configuration for the usePaginatedData hook. */
export interface UsePaginatedDataOptions<T> {
  /**
   * Fetch function that returns a paginated response.
   * Called with `undefined` for initial load, with `nextUrl` for pagination.
   * Should be wrapped in useCallback by the consumer to control refetch timing.
   */
  fetchFn: (url?: string) => Promise<{ results: T[]; next: string | null }>;
  /**
   * URL search param name whose value triggers a refetch when changed.
   * For example: `"type"` for LIMS, `"path"` for Library.
   * When omitted, URL param changes do not trigger refetches.
   */
  filterKey?: string;
  /** Extract a unique identifier from an item (used for selection comparison). */
  getId: (item: T) => string | number;
  /** Extract the `display_id` from an item (used for `?select=` matching). */
  getDisplayId: (item: T) => string;
  /** Called when the `?select=` URL param resolves to a matching item. */
  onSelectResolved?: (item: T) => void;
}

/** Return value of the usePaginatedData hook. */
export interface UsePaginatedDataResult<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  nextUrl: string | null;
  selectedId: string | number | null;
  selectedItem: T | null;
  selectItem: (item: T) => void;
  clearSelection: () => void;
  handleRowClick: (item: T, viewState: PanelViewState) => RowClickAction;
  handleLoadMore: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Shared data-fetching and item-selection hook for hub pages.
 *
 * Owns the duplicated ~80 lines of paginated fetching, item selection,
 * `?select=` auto-resolve, and row-click toggle logic that was previously
 * copy-pasted across the old console components.
 */
export function usePaginatedData<T>(
  options: UsePaginatedDataOptions<T>,
): UsePaginatedDataResult<T> {
  const {
    fetchFn,
    filterKey,
    getId,
    getDisplayId,
    onSelectResolved,
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const filterValue = filterKey ? (searchParams.get(filterKey) || "") : "";
  const selectId = searchParams.get("select") || "";

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  // ── Data fetching ────────────────────────────────────────────────────────

  const doFetch = useCallback(
    async (url?: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchFn(url);
        if (url) {
          setItems((prev) => [...prev, ...data.results]);
        } else {
          setItems(data.results);
        }
        setNextUrl(data.next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [fetchFn, filterValue],
  );

  // Auto-fetch on mount and when fetchFn or filterValue changes
  useEffect(() => {
    doFetch();
  }, [doFetch]);

  // ── ?select= auto-resolve ─────────────────────────────────────────────────

  useEffect(() => {
    if (!selectId || loading || items.length === 0) return;

    const target = items.find((item) => getDisplayId(item) === selectId);

    if (target) {
      setSelectedId(getId(target));
      setSelectedItem(target);
      onSelectResolved?.(target);
      // Clear the select param so it doesn't stick on refresh / re-navigation
      const next = new URLSearchParams(searchParams);
      next.delete("select");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams/setSearchParams are stable from react-router
  }, [selectId, loading, items]);

  // ── Selection ────────────────────────────────────────────────────────────

  const selectItem = useCallback(
    (item: T) => {
      setSelectedId(getId(item));
      setSelectedItem(item);
    },
    [getId],
  );

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedItem(null);
  }, []);

  const handleRowClick = useCallback(
    (item: T, viewState: PanelViewState): RowClickAction => {
      // No row selection in expanded mode
      if (viewState === "expanded") return { type: "none" };

      const id = getId(item);

      // Toggle off: clicking the already-selected row in detail view → deselect
      if (viewState === "detail" && selectedId === id) {
        clearSelection();
        return { type: "deselect" };
      }

      // Select and signal that detail should open
      selectItem(item);
      return { type: "select" };
    },
    [selectedId, getId, selectItem, clearSelection],
  );

  const handleLoadMore = useCallback(() => {
    if (nextUrl) doFetch(nextUrl);
  }, [nextUrl, doFetch]);

  return {
    items,
    loading,
    error,
    nextUrl,
    selectedId,
    selectedItem,
    selectItem,
    clearSelection,
    handleRowClick,
    handleLoadMore,
  };
}
