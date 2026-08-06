import type { ReactNode } from "react";
import { IconButton } from "../../primitives/IconButton";

// ── Types ───────────────────────────────────────────────────────────────

export interface IconStripIcon {
  /** The icon element to render. */
  icon: ReactNode;
  /** Accessible label. Used as `aria-label` and `title` on button wrappers. */
  label: string;
  /**
   * When undefined, the icon is purely decorative — rendered as a plain
   * `<span>` with no click handler.
   */
  onClick?: () => void;
}

export interface IconStripGroup {
  icons: IconStripIcon[];
}

export interface IconStripProps {
  /** Ordered groups of icons. A thin divider is rendered between groups. */
  groups: IconStripGroup[];
}

// ── Component ───────────────────────────────────────────────────────────

/**
 * Vertical stack of icon buttons with dividers between groups.
 *
 * Icons without an `onClick` are decorative — they render as plain spans,
 * not buttons.  This is used for the Helix logo at the top of the strip.
 */
export function IconStrip({ groups }: IconStripProps) {
  return (
    <div className="flex flex-col items-center gap-0 py-2" role="navigation" aria-label="Icon strip">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col items-center gap-1 w-full">
          {gi > 0 && (
            <div className="w-6 h-px bg-border my-1" aria-hidden="true" />
          )}
          {group.icons.map((item, ii) =>
            item.onClick ? (
              <IconButton
                key={ii}
                className="flex items-center justify-center w-8 h-8 rounded-md"
                onClick={item.onClick}
                title={item.label}
                aria-label={item.label}
              >
                {item.icon}
              </IconButton>
            ) : (
              <span
                key={ii}
                className="flex items-center justify-center w-8 h-8 text-muted-foreground"
                aria-hidden="true"
              >
                {item.icon}
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
