import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useSidebar } from "../../../workspace/SidebarContext";
import { IconStrip, type IconStripGroup } from "./IconStrip";

// ── Props ───────────────────────────────────────────────────────────────

export interface CollapsibleSidebarProps {
  /** Which side of the screen the sidebar is attached to. */
  side: "left" | "right";
  /**
   * How the sidebar renders when collapsed:
   * - `"icon-strip"` — renders an IconStrip with icons and a toggle.
   * - `"full-hide"` — renders a thin toggle-only strip.
   */
  variant: "icon-strip" | "full-hide";
  /** Icon groups passed to the IconStrip when `variant="icon-strip"`. */
  iconStripGroups?: IconStripGroup[];
  /** Sidebar content rendered when expanded. */
  children: ReactNode;
}

// ── Component ───────────────────────────────────────────────────────────

/**
 * Wraps a full-height sidebar panel with collapse/expand behavior.
 *
 * Uses the nearest `<SidebarProvider>` for collapse state.
 *
 * Toggle button placement follows an edge-relative convention:
 * - Left sidebar: toggle on the **right** edge (toward content).
 * - Right sidebar: toggle on the **left** edge (toward content).
 */
export function CollapsibleSidebar({
  side,
  variant,
  iconStripGroups = [],
  children,
}: CollapsibleSidebarProps) {
  const { isCollapsed, toggleSidebar } = useSidebar();

  // ── Toggle icon ─────────────────────────────────────────────────────
  // Convention: the chevron points in the direction the sidebar will move.
  // Left sidebar (toggle on right edge):
  //   - expanded → "<" (ChevronLeft, pointing toward screen edge = collapse)
  //   - collapsed → ">" (ChevronRight, pointing toward content = expand)
  // Right sidebar (toggle on left edge):
  //   - expanded → ">" (ChevronRight, pointing toward screen edge = collapse)
  //   - collapsed → "<" (ChevronLeft, pointing toward content = expand)

  const ToggleIcon = (() => {
    if (side === "left") {
      return isCollapsed ? ChevronRight : ChevronLeft;
    }
    return isCollapsed ? ChevronLeft : ChevronRight;
  })();

  const toggleLabel = isCollapsed ? "Expand sidebar" : "Collapse sidebar";

  // ── Collapsed: full-hide ────────────────────────────────────────────
  if (isCollapsed && variant === "full-hide") {
    return (
      <aside
        className="collapsible-sidebar is-collapsed variant-full-hide"
        data-side={side}
        aria-label="Collapsed sidebar"
      >
        <button
          className="btn-icon sidebar-toggle"
          onClick={toggleSidebar}
          title={toggleLabel}
          aria-label={toggleLabel}
        >
          <ToggleIcon size={16} />
        </button>
      </aside>
    );
  }

  // ── Collapsed: icon-strip ───────────────────────────────────────────
  if (isCollapsed && variant === "icon-strip") {
    return (
      <aside
        className="collapsible-sidebar is-collapsed variant-icon-strip"
        data-side={side}
        aria-label="Collapsed sidebar"
      >
        <IconStrip groups={iconStripGroups} />
        <button
          className="btn-icon sidebar-toggle"
          onClick={toggleSidebar}
          title={toggleLabel}
          aria-label={toggleLabel}
        >
          <ToggleIcon size={16} />
        </button>
      </aside>
    );
  }

  // ── Expanded ────────────────────────────────────────────────────────
  // Toggle placement: on the right edge for left sidebar (after content),
  // on the left edge for right sidebar (before content).

  return (
    <aside
      className="collapsible-sidebar is-expanded"
      data-side={side}
      role="complementary"
    >
      {side === "right" && (
        <button
          className="btn-icon sidebar-toggle"
          onClick={toggleSidebar}
          title={toggleLabel}
          aria-label={toggleLabel}
        >
          <ToggleIcon size={16} />
        </button>
      )}
      <div className="sidebar-content">
        {children}
      </div>
      {side === "left" && (
        <button
          className="btn-icon sidebar-toggle"
          onClick={toggleSidebar}
          title={toggleLabel}
          aria-label={toggleLabel}
        >
          <ToggleIcon size={16} />
        </button>
      )}
    </aside>
  );
}
