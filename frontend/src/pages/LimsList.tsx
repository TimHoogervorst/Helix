import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { get } from "../api/client";
import type { EntityListItem, PaginatedResponse, ViewState } from "../types/lims";
import { useLimsView } from "../context/LimsViewContext";
import LimsDetailCard from "../components/LimsDetailCard";
import LimsMoreDetailPanel from "../components/LimsMoreDetailPanel";
import LimsCollapsedStrip from "../components/LimsCollapsedStrip";
import ReferenceBadge from "../components/ReferenceBadge";

function LimsList() {
  const [searchParams] = useSearchParams();
  const search = searchParams.get("search") || "";
  const typeFilter = searchParams.get("type") || "";

  const [entities, setEntities] = useState<EntityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityListItem | null>(null);
  const [viewState, setViewState] = useState<ViewState>("list");
  const [exiting, setExiting] = useState(false);

  // Sync viewState to the Layout nav bar via context
  const { setViewState: setContextViewState } = useLimsView();
  const updateViewState = useCallback(
    (state: ViewState) => {
      setViewState(state);
      setContextViewState(state);
    },
    [setContextViewState],
  );

  const fetchEntities = useCallback(
    async (url?: string) => {
      setLoading(true);
      setError(null);
      try {
        const path = url
          ? url.replace("/api", "")
          : `/lims/entities/?search=${encodeURIComponent(search)}&type=${typeFilter}`;
        const data = await get<PaginatedResponse<EntityListItem>>(path);
        if (url) {
          setEntities((prev) => [...prev, ...data.results]);
        } else {
          setEntities(data.results);
        }
        setNextUrl(data.next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [search, typeFilter],
  );

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // ── State machine transitions ──────────────────────────────────────

  const selectEntity = (entity: EntityListItem) => {
    setSelectedId(entity.display_id);
    setSelectedEntity(entity);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedEntity(null);
  };

  const goToList = () => {
    if (viewState === "expanded") {
      setExiting(true);
      setTimeout(() => {
        updateViewState("list");
        clearSelection();
        setExiting(false);
      }, 250);
    } else {
      updateViewState("list");
      clearSelection();
    }
  };

  const goToDetail = (entity: EntityListItem) => {
    selectEntity(entity);
    updateViewState("detail");
  };

  const goToExpanded = (entity: EntityListItem) => {
    selectEntity(entity);
    updateViewState("expanded");
  };

  const expandFromDetail = () => {
    // selectedEntity is already set
    updateViewState("expanded");
  };

  const collapseFromExpanded = () => {
    setExiting(true);
    setTimeout(() => {
      updateViewState("detail");
      setExiting(false);
    }, 250);
  };

  // ── Row click handlers ─────────────────────────────────────────────

  const handleRowClick = (entity: EntityListItem) => {
    if (viewState === "expanded") return; // no row selection in expanded

    if (viewState === "detail" && selectedId === entity.display_id) {
      // Toggle off: clicking selected row returns to list
      goToList();
    } else {
      goToDetail(entity);
    }
  };

  const handleRowExpand = (entity: EntityListItem) => {
    goToExpanded(entity);
  };

  // ── Collapsed strip → detail ───────────────────────────────────────

  const handleStripExpand = () => {
    // Same as collapseFromExpanded — go back to detail
    collapseFromExpanded();
  };

  const handleLoadMore = () => {
    if (nextUrl) fetchEntities(nextUrl);
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleString();

  // ── Compute page-level CSS classes ─────────────────────────────────

  const pageClass =
    `page lims-page${viewState === "detail" || viewState === "expanded" ? " has-detail" : ""}${viewState === "expanded" ? " is-expanded" : ""}`;

  const masterDetailClass =
    `lims-master-detail${viewState === "detail" ? " has-detail" : ""}${viewState === "expanded" ? " is-expanded" : ""}`;

  const masterPanelClass =
    `lims-master-panel${viewState === "expanded" ? " is-collapsed" : ""}`;

  // ── Render ─────────────────────────────────────────────────────────

  if (loading && entities.length === 0) {
    return (
      <div className="page">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      {error && <div className="error">{error}</div>}

      {/* Master–Detail Layout */}
      <div className={masterDetailClass}>
        {/* Left Panel: Entity Table (or Collapsed Strip) */}
        <div className={masterPanelClass}>
          {viewState === "expanded" ? (
            <LimsCollapsedStrip onExpand={handleStripExpand} />
          ) : (
            <>
              <div className="lims-table-container">
                <table className="lims-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Created</th>
                      <th>Source</th>
                      <th className="lims-row-expand-header"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities.length === 0 && (
                      <tr>
                        <td colSpan={6} className="empty">
                          No entities found.
                        </td>
                      </tr>
                    )}
                    {entities.map((entity) => (
                      <tr
                        key={entity.display_id}
                        className={`lims-row${selectedId === entity.display_id ? " is-selected" : ""}`}
                        onClick={() => handleRowClick(entity)}
                      >
                        <td>
                          <ReferenceBadge
                            displayId={entity.display_id}
                            clickable={false}
                            resolved={{
                              displayId: entity.display_id,
                              title: entity.name,
                              type: "entity",
                              id: entity.id,
                              icon: entity.entity_type_icon || "🧪",
                            }}
                          />
                        </td>
                        <td>{entity.name}</td>
                        <td>{entity.entity_type_name}</td>
                        <td className="lims-date">
                          {formatDate(entity.created_at)}
                        </td>
                        <td>
                          {entity.source_entry ? (
                            <ReferenceBadge
                              displayId={`E${entity.source_entry}`}
                              clickable
                            />
                          ) : (
                            <span className="lims-no-source">—</span>
                          )}
                        </td>
                        <td style={{ width: 40, padding: "0.25rem" }}>
                          <button
                            className="lims-row-expand-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowExpand(entity);
                            }}
                            title="Expand to full detail"
                          >
                            &gt;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextUrl && (
                <div className="lims-load-more">
                  <button onClick={handleLoadMore} disabled={loading}>
                    {loading ? "Loading…" : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Middle Panel: Detail Card (summary) */}
        {selectedEntity && (viewState === "detail" || viewState === "expanded") && (
          <LimsDetailCard
            entity={selectedEntity}
            viewState={viewState}
            onClose={goToList}
            onExpand={expandFromDetail}
            onCollapse={collapseFromExpanded}
          />
        )}

        {/* Right Panel: More-Detail (expanded only) */}
        {selectedEntity && viewState === "expanded" && (
          <LimsMoreDetailPanel
            entity={selectedEntity}
            isExiting={exiting}
          />
        )}
      </div>
    </div>
  );
}

export default LimsList;
