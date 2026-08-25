import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useSidebar } from "../../../workspace/SidebarContext";
import { IconButton } from "../../primitives/IconButton";
import { IconStrip, type IconStripGroup, type IconStripIcon } from "./IconStrip";

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
  /**
   * When true, the collapse toggle is not rendered in the expanded state.
   * The consumer is responsible for rendering their own toggle via
   * `useSidebar()`.  Defaults to false.
   */
  hideToggle?: boolean;
  /**
   * Rendered at the bottom in both expanded and collapsed states.
   * Use this for persistent UI like a user menu that must remain
   * accessible regardless of collapse state.
   */
  footer?: ReactNode;
  /**
   * Rendered in the collapsed icon-strip variant, between the icon
   * groups and the footer.  Use this for dynamic content (e.g. pinned
   * workspace items) that needs to appear as icon buttons in the
   * collapsed strip.  Not rendered in expanded or full-hide states.
   */
  collapsedContent?: ReactNode;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract the first icon of the first group as a standalone logo item,
 * and return the remaining groups (with that icon removed from group 0).
 * Used to render the logo as a special toggle area in the collapsed
 * icon-strip variant.
 */
function extractLogoFromGroups(
  groups: IconStripGroup[],
): { logoIcon: IconStripIcon | null; remainingGroups: IconStripGroup[] } {
  if (groups.length === 0 || groups[0].icons.length === 0) {
    return { logoIcon: null, remainingGroups: groups };
  }

  const [first, ...rest] = groups[0].icons;
  const remainingFirstGroup: IconStripGroup = { icons: rest };
  const remainingGroups =
    rest.length > 0
      ? [remainingFirstGroup, ...groups.slice(1)]
      : groups.slice(1);

  return { logoIcon: first, remainingGroups };
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
 *
 * When `hideToggle` is true in the expanded state, no toggle button
 * is rendered — the consumer must provide one via `useSidebar()`.
 *
 * In the collapsed icon-strip variant, the first icon of the first group
 * is treated as the brand logo and rendered as the expand toggle with a
 * hover reveal of the chevron.
 */
export function CollapsibleSidebar({
  side,
  variant,
  iconStripGroups = [],
  children,
  hideToggle = false,
  footer,
  collapsedContent,
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
        role="complementary"
        aria-label={side === "left" ? "Left sidebar (collapsed)" : "Right sidebar (collapsed)"}
        style={footer ? { overflow: "visible" } : undefined}
      >
        <IconButton
          className="sidebar-toggle"
          onClick={toggleSidebar}
          title={toggleLabel}
          aria-label={toggleLabel}
        >
          <ToggleIcon size={16} />
        </IconButton>
        {collapsedContent}
        {footer && <div className="mt-auto">{footer}</div>}
      </aside>
    );
  }

  // ── Collapsed: icon-strip ───────────────────────────────────────────
  if (isCollapsed && variant === "icon-strip") {
    // Left sidebar: the first icon of the first group is treated as the
    // brand logo — it becomes a clickable expand toggle (logo on hover
    // reveals a chevron). Right sidebar: traditional IconStrip + toggle.
    const logoAsToggle = side === "left";
    const { logoIcon, remainingGroups } = logoAsToggle
      ? extractLogoFromGroups(iconStripGroups)
      : { logoIcon: null, remainingGroups: iconStripGroups };

    return (
      <aside
        className="collapsible-sidebar is-collapsed variant-icon-strip"
        data-side={side}
        role="complementary"
        aria-label={side === "left" ? "Left sidebar (collapsed)" : "Right sidebar (collapsed)"}
        style={footer ? { overflow: "visible" } : undefined}
      >
        {/* Logo-as-toggle (left sidebar only): clickable, shows chevron on hover */}
        {logoIcon && (
          <IconButton
            className="sidebar-logo-toggle"
            onClick={toggleSidebar}
            title={toggleLabel}
            aria-label={toggleLabel}
          >
            <span className="sidebar-logo-toggle-icon">{logoIcon.icon}</span>
            <ChevronRight
              size={14}
              className="sidebar-logo-toggle-chevron"
              aria-hidden="true"
            />
          </IconButton>
        )}

        {/* Remaining icon groups (without the logo when logo-as-toggle) */}
        {remainingGroups.length > 0 && (
          <IconStrip groups={remainingGroups} />
        )}

        {/* Fallback toggle — shown only when there's no logo to act as toggle */}
        {!logoIcon && (
          <IconButton
            className="sidebar-toggle"
            onClick={toggleSidebar}
            title={toggleLabel}
            aria-label={toggleLabel}
          >
            <ToggleIcon size={16} />
          </IconButton>
        )}

        {/* Dynamic collapsed content (e.g. pinned workspace icons) */}
        {collapsedContent}

        {/* Footer — e.g. user menu, pinned to bottom */}
        {footer && <div className="mt-auto">{footer}</div>}
      </aside>
    );
  }

  // ── Expanded ────────────────────────────────────────────────────────
  // The toggle sits inside .sidebar-content so it takes full width and
  // can be placed above the content sections (right sidebar) or omitted
  // via hideToggle so the consumer places it where they want (left sidebar).

  return (
    <aside
      className="collapsible-sidebar is-expanded"
      data-side={side}
      role="complementary"
      aria-label={side === "left" ? "Left sidebar" : "Right sidebar"}
    >
      <div className="sidebar-content">
        {!hideToggle && (
          <div className="sidebar-toggle-row" data-side={side}>
              <IconButton
                className="sidebar-toggle"
                onClick={toggleSidebar}
                title={toggleLabel}
                aria-label={toggleLabel}
              >
                <ToggleIcon size={16} />
              </IconButton>
          </div>
        )}
        {children}
        {footer && <div className="sidebar-footer">{footer}</div>}
      </div>
    </aside>
  );
}
