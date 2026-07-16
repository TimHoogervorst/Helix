/**
 * TagColorPicker — row of 8 coloured dots using TAG_COLORS from constants.
 *
 * Used inline in TagAutocomplete and in TagSettings for selecting a
 * tag's colour.
 */
import { TAG_COLORS } from "../constants";

export interface TagColorPickerProps {
  /** The currently selected colour key. */
  value: string;
  /** Called when a colour dot is clicked. */
  onChange: (colorKey: string) => void;
  /** Size variant. Default "sm" (16px dots). Use "xs" for compact contexts. */
  size?: "sm" | "xs";
}

export function TagColorPicker({
  value,
  onChange,
  size = "sm",
}: TagColorPickerProps) {
  const dotSize = size === "xs" ? "h-4 w-4" : "h-5 w-5";

  return (
    <div className="flex gap-1" data-testid="tag-color-picker">
      {TAG_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          className={`${dotSize} rounded-full border-2 transition-transform hover:scale-110 ${
            value === c.key ? "border-foreground" : "border-transparent"
          }`}
          style={{ backgroundColor: c.hex }}
          title={c.label}
          aria-label={c.label}
          onClick={() => onChange(c.key)}
        />
      ))}
    </div>
  );
}
