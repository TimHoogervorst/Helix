import { useNavigate } from "react-router-dom";
import type { EntryListItem } from "../types";
import { listEntries } from "../api";
import { useConsoleData } from "../../../core/console/useConsoleData";
import { useConsoleView } from "../../../core/console/useConsoleView";
import ConsolePage from "../../../core/console/ConsolePage";
import ElnDetailCard from "./ElnDetailCard";
import ElnTable from "./ElnTable";
import { ModRegistry } from "../../../core/mod-system";

function ElnConsole() {
  const navigate = useNavigate();
  const view = useConsoleView();

  // ── Data hook ─────────────────────────────────────────────────────────

  const data = useConsoleData({
    fetchFn: listEntries,
    getId: (e) => e.id,
    getDisplayId: (e) => e.display_id,
    onSelectResolved: () => view.updateViewState("detail"),
  });

  // ── Registry-driven renderer resolution ───────────────────────────────

  const renderers = ModRegistry.getInstance().resolveWorkspaceRenderers(
    "eln.entry",
    "eln",
  );

  // ── State machine transitions (wrapping shared hooks) ─────────────────

  const goToList = () => {
    view.closeAll();
    data.clearSelection();
  };

  // ── Row click handlers ────────────────────────────────────────────────

  const handleRowClick = (entry: EntryListItem) => {
    const action = data.handleRowClick(entry, view.viewState);
    if (action.type === "select") view.goToDetail();
    else if (action.type === "deselect") goToList();
  };

  const handleRowExpand = (entry: EntryListItem) => {
    navigate(`/eln/${entry.display_id}`);
  };

  // ── Render ────────────────────────────────────────────────────────────

  const DetailComponent = renderers.detailCard;
  const WorkspaceComponent = renderers.workspace;

  return (
    <ConsolePage
      loading={data.loading && data.items.length === 0}
      error={data.error}
      collapsedTitle="Expand entry list"
      table={
        <ElnTable
          entries={data.items}
          selectedId={data.selectedId as number | null}
          onRowClick={handleRowClick}
          onRowExpand={handleRowExpand}
        />
      }
      detail={
        data.selectedItem &&
        (view.viewState === "detail" || view.viewState === "expanded") ? (
          DetailComponent ? (
            <DetailComponent
              entry={data.selectedItem}
              viewState={view.viewState}
              onClose={goToList}
              onCollapse={view.collapseFromExpanded}
            />
          ) : (
            <ElnDetailCard
              entry={data.selectedItem}
              viewState={view.viewState}
              onClose={goToList}
              onCollapse={view.collapseFromExpanded}
            />
          )
        ) : undefined
      }
      workspace={
        data.selectedItem && view.viewState === "expanded" ? (
          WorkspaceComponent ? (
            <WorkspaceComponent
              entry={data.selectedItem}
              isExiting={view.isExiting}
            />
          ) : undefined
        ) : undefined
      }
      hasMore={!!data.nextUrl}
      onLoadMore={data.handleLoadMore}
      loadingMore={data.loading}
    />
  );
}

export default ElnConsole;
