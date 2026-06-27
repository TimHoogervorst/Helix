import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import type { LibraryItem, LibraryEntryItem } from "../types/library";
import { useConsoleView } from "../console/core/useConsoleView";
import ConsolePage from "../console/core/ConsolePage";
import { getLibraryContents } from "../api/library";
import LibraryBreadcrumbs from "../components/LibraryBreadcrumbs";
import LibraryTable from "../components/LibraryTable";
import LibraryNewDropdown from "../components/LibraryNewDropdown";
import LibraryDetailCard from "../components/LibraryDetailCard";
import LibraryMoreDetailPanel from "../components/LibraryMoreDetailPanel";

function LibraryView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPath = searchParams.get("path") || "";
  const search = searchParams.get("search") || "";
  const selectId = searchParams.get("select") || "";

  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<LibraryEntryItem | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);

  const {
    viewState,
    isExiting,
    isDetailExiting,
    goToDetail,
    collapseFromExpanded: collapseFromExpandedBase,
    closeAll: closeAllBase,
    updateViewState,
  } = useConsoleView();

  const fetchItems = useCallback(
    async (page?: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await getLibraryContents(currentPath, page, search || undefined);
        if (page && page > 1) {
          setItems((prev) => [...prev, ...data.results]);
        } else {
          setItems(data.results);
        }
        setNextUrl(data.next);
        setCurrentFolderId(data.current_folder_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [currentPath, search],
  );

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ── Auto-select entry when arriving from ELN (via ?select=<display_id>) ──
  useEffect(() => {
    if (!selectId || loading || items.length === 0) return;

    const target = items.find(
      (item): item is LibraryEntryItem =>
        item.type === "entry" && item.display_id === selectId,
    );

    if (target) {
      setSelectedItem(target);
      updateViewState("detail");
      // Clear the select param so it doesn't stick on refresh / re-navigation
      const next = new URLSearchParams(searchParams);
      next.delete("select");
      setSearchParams(next, { replace: true });
    }
  }, [selectId, loading, items]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── State machine transitions (wrapping shared hook) ──────────────

  const goToList = () => {
    closeAllBase(); // handles exit animations internally
    setSelectedItem(null);
  };

  const goToDetailForEntry = (entry: LibraryEntryItem) => {
    setSelectedItem(entry);
    goToDetail();
  };

  const collapseFromExpanded = () => {
    collapseFromExpandedBase();
  };

  // ── Folder navigation ──────────────────────────────────────────────

  const navigateToPath = (path: string) => {
    setSearchParams(path ? { path } : {});
    updateViewState("list");
    setSelectedItem(null);
  };

  const navigateUp = () => {
    const segments = currentPath.split("/").filter(Boolean);
    if (segments.length === 0) return;
    segments.pop();
    const newPath = segments.length === 0 ? "" : `/${segments.join("/")}`;
    navigateToPath(newPath);
  };

  const navigateToFolder = (folderName: string) => {
    const newPath = currentPath
      ? `${currentPath}/${folderName}`
      : `/${folderName}`;
    navigateToPath(newPath);
  };

  // ── Row handlers ───────────────────────────────────────────────────

  const handleRowClick = (item: LibraryItem) => {
    if (viewState === "expanded") return;

    if (item.type === "folder") {
      navigateToFolder(item.name);
      return;
    }

    if (viewState === "detail" && selectedItem?.id === item.id) {
      goToList();
    } else {
      goToDetailForEntry(item);
    }
  };

  const handleRowExpand = (item: LibraryItem) => {
    if (item.type === "entry") {
      navigate(`/eln/${item.display_id}`);
    }
  };

  const handleLoadMore = () => {
    if (nextUrl) {
      const url = new URL(nextUrl, window.location.origin);
      const page = Number(url.searchParams.get("page") || 2);
      fetchItems(page);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <ConsolePage
      loading={loading && items.length === 0}
      error={error}
      collapsedTitle="Back to detail"
      header={
        <div className="library-header">
          <LibraryBreadcrumbs
            path={currentPath}
            onNavigate={navigateToPath}
            onUp={navigateUp}
          />

          <LibraryNewDropdown
            currentPath={currentPath}
            currentFolderId={currentFolderId}
            onCreated={fetchItems}
          />
        </div>
      }
      table={
        <LibraryTable
          items={items}
          selectedId={selectedItem?.id ?? null}
          onRowClick={handleRowClick}
          onRowExpand={handleRowExpand}
          onFolderNavigate={navigateToFolder}
        />
      }
      hasMore={!!nextUrl}
      onLoadMore={handleLoadMore}
      loadingMore={loading}
      detail={
        selectedItem &&
        (viewState === "detail" || viewState === "expanded") ? (
          <LibraryDetailCard
            key={selectedItem.display_id}
            entry={selectedItem}
            viewState={viewState}
            onClose={goToList}
            onCollapse={collapseFromExpanded}
            isDetailExiting={isDetailExiting}
          />
        ) : undefined
      }
      workspace={
        selectedItem && viewState === "expanded" ? (
          <LibraryMoreDetailPanel
            entry={selectedItem}
            isExiting={isExiting}
          />
        ) : undefined
      }
    />
  );
}

export default LibraryView;
