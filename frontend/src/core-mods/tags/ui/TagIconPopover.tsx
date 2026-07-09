/**
 * TagIconPopover — ghosted icon button that opens a popover with TagIconPicker.
 *
 * Uses the same ghosted button pattern as btn-icon (transparent bg, borderless)
 * combined with the popover pattern from TypeDetailPanel and UserMenu.
 *
 * Used in TagSettings for a compact icon selector instead of the inline row.
 */
import { useState, useRef } from "react";
import { useClickOutside } from "../../../shared/hooks/useClickOutside";
import { getTagIcon } from "../constants";
import { TagIconPicker } from "./TagIconPicker";

export interface TagIconPopoverProps {
  /** The currently selected icon key. */
  value: string;
  /** Called when an icon is selected from the popover. */
  onChange: (iconKey: string) => void;
  /** Size variant for the trigger button. Default "sm". */
  size?: "sm" | "xs";
}

export function TagIconPopover({
  value,
  onChange,
  size = "sm",
}: TagIconPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setOpen(false), open);

  const iconInfo = getTagIcon(value);
  const IconComponent = iconInfo.Icon;
  const buttonSize = size === "xs" ? "h-9 w-9" : "h-10 w-10";
  const iconSize = size === "xs" ? "h-5 w-5" : "h-6 w-6";

  const handleSelect = (iconKey: string) => {
    onChange(iconKey);
    setOpen(false);
  };

  return (
    <div
      className="relative inline-block"
      ref={containerRef}
      data-testid="tag-icon-popover"
    >
      {/* ── Ghosted trigger button ── */}
      <button
        type="button"
        className={`${buttonSize} rounded border border-transparent flex items-center justify-center hover:bg-muted hover:border-hairline transition-colors bg-transparent text-foreground`}
        onClick={() => setOpen((prev) => !prev)}
        title={iconInfo.label}
        aria-label={`Change icon (currently ${iconInfo.label})`}
      >
        <IconComponent className={iconSize} />
      </button>

      {/* ── Popover ── */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 rounded-md border border-hairline bg-panel shadow-lg p-2"
          data-testid="tag-icon-popover-dropdown"
        >
          <TagIconPicker value={value} onChange={handleSelect} size="xs" />
        </div>
      )}
    </div>
  );
}
