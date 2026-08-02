import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useClickOutside } from "../../shell/src/shared/hooks/useClickOutside";
import { CARD_ICONS, resolveIcon } from "./formatting";

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  const SelectedIcon = resolveIcon(value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn-ghost flex w-full items-center justify-between gap-2"
        onClick={() => setOpen(!open)}
        title="Choose icon"
        aria-label="Choose icon"
      >
        <span className="flex items-center gap-2">
          <SelectedIcon className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">
            {CARD_ICONS.find((i) => i.key === value)?.label ?? "Icon"}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-md border border-hairline bg-panel shadow-lg p-2 w-56">
          <div className="grid grid-cols-4 gap-1">
            {CARD_ICONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                className={`flex flex-col items-center gap-0.5 rounded p-1.5 text-[11px] transition hover:bg-muted ${
                  key === value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                }`}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                title={label}
                aria-label={label}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
