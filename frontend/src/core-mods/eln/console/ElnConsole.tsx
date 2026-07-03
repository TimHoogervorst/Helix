import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import type { EntryListItem } from "../types";
import { listEntries } from "../api";
import { useConsoleView } from "../../../core/console/useConsoleView";
import ConsolePage from "../../../core/console/ConsolePage";
import ElnDetailCard from "./ElnDetailCard";
import ElnTable from "./ElnTable";
import { ModRegistry } from "../../../core/mod-system";

function ElnConsole() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectId = searchParams.get("select") || "";

  const [entries, setEntries] = useState<EntryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<EntryListItem | null>(null);

  const navigate = useNavigate();

  const {
    viewState,
    isExiting,
    goToDetail,
    collapseFromExpanded: collapseFromExpandedBase,
    closeAll: closeAllBase,
    updateViewState,
  } = useConsoleView();

  const fetchEntries = useCallback(
    async (url?: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listEntries(url);
        if (url) {
          setEntries((prev) => [...prev, ...data.results]);
        } else {
          setEntries(data.results);
        }
        setNextUrl(data.next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // ── Auto-select entry when arriving from workspace (via ?select=<display_id>) ──
  useEffect(() => {
    if (!selectId || loading || entries.length === 0) return;

    const target = entries.find((e) => e.display_id === selectId);

    if (target) {
      setSelectedId(target.id);
      setSelectedEntry(target);
      updateViewState("detail");
      const next = new URLSearchParams(searchParams);
      next.delete("select");
      setSearchParams(next, { replace: true });
    }
  }, [selectId, loading, entries]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Registry-driven renderer resolution ──────────────────────────────
  const renderers = ModRegistry.getInstance().resolveWorkspaceRenderers("eln.entry", "eln");

  // ── State machine transitions ────────────────────────────────────────

  const selectEntry = (entry: EntryListItem) => {
    setSelectedId(entry.id);
    setSelectedEntry(entry);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedEntry(null);
  };

  const goToList = () => {
    closeAllBase();
    clearSelection();
  };

  const goToDetailForEntry = (entry: EntryListItem) => {
    selectEntry(entry);
    goToDetail();
  };

  const collapseFromExpanded = () => {
    collapseFromExpandedBase();
  };

  // ── Row click handlers ─────────────────────────────────────────────

  const handleRowClick = (entry: EntryListItem) => {
    if (viewState === "expanded") return;

    if (viewState === "detail" && selectedId === entry.id) {
      goToList();
    } else {
      goToDetailForEntry(entry);
    }
  };

  const handleRowExpand = (entry: EntryListItem) => {
    navigate(`/eln/${entry.display_id}`);
  };

  const handleLoadMore = () => {
    if (nextUrl) fetchEntries(nextUrl);
  };

  // ── Render ─────────────────────────────────────────────────────────

  const DetailComponent = renderers.detailCard;
  const WorkspaceComponent = renderers.workspace;

  return (
    <ConsolePage
      loading={loading && entries.length === 0}
      error={error}
      collapsedTitle="Expand entry list"
      table={
        <ElnTable
          entries={entries}
          selectedId={selectedId}
          onRowClick={handleRowClick}
          onRowExpand={handleRowExpand}
        />
      }
      detail={
        selectedEntry &&
        (viewState === "detail" || viewState === "expanded") ? (
          DetailComponent ? (
            <DetailComponent
              entry={selectedEntry}
              viewState={viewState}
              onClose={goToList}
              onCollapse={collapseFromExpanded}
            />
          ) : (
            <ElnDetailCard
              entry={selectedEntry}
              viewState={viewState}
              onClose={goToList}
              onCollapse={collapseFromExpanded}
            />
          )
        ) : undefined
      }
      workspace={
        selectedEntry && viewState === "expanded" ? (
          WorkspaceComponent ? (
            <WorkspaceComponent
              entry={selectedEntry}
              isExiting={isExiting}
            />
          ) : undefined
        ) : undefined
      }
      hasMore={!!nextUrl}
      onLoadMore={handleLoadMore}
      loadingMore={loading}
    />
  );
}

export default ElnConsole;
