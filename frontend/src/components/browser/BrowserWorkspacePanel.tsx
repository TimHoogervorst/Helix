import { type ReactNode } from "react";
import { Link } from "react-router-dom";

export interface BrowserWorkspacePanelProps {
  children: ReactNode;
  /** When true, applies the exit animation class. */
  isExiting?: boolean;
  /** Optional URL for the dedicated workspace page (renders a link icon). */
  dedicatedUrl?: string;
}

/**
 * Shared Workspace Panel shell.
 *
 * Renders the full-width work surface container with optional exit animation.
 * When ``dedicatedUrl`` is provided, a "open in dedicated page" link is
 * rendered in the panel header.  The `children` slot is the domain-specific
 * content (editor, tabbed view, etc.).
 */
function BrowserWorkspacePanel({
  children,
  isExiting = false,
  dedicatedUrl,
}: BrowserWorkspacePanelProps) {
  const panelClass = `browser-workspace-panel${isExiting ? " is-exiting" : ""}`;

  return (
    <div className={panelClass}>
      {dedicatedUrl && (
        <div className="browser-workspace-header">
          <Link
            to={dedicatedUrl}
            className="browser-workspace-dedicated-link"
            title="Open in dedicated page"
          >
            ↗
          </Link>
        </div>
      )}
      {children}
    </div>
  );
}

export default BrowserWorkspacePanel;