import type { ReactNode } from "react";
import { useConsoleView } from "./useConsoleView";
import { useConsole } from "./ConsoleContext";
import ConsoleCollapsedStrip from "./ConsoleCollapsedStrip";

export interface ConsolePageProps {
  /** Optional header area (breadcrumbs, search, buttons). Rendered above the layout. */
  header?: ReactNode;
  /** When true, shows a "Loading…" placeholder. */
  loading?: boolean;
  /** Error message displayed above the layout. */
  error?: string | null;
  /** Master-panel content (table or other list). */
  table: ReactNode;
  /** Detail panel content. When null/undefined, the panel is not rendered. */
  detail?: ReactNode;
  /** Workspace panel content. When null/undefined, the panel is not rendered. */
  workspace?: ReactNode;
  /** Accessible title for the collapsed-strip expand button. */
  collapsedTitle?: string;
  /** When true, renders a Load More button below the table slot. */
  hasMore?: boolean;
  /** Called when Load More is clicked. */
  onLoadMore?: () => void;
  /** Whether a Load More request is in flight. */
  loadingMore?: boolean;
}

/**
 * Shared Console Page layout.
 *
 * Absorbs the duplicated CSS class computation and master–detail–expanded
 * layout JSX that was previously copy-pasted between LimsList and LibraryView.
 * Each page becomes a thin data-fetching component that passes slots to
 * ConsolePage.
 */
function ConsolePage({
  header,
  loading = false,
  error,
  table,
  detail,
  workspace,
  collapsedTitle = "Expand list",
  hasMore = false,
  onLoadMore,
  loadingMore = false,
}: ConsolePageProps) {
  // Read viewState from shared context so ConsolePage stays in sync
  // with the page component's useConsoleView instance.
  const { viewState } = useConsole();
  const { collapseFromExpanded } = useConsoleView();

  // ── Compute page-level CSS classes ─────────────────────────────────
  const pageClass =
    `console-page${viewState === "detail" || viewState === "expanded" ? " has-detail" : ""}${viewState === "expanded" ? " is-expanded" : ""}`;

  const masterDetailClass =
    `console-master-detail${viewState === "detail" ? " has-detail" : ""}${viewState === "expanded" ? " is-expanded" : ""}`;

  const masterPanelClass =
    `console-master-panel${viewState === "expanded" ? " is-collapsed" : ""}`;

  // ── Loading placeholder ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="console-page">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className={pageClass}>
      <div className="console-page-header">
        {header}
      </div>

      {error && <div className="error">{error}</div>}

      {/* Master–Detail Layout */}
      <div className={masterDetailClass}>
        {/* Left Panel: Table (or Collapsed Strip) */}
        <div className={masterPanelClass}>
          {viewState === "expanded" ? (
            <ConsoleCollapsedStrip
              onExpand={collapseFromExpanded}
              title={collapsedTitle}
            />
          ) : (
            <>
              {table}
              {hasMore && onLoadMore && (
                <div className="console-load-more">
                  <button onClick={onLoadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Middle Panel: Detail Card */}
        {detail}

        {/* Right Panel: Workspace */}
        {workspace}
      </div>
    </div>
  );
}

export default ConsolePage;
