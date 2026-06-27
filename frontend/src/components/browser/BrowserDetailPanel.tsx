import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ViewState } from "../../types/browser";

export interface BrowserDetailPanelProps {
  children: ReactNode;
  /** Current view state (controls which action buttons appear). */
  viewState: ViewState;
  /** Close button click handler. */
  onClose: () => void;
  /** Collapse button click handler (shown in expanded state). */
  onCollapse?: () => void;
  /** URL for the expand action. Renders a <Link> — the dedicated Workspace page. */
  expandUrl?: string;
  /** Inline expand callback. Renders a <button> when expandUrl is not provided. */
  onExpand?: () => void;
  /** When true, applies the exit animation class. */
  isExiting?: boolean;
}

/**
 * Shared Detail Panel shell.
 *
 * Renders the panel frame with header action buttons (close, expand, collapse)
 * and a `children` slot for domain-specific content.  Used internally by
 * LimsDetailCard and LibraryDetailCard.
 */
function BrowserDetailPanel({
  children,
  viewState,
  onClose,
  onCollapse,
  expandUrl,
  onExpand,
  isExiting = false,
}: BrowserDetailPanelProps) {
  const panelClass = `browser-detail-panel${isExiting ? " is-exiting" : ""}`;

  return (
    <div className={panelClass}>
      <div className="card browser-detail-card">
        {/* Header with action buttons injected by the shell */}
        <div className="browser-detail-header-actions">
          {viewState === "detail" &&
            (expandUrl ? (
              <Link
                to={expandUrl}
                className="browser-detail-expand"
                title="Open in workspace"
              >
                &gt;
              </Link>
            ) : onExpand ? (
              <button
                className="browser-detail-expand"
                onClick={onExpand}
                title="Expand to full detail"
              >
                &gt;
              </button>
            ) : null)}

          {viewState === "expanded" && onCollapse && (
            <button
              className="browser-detail-collapse"
              onClick={onCollapse}
              title="Collapse to summary"
            >
              &lt;
            </button>
          )}

          <button
            className="browser-detail-close"
            onClick={onClose}
            title="Close detail"
          >
            &times;
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

export default BrowserDetailPanel;
