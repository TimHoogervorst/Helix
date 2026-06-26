import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import type { ViewState } from "../types/lims";
import type { LibraryItem, LibraryEntryItem } from "../types/library";
import { useLibraryView } from "../context/LibraryViewContext";
import { getLibraryContents } from "../api/library";
import LibraryBreadcrumbs from "../components/LibraryBreadcrumbs";
import LibraryTable from "../components/LibraryTable";
import LibraryCollapsedStrip from "../components/LibraryCollapsedStrip";
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
  const [viewState, setViewState] = useState<ViewState>("list");
  const [exiting, setExiting] = useState(false);
  const [detailExiting, setDetailExiting] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);

  // Sync viewState to Layout nav bar via context
  const { setViewState: setContextViewState } = useLibraryView();
  const updateViewState = useCallback(
    (state: ViewState) => {
      setViewState(state);
      setContextViewState(state);
    },
    [setContextViewState],
  );

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

  // ── State machine transitions ──────────────────────────────────────

  const goToList = () => {
    if (viewState === "expanded") {
      setExiting(true);
      setTimeout(() => {
        updateViewState("list");
        setSelectedItem(null);
        setExiting(false);
      }, 250);
    } else if (viewState === "detail") {
      setDetailExiting(true);
      setTimeout(() => {
        updateViewState("list");
        setSelectedItem(null);
        setDetailExiting(false);
      }, 250);
    } else {
      updateViewState("list");
      setSelectedItem(null);
    }
  };

  const goToDetail = (entry: LibraryEntryItem) => {
    setSelectedItem(entry);
    updateViewState("detail");
  };

  const collapseFromExpanded = () => {
    setExiting(true);
    setTimeout(() => {
      updateViewState("detail");
      setExiting(false);
    }, 250);
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
      goToDetail(item);
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

  // ── Compute page-level CSS classes ─────────────────────────────────

  const pageClass =
    `page library-page${viewState === "detail" || viewState === "expanded" ? " has-detail" : ""}${viewState === "expanded" ? " is-expanded" : ""}`;

  const masterDetailClass =
    `library-master-detail${viewState === "detail" ? " has-detail" : ""}${viewState === "expanded" ? " is-expanded" : ""}`;

  const masterPanelClass =
    `library-master-panel${viewState === "expanded" ? " is-collapsed" : ""}`;

  // ── Render ─────────────────────────────────────────────────────────

  if (loading && items.length === 0) {
    return (
      <div className="page">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      {/* Header: Breadcrumbs + New dropdown */}
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

      {error && <div className="error">{error}</div>}

      {/* Master–Detail Layout */}
      <div className={masterDetailClass}>
        {/* Left Panel: Table (or Collapsed Strip) */}
        <div className={masterPanelClass}>
          {viewState === "expanded" ? (
            <LibraryCollapsedStrip onExpand={collapseFromExpanded} />
          ) : (
            <>
              <LibraryTable
                items={items}
                selectedId={selectedItem?.id ?? null}
                onRowClick={handleRowClick}
                onRowExpand={handleRowExpand}
                onFolderNavigate={navigateToFolder}
              />

              {nextUrl && (
                <div className="library-load-more">
                  <button onClick={handleLoadMore} disabled={loading}>
                    {loading ? "Loading…" : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Middle Panel: Detail Card */}
        {selectedItem && (viewState === "detail" || viewState === "expanded") && (
          <LibraryDetailCard
            key={selectedItem.display_id}
            entry={selectedItem}
            viewState={viewState}
            onClose={goToList}
            onCollapse={collapseFromExpanded}
            isDetailExiting={detailExiting}
          />
        )}

        {/* Right Panel: More-Detail (expanded only) */}
        {selectedItem && viewState === "expanded" && (
          <LibraryMoreDetailPanel
            entry={selectedItem}
            isExiting={exiting}
          />
        )}
      </div>
    </div>
  );
}

export default LibraryView;
