import { useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import type { LibraryItem } from "../types";
import { useConsoleData } from "../../../core/console/useConsoleData";
import { useConsoleView } from "../../../core/console/useConsoleView";
import ConsolePage from "../../../core/console/ConsolePage";
import { getLibraryContents } from "../api";
import Breadcrumbs from "../../../core/console/Breadcrumbs";
import LibraryTable from "./LibraryTable";
import LibraryNewDropdown from "./LibraryNewDropdown";
import { ModRegistry } from "../../../core/mod-system/ModRegistry";

function LibraryConsole() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPath = searchParams.get("path") || "";

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const view = useConsoleView();

  const fetchFn = useCallback(
    async (url?: string) => {
      void refreshKey;
      let response;
      if (url) {
        const urlObj = new URL(url, window.location.origin);
        const page = Number(urlObj.searchParams.get("page") || 2);
        response = await getLibraryContents(currentPath, page);
      } else {
        response = await getLibraryContents(currentPath, undefined);
      }
      setCurrentFolderId(response.current_folder_id);
      return response;
    },
    // refreshKey is captured so that incrementing it triggers a fresh fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPath, refreshKey],
  );

  const data = useConsoleData({
    fetchFn,
    filterKey: "path",
    getId: (item) => item.id,
    getDisplayId: (item) =>
      item.type === "entry" ? item.display_id : "",
    onSelectResolved: () => view.updateViewState("detail"),
  });

  // ── Folder navigation ──────────────────────────────────────────────

  const navigateToPath = (path: string) => {
    setSearchParams(path ? { path } : {});
    view.updateViewState("list");
    data.clearSelection();
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

  // ── State machine transitions ──────────────────────────────────────

  const goToList = () => {
    view.closeAll();
    data.clearSelection();
  };

  // ── Row handlers ───────────────────────────────────────────────────

  const handleRowClick = (item: LibraryItem) => {
    if (item.type === "folder") {
      navigateToFolder(item.name);
      return;
    }

    const action = data.handleRowClick(item, view.viewState);
    if (action.type === "select") view.goToDetail();
    else if (action.type === "deselect") goToList();
  };

  const handleRowExpand = (item: LibraryItem) => {
    if (item.type === "entry") {
      navigate(`/eln/${item.display_id}`);
    }
  };

  // ── Registry-driven renderer resolution ─────────────────────────

  const renderers = ModRegistry.getInstance().resolveWorkspaceRenderers(
    "eln.entry",
    "library",
  );
  const DetailCard = renderers.detailCard;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <ConsolePage
      loading={data.loading && data.items.length === 0}
      error={data.error}
      collapsedTitle="Back to detail"
      header={
        <div className="library-header">
          <Breadcrumbs
            path={currentPath}
            onNavigate={navigateToPath}
            onUp={navigateUp}
          />

          <LibraryNewDropdown
            currentPath={currentPath}
            currentFolderId={currentFolderId}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      }
      table={
        <LibraryTable
          items={data.items}
          selectedId={data.selectedId as number | null}
          onRowClick={handleRowClick}
          onRowExpand={handleRowExpand}
          onFolderNavigate={navigateToFolder}
        />
      }
      detail={
        data.selectedItem &&
        data.selectedItem.type === "entry" &&
        DetailCard &&
        (view.viewState === "detail" || view.viewState === "expanded") ? (
          <DetailCard
            entry={data.selectedItem}
            viewState={view.viewState}
            onClose={goToList}
            onCollapse={view.collapseFromExpanded}
          />
        ) : undefined
      }
      hasMore={!!data.nextUrl}
      onLoadMore={data.handleLoadMore}
      loadingMore={data.loading}
    />
  );
}

export default LibraryConsole;
