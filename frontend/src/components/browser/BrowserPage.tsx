import type { ReactNode } from "react";
import { useBrowserView } from "./useBrowserView";
import { useBrowser } from "./BrowserProvider";
import BrowserCollapsedStrip from "./BrowserCollapsedStrip";

export interface BrowserPageProps {
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
 * Shared Browser Page layout.
 *
 * Absorbs the duplicated CSS class computation and master–detail–expanded
 * layout JSX that was previously copy-pasted between LimsList and LibraryView.
 * Each page becomes a thin data-fetching component that passes slots to
 * BrowserPage.
 */
function BrowserPage({
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
}: BrowserPageProps) {
  // Read viewState from shared context so BrowserPage stays in sync
  // with the page component's useBrowserView instance.
  const { viewState } = useBrowser();
  const { collapseFromExpanded } = useBrowserView();

  // ── Compute page-level CSS classes ─────────────────────────────────
  const pageClass =
    `page browser-page${viewState === "detail" || viewState === "expanded" ? " has-detail" : ""}${viewState === "expanded" ? " is-expanded" : ""}`;

  const masterDetailClass =
    `browser-master-detail${viewState === "detail" ? " has-detail" : ""}${viewState === "expanded" ? " is-expanded" : ""}`;

  const masterPanelClass =
    `browser-master-panel${viewState === "expanded" ? " is-collapsed" : ""}`;

  // ── Loading placeholder ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page">
        <p className="empty">Loading…</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className={pageClass}>
      {header}

      {error && <div className="error">{error}</div>}

      {/* Master–Detail Layout */}
      <div className={masterDetailClass}>
        {/* Left Panel: Table (or Collapsed Strip) */}
        <div className={masterPanelClass}>
          {viewState === "expanded" ? (
            <BrowserCollapsedStrip
              onExpand={collapseFromExpanded}
              title={collapsedTitle}
            />
          ) : (
            <>
              {table}
              {hasMore && onLoadMore && (
                <div className="browser-load-more">
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

export default BrowserPage;
