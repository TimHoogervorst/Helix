import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { get } from "../../../api/client";
import type { EntityListItem, PaginatedResponse } from "../types";
import { useConsoleView } from "../../../console/core/useConsoleView";
import ConsolePage from "../../../console/core/ConsolePage";
import LimsDetailCard from "../workspace/LimsDetailCard";
import EntityWorkspace from "../workspace/EntityWorkspace";
import ConsoleMasterPanel, {
  type MasterColumn,
} from "../../../console/core/ConsoleMasterPanel";
import ReferenceBadge from "../../../components/ReferenceBadge";

function LimsConsole() {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = searchParams.get("type") || "";
  const selectId = searchParams.get("select") || "";

  const [entities, setEntities] = useState<EntityListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityListItem | null>(null);

  const navigate = useNavigate();

  const {
    viewState,
    isExiting,
    goToDetail,
    collapseFromExpanded: collapseFromExpandedBase,
    closeAll: closeAllBase,
    updateViewState,
  } = useConsoleView();

  const fetchEntities = useCallback(
    async (url?: string) => {
      setLoading(true);
      setError(null);
      try {
        const path = url
          ? url.replace("/api", "")
          : `/lims/entities/?type=${typeFilter}`;
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
    [typeFilter],
  );

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // ── Auto-select entity when arriving from workspace (via ?select=<display_id>) ──
  useEffect(() => {
    if (!selectId || loading || entities.length === 0) return;

    const target = entities.find((e) => e.display_id === selectId);

    if (target) {
      setSelectedId(target.display_id);
      setSelectedEntity(target);
      updateViewState("detail");
      // Clear the select param so it doesn't stick on refresh / re-navigation
      const next = new URLSearchParams(searchParams);
      next.delete("select");
      setSearchParams(next, { replace: true });
    }
  }, [selectId, loading, entities]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── State machine transitions (wrapping shared hook) ──────────────

  const selectEntity = (entity: EntityListItem) => {
    setSelectedId(entity.display_id);
    setSelectedEntity(entity);
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSelectedEntity(null);
  };

  const goToList = () => {
    closeAllBase(); // handles exit animations internally
    clearSelection();
  };

  const goToDetailForEntity = (entity: EntityListItem) => {
    selectEntity(entity);
    goToDetail();
  };

  const collapseFromExpanded = () => {
    collapseFromExpandedBase();
  };

  // ── Row click handlers ─────────────────────────────────────────────

  const handleRowClick = (entity: EntityListItem) => {
    if (viewState === "expanded") return; // no row selection in expanded

    if (viewState === "detail" && selectedId === entity.display_id) {
      // Toggle off: clicking selected row returns to list
      goToList();
    } else {
      goToDetailForEntity(entity);
    }
  };

  const handleRowExpand = (entity: EntityListItem) => {
    navigate(`/lims/${entity.display_id}`);
  };

  const handleLoadMore = () => {
    if (nextUrl) fetchEntities(nextUrl);
  };

  const LIMS_COLUMNS: MasterColumn[] = [
    { label: "ID" },
    { label: "Name" },
    { label: "Type" },
    { label: "Created" },
    { label: "Source" },
    { className: "console-master-row-expand-header", label: "" },
  ];

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <ConsolePage
      loading={loading && entities.length === 0}
      error={error}
      collapsedTitle="Expand entity list"
      table={
        <ConsoleMasterPanel
          columns={LIMS_COLUMNS}
          colSpan={6}
          itemCount={entities.length}
          emptyMessage="No entities found."
          hasMore={!!nextUrl}
          onLoadMore={handleLoadMore}
          loadingMore={loading}
        >
          {entities.map((entity) => (
            <tr
              key={entity.display_id}
              className={`console-master-row${selectedId === entity.display_id ? " is-selected" : ""}`}
              onClick={() => handleRowClick(entity)}
            >
              <td>
                <ReferenceBadge
                  displayId={entity.display_id}
                  clickable={false}
                  compact={true}
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
              <td className="console-master-date">
                {new Date(entity.created_at).toLocaleString()}
              </td>
              <td>
                {entity.source_entry_display_id ? (
                  <ReferenceBadge
                    displayId={entity.source_entry_display_id}
                    clickable
                  />
                ) : (
                  <span className="lims-no-source">—</span>
                )}
              </td>
              <td style={{ width: 40, padding: "0.25rem" }}>
                <button
                  className="console-master-row-expand-btn"
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
        </ConsoleMasterPanel>
      }
      detail={
        selectedEntity &&
        (viewState === "detail" || viewState === "expanded") ? (
          <LimsDetailCard
            entity={selectedEntity}
            viewState={viewState}
            onClose={goToList}
            onCollapse={collapseFromExpanded}
          />
        ) : undefined
      }
      workspace={
        selectedEntity && viewState === "expanded" ? (
          <EntityWorkspace
            entity={selectedEntity}
            isExiting={isExiting}
          />
        ) : undefined
      }
    />
  );
}

export default LimsConsole;
