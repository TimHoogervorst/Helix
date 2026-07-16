/**
 * TagIconPicker — row of 8 icon buttons using TAG_ICONS from constants.
 *
 * Ghosted style: unselected icons have a transparent border (like TagColorPicker),
 * while the selected icon has a visible border + muted background.
 *
 * Used inline in TagAutocomplete, inside TagIconPopover for settings, and
 * anywhere you need to select a tag's icon.
 */
import { TAG_ICONS } from "../constants";

export interface TagIconPickerProps {
  /** The currently selected icon key. */
  value: string;
  /** Called when an icon button is clicked. */
  onChange: (iconKey: string) => void;
  /** Size variant. Default "sm". */
  size?: "sm" | "xs";
}

export function TagIconPicker({
  value,
  onChange,
  size = "sm",
}: TagIconPickerProps) {
  const buttonSize = size === "xs" ? "h-9 w-9" : "h-10 w-10";
  const iconSize = size === "xs" ? "h-5 w-5" : "h-6 w-6";

  return (
    <div className="flex gap-0.5" data-testid="tag-icon-picker">
      {TAG_ICONS.map((ico) => {
        const IconC = ico.Icon;
        return (
          <button
            key={ico.key}
            type="button"
            className={`${buttonSize} rounded border flex items-center justify-center transition-colors hover:bg-muted bg-transparent text-foreground ${
              value === ico.key
                ? "border-foreground bg-muted"
                : "border-transparent"
            }`}
            title={ico.label}
            aria-label={ico.label}
            onClick={() => onChange(ico.key)}
          >
            <IconC className={iconSize} />
          </button>
        );
      })}
    </div>
  );
}
