import { ChevronDown, ChevronRight } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useSidebar } from "../../../workspace/SidebarContext";

// ── Props ───────────────────────────────────────────────────────────────

export interface SidebarSectionProps {
  /** Unique ID used to track collapse state in SidebarContext. */
  id: string;
  /** Label displayed in the section header. */
  label: string;
  /** Optional icon component rendered before the label in the section header. */
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** When false, the chevron is hidden and the section cannot be collapsed. */
  collapsible?: boolean;
  /** Content rendered when the section is expanded. */
  children: ReactNode;
  /** Optional controls rendered at the end of the section header. */
  actions?: ReactNode;
}

// ── Component ───────────────────────────────────────────────────────────

/**
 * A named, collapsible group within a sidebar.
 *
 * Uses the nearest `<SidebarProvider>` to read and toggle collapse state.
 * When collapsed, the section renders as a thin header bar in its original
 * position — content is hidden but the header remains interactive.
 */
export function SidebarSection({
  id,
  label,
  icon: Icon,
  collapsible = true,
  children,
  actions,
}: SidebarSectionProps) {
  const { isSectionCollapsed, toggleSection } = useSidebar();
  const collapsed = collapsible && isSectionCollapsed(id);

  const handleClick = () => {
    if (collapsible) toggleSection(id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (collapsible && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      toggleSection(id);
    }
  };

  return (
    <div className="sidebar-section" data-section-id={id}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        className="sidebar-section-header"
        onClick={handleClick}
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={handleKeyDown}
        aria-expanded={collapsible ? !collapsed : undefined}
        aria-label={collapsible ? `${label} section` : undefined}
      >
        {Icon && <Icon size={16} className="sidebar-section-icon" />}
        <span className="sidebar-section-label">{label}</span>
        {actions && <span onClick={(event) => event.stopPropagation()}>{actions}</span>}
        {collapsible && (
          <span className="sidebar-section-chevron" aria-hidden="true">
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      {!collapsed && (
        <div className="sidebar-section-content">
          {children}
        </div>
      )}
    </div>
  );
}
