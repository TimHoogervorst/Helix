import { useState, useEffect, useCallback } from "react";
import type { TipTapDoc, EntryDetail } from "../types/eln";
import { get } from "../core/api/client";

interface UseContentPreviewResult {
  content: TipTapDoc | null;
  loading: boolean;
  error: string | null;
}

/**
 * Lazy-fetches the full entry detail (including TipTap content) for a
 * given display ID. Used by ElnDetailCard to avoid loading content
 * until an entry row is clicked.
 */
export function useContentPreview(displayId: string | null): UseContentPreviewResult {
  const [content, setContent] = useState<TipTapDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<EntryDetail>(`/eln/entries/${id}/`);
      setContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!displayId) {
      setContent(null);
      setLoading(false);
      setError(null);
      return;
    }

    fetchContent(displayId);
  }, [displayId, fetchContent]);

  return { content, loading, error };
}
