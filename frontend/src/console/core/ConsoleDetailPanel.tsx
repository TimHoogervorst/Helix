import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import type { ViewState } from "../../types/console";

export interface ConsoleDetailPanelProps {
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
function ConsoleDetailPanel({
  children,
  viewState,
  onClose,
  onCollapse,
  expandUrl,
  onExpand,
  isExiting = false,
}: ConsoleDetailPanelProps) {
  const panelClass = `console-detail-panel${isExiting ? " is-exiting" : ""}`;

  return (
    <div className={panelClass}>
      <div className="card console-detail-card">
        {/* Header with action buttons injected by the shell */}
        <div className="console-detail-header-actions">
          {viewState === "detail" &&
            (expandUrl ? (
              <Link
                to={expandUrl}
                className="console-detail-expand"
                title="Open in workspace"
                aria-label="Open in workspace"
              >
                <Maximize2 size={18} />
              </Link>
            ) : onExpand ? (
              <button
                className="console-detail-expand"
                onClick={onExpand}
                title="Expand to full detail"
                aria-label="Expand to full detail"
              >
                <Maximize2 size={18} />
              </button>
            ) : null)}

          {viewState === "expanded" && onCollapse && (
            <button
              className="console-detail-collapse"
              onClick={onCollapse}
              title="Collapse to summary"
              aria-label="Collapse to summary"
            >
              <Minimize2 size={18} />
            </button>
          )}

          <button
            className="console-detail-close"
            onClick={onClose}
            title="Close detail"
            aria-label="Close detail"
          >
            <X size={18} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

export default ConsoleDetailPanel;
