/**
 * TagIconPicker — row of 8 icon buttons using TAG_ICONS from constants.
 *
 * Used inline in TagAutocomplete and in TagSettings for selecting a
 * tag's icon.
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
  const buttonSize = size === "xs" ? "h-6 w-6" : "h-7 w-7";
  const iconSize = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div className="flex gap-0.5" data-testid="tag-icon-picker">
      {TAG_ICONS.map((ico) => {
        const IconC = ico.Icon;
        return (
          <button
            key={ico.key}
            type="button"
            className={`${buttonSize} rounded border flex items-center justify-center ${
              value === ico.key
                ? "border-foreground bg-muted"
                : "border-hairline"
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
