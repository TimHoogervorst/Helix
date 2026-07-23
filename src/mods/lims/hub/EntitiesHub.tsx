import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  ChevronDown,
  ArrowUpDown,
  LayoutList,
  AlignJustify,
  Columns2,
} from "lucide-react";
import type { SlotContext } from "../../../shell/src/mod-system/types";
import { SlotSidebar } from "../../../shell/src/shared/components/Sidebar/SlotSidebar";
import { WorkspaceBus } from "../../../shell/src/workspace/WorkspaceBus";
import { StatusBadge } from "../../../shell/src/shared/components/StatusBadge";
import { relativeTime } from "../../../shell/src/shared/format";
import { getEntities } from "./api";
import type { EntityHubItem, EntityHubResponse } from "../types";

// ── View mode ──────────────────────────────────────────────────────────────

type ViewMode = "list" | "compact";

const VIEW_MODE_STORAGE_KEY = "helix-entities-view-mode";

function getInitialViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === "list" || stored === "compact") {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR / privacy mode)
  }
  return "list";
}

// ── Pagination size options ────────────────────────────────────────────────

const PAGE_SIZES = [50, 100, 200] as const;

// ── Component ──────────────────────────────────────────────────────────────

function EntitiesHub() {
  const navigate = useNavigate();

  // ── Data state ──────────────────────────────────────────────────────────

  const [data, setData] = useState<EntityHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<number>(50);

  const fetchData = useCallback(async (p: number, s: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getEntities(p, s);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load entities.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(page, size);
  }, [fetchData, page, size]);

  // ── View mode state (persisted to localStorage) ─────────────────────────

  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode);

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // ── Sidebar bus and context ──────────────────────────────────────────────

  const busRef = useRef<WorkspaceBus>(null);
  if (!busRef.current) {
    busRef.current = new WorkspaceBus();
  }
  const bus = busRef.current;

  const sidebarContext: SlotContext = useMemo(
    () => ({
      workspaceId: "entities",
      user: null,
      viewMode,
    }),
    [viewMode],
  );

  // ── Row click → navigate to workspace ────────────────────────────────────

  const handleRowClick = useCallback(
    (item: EntityHubItem) => {
      navigate(`/${item.workspace_id}/${item.display_id}`);
    },
    [navigate],
  );

  // ── Pagination helpers ───────────────────────────────────────────────────

  const totalPages = data ? Math.ceil(data.total / data.size) : 0;

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
  }, []);

  const handleSizeChange = useCallback((s: number) => {
    setSize(s);
    setPage(1);
  }, []);

  // ── Page number range (show max ~7 page buttons) ─────────────────────────

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "...")[] = [];
    if (page <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", totalPages);
    } else if (page >= totalPages - 3) {
      pages.push(
        1,
        "...",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      );
    } else {
      pages.push(1, "...", page - 1, page, page + 1, "...", totalPages);
    }
    return pages;
  }, [totalPages, page]);

  // ── Schema type badge color ──────────────────────────────────────────────

  function schemaTypeClass(schemaTypeId: string): string {
    return schemaTypeId === "eln.entry"
      ? "entities-schema-type-eln"
      : "entities-schema-type-lims";
  }

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="entities-hub">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="entities-hub">
      {/* ── Main column: top bar + filter bar + table + pagination ────────── */}
      <div className="entities-main-column">
        {/* ── Top Bar ────────────────────────────────────────────────────── */}
        <div className="entities-top-bar">
          <div className="entities-breadcrumb">
            <span className="entities-breadcrumb-current">Entities</span>
          </div>

          <div className="entities-top-bar-actions">
            {/* View mode toggle button group — Compact / List only */}
            <div
              className="entities-view-toggle-group"
              role="group"
              aria-label="View mode"
            >
              <button
                className={`entities-view-toggle${viewMode === "compact" ? " is-active" : ""}`}
                title="Compact view"
                type="button"
                onClick={() => handleViewModeChange("compact")}
              >
                <AlignJustify size={15} />
              </button>
              <button
                className={`entities-view-toggle${viewMode === "list" ? " is-active" : ""}`}
                title="List view"
                type="button"
                onClick={() => handleViewModeChange("list")}
              >
                <LayoutList size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Filter Bar ────────────────────────────────────────────────── */}
        <div className="entities-filter-bar">
          <div className="entities-filter-search-wrap">
            <Search size={15} className="entities-filter-search-icon" />
            <input
              className="entities-filter-search"
              type="text"
              placeholder="Search…"
              disabled
            />
          </div>
          <div className="entities-filter-actions">
            <div className="entities-filter-select-wrap">
              <ChevronDown
                size={14}
                className="entities-filter-select-icon"
              />
              <select className="entities-filter-select" disabled>
                <option>Schema</option>
              </select>
            </div>
            <div className="entities-filter-select-wrap">
              <ChevronDown
                size={14}
                className="entities-filter-select-icon"
              />
              <select className="entities-filter-select" disabled>
                <option>Fields</option>
              </select>
            </div>
            <div className="entities-filter-select-wrap">
              <ChevronDown
                size={14}
                className="entities-filter-select-icon"
              />
              <select className="entities-filter-select" disabled>
                <option>Status</option>
              </select>
            </div>
            <button
              className="entities-filter-sort-btn"
              type="button"
              disabled
            >
              <ArrowUpDown size={14} />
              Sort
            </button>
            <button
              className="entities-filter-columns-btn"
              type="button"
              disabled
              title="Column visibility"
            >
              <Columns2 size={14} />
            </button>
          </div>
        </div>

        {/* ── Error state ────────────────────────────────────────────────── */}
        {error && <div className="error">{error}</div>}

        {/* ── Empty state ────────────────────────────────────────────────── */}
        {!error && !loading && data && data.results.length === 0 && (
          <p className="empty">No entities found.</p>
        )}

        {/* ── Data Table ─────────────────────────────────────────────────── */}
        {!error && data && data.results.length > 0 && (
          <>
            <div
              className={`entities-table-wrap view-${viewMode}`}
            >
              <table className="entities-table">
                <thead>
                  <tr>
                    <th className="entities-th entities-col-id">ID</th>
                    <th className="entities-th entities-col-name">Name</th>
                    <th className="entities-th entities-col-schema-type">
                      Schema Type
                    </th>
                    <th className="entities-th entities-col-status">Status</th>
                    <th className="entities-th entities-col-author">Author</th>
                    <th className="entities-th entities-col-updated">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((item) => (
                    <tr
                      key={`${item.schema_type_id}-${item.id}`}
                      className="entities-tr"
                      onClick={() => handleRowClick(item)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRowClick(item);
                        }
                      }}
                    >
                      <td className="entities-td entities-col-id">
                        <span className="entities-display-id">
                          {item.display_id}
                        </span>
                      </td>
                      <td className="entities-td entities-col-name">
                        {item.name}
                      </td>
                      <td className="entities-td entities-col-schema-type">
                        <span
                          className={`entities-schema-type-badge ${schemaTypeClass(item.schema_type_id)}`}
                        >
                          {item.schema_type_display}
                        </span>
                      </td>
                      <td className="entities-td entities-col-status">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="entities-td entities-col-author">
                        {item.author_username ?? "—"}
                      </td>
                      <td className="entities-td entities-col-updated">
                        {relativeTime(item.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ──────────────────────────────────────────────── */}
            <div className="entities-pagination">
              <div className="entities-page-size">
                <label htmlFor="entities-page-size">Show</label>
                <div className="entities-filter-select-wrap">
                  <ChevronDown
                    size={14}
                    className="entities-filter-select-icon"
                  />
                  <select
                    id="entities-page-size"
                    className="entities-filter-select"
                    value={size}
                    onChange={(e) =>
                      handleSizeChange(Number(e.target.value))
                    }
                  >
                    {PAGE_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="entities-page-numbers">
                {pageNumbers.map((p, i) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="entities-page-ellipsis"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      className={`entities-page-btn${p === page ? " is-active" : ""}`}
                      type="button"
                      onClick={() => handlePageChange(p)}
                      disabled={p === page}
                    >
                      {p}
                    </button>
                  ),
                )}
              </div>

              <div className="entities-page-total">
                {data.total} total
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Right Sidebar (slot-driven) ─────────────────────────────────── */}
      <SlotSidebar
        slotId="entities.sidebar"
        context={sidebarContext}
        bus={bus}
      />
    </div>
  );
}

export default EntitiesHub;
