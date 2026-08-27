import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { groupConfirmedActions } from "../groupActions";
import type { DisplayActionItem, FeedItem } from "../types/actions";

export interface ActivityPage<T> {
  results: T[];
  next: string | null;
}

export interface ActivitySubject<T> {
  /** Changes when the subject changes, resetting accumulated pages. */
  key: string | undefined;
  fetchPage: (url?: string) => Promise<ActivityPage<T>>;
  map: (row: T) => DisplayActionItem;
}

export interface UseActivityResult {
  /** All mapped actions loaded so far, in newest-first order. */
  actions: DisplayActionItem[];
  /** Grouped actions loaded so far, in newest-first order. */
  items: FeedItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  refetch: () => void;
  loadMore: () => void;
}

/** Fetch, accumulate, sort, and group activity pages for any subject. */
export function useActivity<T>(subject: ActivitySubject<T>): UseActivityResult {
  const [rows, setRows] = useState<T[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const requestVersion = useRef(0);

  const fetchPage = useCallback(
    async (url: string | undefined, append: boolean) => {
      const version = ++requestVersion.current;
      if (append) setIsLoadingMore(true);
      else {
        setIsLoading(true);
        setRows([]);
        setNextUrl(null);
      }
      setError(null);

      try {
        const page = await subject.fetchPage(url);
        if (version !== requestVersion.current) return;
        setRows((previous) => (append ? [...previous, ...page.results] : page.results));
        setNextUrl(page.next);
      } catch (err: unknown) {
        if (version !== requestVersion.current) return;
        setError(err instanceof Error ? err.message : "Failed to load activity");
      } finally {
        if (version === requestVersion.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [subject.fetchPage],
  );

  useEffect(() => {
    if (!subject.key) {
      requestVersion.current += 1;
      setRows([]);
      setNextUrl(null);
      setError(null);
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }
    void fetchPage(undefined, false);
  }, [fetchPage, refreshVersion, subject.key]);

  const refetch = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  const loadMore = useCallback(() => {
    if (nextUrl && !isLoading && !isLoadingMore) {
      void fetchPage(nextUrl, true);
    }
  }, [fetchPage, isLoading, isLoadingMore, nextUrl]);

  const actions = useMemo(
    () =>
      rows
        .map(subject.map)
        .filter((action) => action.action !== "read")
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [rows, subject.map],
  );

  const items = useMemo(() => groupConfirmedActions(actions), [actions]);

  return {
    actions,
    items,
    isLoading,
    isLoadingMore,
    error,
    hasMore: nextUrl !== null,
    refetch,
    loadMore,
  };
}
