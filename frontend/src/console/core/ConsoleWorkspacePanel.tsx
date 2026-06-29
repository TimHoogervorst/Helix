import { type ReactNode } from "react";
import { Link } from "react-router-dom";

export interface ConsoleWorkspacePanelProps {
  children: ReactNode;
  /** When true, applies the exit animation class. */
  isExiting?: boolean;
  /** Optional URL pointing back to the master panel with the detail panel
   *  pre-selected (e.g. /library?select=EP1). Renders a [<] button with a
   *  vertical separator fixed to the far left of the viewport. */
  backUrl?: string;
}

/**
 * Shared Workspace Panel shell.
 *
 * Renders the full-width work surface container with optional exit animation.
 * When ``backUrl`` is provided, a "back to master" button is rendered as a
 * fixed element on the far left of the viewport, outside the panel container.
 * The `children` slot is the domain-specific content (editor, tabbed view,
 * etc.).
 */
function ConsoleWorkspacePanel({
  children,
  isExiting = false,
  backUrl,
}: ConsoleWorkspacePanelProps) {
  const panelClass = `console-workspace-panel${isExiting ? " is-exiting" : ""}`;

  return (
    <>
      {backUrl && (
        <div className="console-workspace-back">
          <Link
            to={backUrl}
            className="console-workspace-back-btn"
            title="Back to master panel"
          >
            &lt;
          </Link>
          <span className="console-workspace-back-divider" />
        </div>
      )}
      <div className={panelClass}>{children}</div>
    </>
  );
}

export default ConsoleWorkspacePanel;
