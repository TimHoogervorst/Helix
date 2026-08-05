import { useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Search,
  ChevronDown,
  ArrowUpDown,
  LayoutList,
  LayoutGrid,
  AlignJustify,
} from "lucide-react";
import type { LibraryItem, LibraryEntryItem } from "../types";
import { usePaginatedData } from "../../../shell/src/shared/hooks/usePaginatedData";
import { getLibraryContents } from "../api";
import Breadcrumbs from "../../../shell/src/shared/components/Breadcrumbs";
import type { BreadcrumbSegment } from "../../../shell/src/shared/components/Breadcrumbs";
import LibraryNewDropdown from "./LibraryNewDropdown";
import { BaseCard } from "../../../shell/src/shared/components/BaseCard";
import type { PropertyField } from "../../../shell/src/shared/components/BaseCard";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import type { SlotContext, SchemaColumnDef } from "../../../shell/src/mod-system/types";
import { SlotSidebar } from "../../../shell/src/shared/components/Sidebar/SlotSidebar";
import { WorkspaceBus } from "../../../shell/src/workspace/WorkspaceBus";

// ── View mode ──────────────────────────────────────────────────────────────

type ViewMode = "list" | "grid" | "compact";

const VIEW_MODE_STORAGE_KEY = "helix-library-view-mode";

function getInitialViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === "list" || stored === "grid" || stored === "compact") {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR / privacy mode)
  }
  return "list";
}

// ── Folder-to-entry adapter ────────────────────────────────────────────────

/**
 * Map a LibraryFolderItem to a LibraryEntryItem-compatible shape so
 * BaseCard can render it.  Optional fields are blanked out so only
 * the folder name and icon display.
 */
function folderToEntryShape(folder: {
  type: "folder";
  id: number;
  name: string;
  parent: number | null;
  created_at: string;
}): LibraryEntryItem {
  return {
    type: "entry", // treat as entry for BaseCard compatibility
    id: folder.id,
    workspace_id: "",
    display_id: "",
    title: folder.name,
    folder: folder.parent,
    folder_name: null,
    author_username: null,
    author_info: null,
    status: "",
    description: "",
    tags: [],
    editors: [],
    icon: "folder",
    color: "warn",
    samples_count: null,
    attachments_count: null,
    property_fields: {},
    created_at: folder.created_at,
    updated_at: folder.created_at,
  };
}

// ── Schema column → property field adapter ──────────────────────────────────

/**
 * Convert backend schema column definitions into BaseCard property fields.
 * Each column's name is lowercased for the key so it matches keys in
 * the entry's ``property_fields`` record.
 */
function columnsToPropertyFields(
  columns: SchemaColumnDef[] | undefined,
): PropertyField[] {
  if (!columns || columns.length === 0) return [];
  return columns.map((col) => ({
    key: col.name.toLowerCase().replace(/\s+/g, "_"),
    label: col.name,
  }));
}

// ── Component ───────────────────────────────────────────────────────────────

function LibraryHub() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPath = searchParams.get("path") || "";

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── View mode state (persisted to localStorage) ───────────────────────

  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage unavailable
    }
  }, []);

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

  const data = usePaginatedData({
    fetchFn,
    filterKey: "path",
    getId: (item) => item.id,
    getDisplayId: (item) =>
      item.type === "entry" ? item.display_id : "",
  });

  // ── Sidebar bus and context ────────────────────────────────────────────

  const busRef = useRef<WorkspaceBus>(null);
  if (!busRef.current) {
    busRef.current = new WorkspaceBus();
  }
  const bus = busRef.current;

  const sidebarContext: SlotContext = useMemo(
    () => ({
      workspaceId: "library",
      user: null,
      viewMode,
    }),
    [viewMode],
  );

  // ── Registry-driven card config (generic, from hydrated workspaces) ───

  const registry = useMemo(() => ModRegistry.getInstance(), []);
  const workspaces = useMemo(() => registry.getWorkspaces(), [registry]);

  /**
   * Build the property fields for an entry by looking up its workspace's
   * schema type columns.  Returns an empty array when the workspace or
   * schema type is not yet hydrated.
   */
  const getPropertyFieldsForEntry = useCallback(
    (entry: LibraryEntryItem): PropertyField[] => {
      const ws = workspaces.get(entry.workspace_id);
      return columnsToPropertyFields(ws?.schemaType?.columns);
    },
    [workspaces],
  );

  // ── Folder navigation ─────────────────────────────────────────────────

  const navigateToPath = useCallback(
    (path: string) => {
      setSearchParams(path ? { path } : {});
      data.clearSelection();
    },
    [setSearchParams, data],
  );

  const navigateUp = useCallback(() => {
    const segments = currentPath.split("/").filter(Boolean);
    if (segments.length === 0) return;
    segments.pop();
    const newPath = segments.length === 0 ? "" : `/${segments.join("/")}`;
    navigateToPath(newPath);
  }, [currentPath, navigateToPath]);

  const navigateToFolder = useCallback(
    (folderName: string) => {
      const newPath = currentPath
        ? `${currentPath}/${folderName}`
        : `/${folderName}`;
      navigateToPath(newPath);
    },
    [currentPath, navigateToPath],
  );

  // ── Item click handler ────────────────────────────────────────────────

  const handleItemClick = useCallback(
    (item: LibraryItem) => {
      if (item.type === "folder") {
        navigateToFolder(item.name);
        return;
      }
      // Entry click → navigate to the entry's workspace
      navigate(`/${item.workspace_id}/${item.display_id}`);
    },
    [navigateToFolder, navigate],
  );

  // ── Selection tracking (for visual highlight) ─────────────────────────

  const handleCardClick = useCallback(
    (item: LibraryItem) => {
      data.selectItem(item);
      handleItemClick(item);
    },
    [data, handleItemClick],
  );

  // ── Breadcrumb segments ──────────────────────────────────────────────

  const breadcrumbSegments: BreadcrumbSegment[] = useMemo(() => {
    return currentPath
      .split("/")
      .filter(Boolean)
      .map((label, i, arr) => ({
        label,
        path:
          i < arr.length - 1
            ? `/${arr.slice(0, i + 1).join("/")}`
            : undefined,
      }));
  }, [currentPath]);

  // ── Render helpers ────────────────────────────────────────────────────

  const renderCard = (item: LibraryItem) => {
    if (item.type === "folder") {
      const adapted = folderToEntryShape(item);
      return (
        <BaseCard
          key={`folder-${item.id}`}
          item={adapted}
          viewMode={viewMode}
          isSelected={data.selectedId === item.id}
          iconKey="folder"
          colorKey="warn"
          showDescription={false}
          showTags={false}
          showUpdatedAt={false}
          onClick={() => handleCardClick(item)}
        />
      );
    }

    // Entry item — build card config from workspace schema columns
    const isSelected = data.selectedId === item.id;
    const propertyFields = getPropertyFieldsForEntry(item);

    return (
      <BaseCard
        key={`entry-${item.id}`}
        item={item}
        viewMode={viewMode}
        isSelected={isSelected}
        iconKey={item.icon || "file-text"}
        colorKey={item.color || "primary"}
        propertyFields={propertyFields}
        showDescription={true}
        showTags={true}
        showUpdatedAt={true}
        onClick={() => handleCardClick(item)}
      />
    );
  };

  // ── Loading state ─────────────────────────────────────────────────────

  if (data.loading && data.items.length === 0) {
    return (
      <div className="library-hub">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="library-hub">
      {/* ── Main column: top bar + filter bar + card list ──────────────── */}
      <div className="library-main-column">
        {/* ── Top Bar ────────────────────────────────────────────────── */}
        <div className="library-top-bar">
          <Breadcrumbs
            segments={breadcrumbSegments}
            onNavigate={navigateToPath}
            onUp={navigateUp}
          />

          <div className="library-top-bar-actions">
            {/* View mode toggle button group */}
            <div
              className="library-view-toggle-group"
              role="group"
              aria-label="View mode"
            >
              <button
                className={`library-view-toggle${viewMode === "compact" ? " is-active" : ""}`}
                title="Compact view"
                type="button"
                onClick={() => handleViewModeChange("compact")}
              >
                <AlignJustify size={15} />
              </button>
              <button
                className={`library-view-toggle${viewMode === "list" ? " is-active" : ""}`}
                title="List view"
                type="button"
                onClick={() => handleViewModeChange("list")}
              >
                <LayoutList size={15} />
              </button>
              <button
                className={`library-view-toggle${viewMode === "grid" ? " is-active" : ""}`}
                title="Grid view"
                type="button"
                onClick={() => handleViewModeChange("grid")}
              >
                <LayoutGrid size={15} />
              </button>
            </div>

            <button
              className="library-export-btn"
              title="Export"
              type="button"
              disabled
            >
              Export
            </button>

            <LibraryNewDropdown
              currentPath={currentPath}
              currentFolderId={currentFolderId}
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        </div>

        {/* ── Filter Bar ─────────────────────────────────────────────── */}
        <div className="library-filter-bar">
          <div className="library-filter-search-wrap">
            <Search size={15} className="library-filter-search-icon" />
            <input
              className="library-filter-search"
              type="text"
              placeholder="Search…"
              disabled
            />
          </div>
          <div className="library-filter-actions">
            <div className="library-filter-select-wrap">
              <ChevronDown size={14} className="library-filter-select-icon" />
              <select className="library-filter-select" disabled>
                <option>Type</option>
              </select>
            </div>
            <div className="library-filter-select-wrap">
              <ChevronDown size={14} className="library-filter-select-icon" />
              <select className="library-filter-select" disabled>
                <option>Status</option>
              </select>
            </div>
            <div className="library-filter-select-wrap">
              <ChevronDown size={14} className="library-filter-select-icon" />
              <select className="library-filter-select" disabled>
                <option>Owner</option>
              </select>
            </div>
            <div className="library-filter-select-wrap">
              <ChevronDown size={14} className="library-filter-select-icon" />
              <select className="library-filter-select" disabled>
                <option>Time</option>
              </select>
            </div>
            <button
              className="library-filter-sort-btn"
              type="button"
              disabled
            >
              <ArrowUpDown size={14} />
              Last updated
            </button>
          </div>
        </div>

        {/* Card List */}
        <div className={`library-card-list view-${viewMode}`}>
          {data.error && <div className="error">{data.error}</div>}

          {!data.error &&
            !data.loading &&
            data.items.length === 0 && (
              <p className="empty">This folder is empty.</p>
            )}

          {/* Table header */}
          {!data.error && data.items.length > 0 && (
            <div className="library-table-header">
              <span className="library-table-header-col type-col">Type</span>
              <span className="library-table-header-col item-col">Item</span>
              <span className="library-table-header-col owners-col">Owners</span>
            </div>
          )}

          {data.items.map(renderCard)}

          {data.nextUrl && (
            <div className="hub-load-more">
              <button
                onClick={data.handleLoadMore}
                disabled={data.loading}
              >
                {data.loading ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Sidebar (slot-driven, full height, alongside everything) ── */}
      <SlotSidebar
        slotId="library.sidebar"
        context={sidebarContext}
        bus={bus}
      />
    </div>
  );
}

export default LibraryHub;
