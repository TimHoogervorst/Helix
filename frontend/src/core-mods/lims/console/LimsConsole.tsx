import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { get } from "../../../core/api/client";
import type { EntityListItem, PaginatedResponse } from "../types";
import { usePaginatedData } from "../../../shared/hooks/usePaginatedData";
import { useConsoleView } from "../../../core/console/useConsoleView";
import ConsolePage from "../../../core/console/ConsolePage";
import LimsDetailCard from "./LimsDetailCard";
import LimsWorkspace from "../workspace/LimsWorkspace";
import LimsTable from "./LimsTable";

function LimsConsole() {
  const [searchParams] = useSearchParams();
  const typeFilter = searchParams.get("type") || "";

  const view = useConsoleView();

  const fetchEntities = useCallback(
    async (url?: string) => {
      const path = url
        ? url.replace("/api", "")
        : `/lims/entities/?type=${typeFilter}`;
      return get<PaginatedResponse<EntityListItem>>(path);
    },
    [typeFilter],
  );

  // ── Data hook ─────────────────────────────────────────────────────────

  const data = usePaginatedData({
    fetchFn: fetchEntities,
    filterKey: "type",
    getId: (e) => e.display_id,
    getDisplayId: (e) => e.display_id,
    onSelectResolved: () => view.updateViewState("detail"),
  });

  // ── State machine transitions (wrapping shared hooks) ─────────────────

  const goToList = () => {
    view.closeAll();
    data.clearSelection();
  };

  // ── Row click handlers ────────────────────────────────────────────────

  const handleRowClick = (entity: EntityListItem) => {
    const action = data.handleRowClick(entity, view.viewState);
    if (action.type === "select") view.goToDetail();
    else if (action.type === "deselect") goToList();
  };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <ConsolePage
      loading={data.loading && data.items.length === 0}
      error={data.error}
      collapsedTitle="Expand entity list"
      table={
        <LimsTable
          entities={data.items}
          selectedId={data.selectedId as string | null}
          nextUrl={data.nextUrl}
          onRowClick={handleRowClick}
          onLoadMore={data.handleLoadMore}
          loadingMore={data.loading}
        />
      }
      detail={
        data.selectedItem &&
        (view.viewState === "detail" || view.viewState === "expanded") ? (
          <LimsDetailCard
            entity={data.selectedItem}
            viewState={view.viewState}
            onClose={goToList}
            onCollapse={view.collapseFromExpanded}
          />
        ) : undefined
      }
      workspace={
        data.selectedItem && view.viewState === "expanded" ? (
          <LimsWorkspace
            entity={data.selectedItem}
            isExiting={view.isExiting}
          />
        ) : undefined
      }
    />
  );
}

export default LimsConsole;
