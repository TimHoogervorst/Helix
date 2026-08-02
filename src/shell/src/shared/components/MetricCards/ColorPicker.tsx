import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useClickOutside } from "../../hooks/useClickOutside";
import {
  CARD_COLOR_TOKENS,
  CARD_COLOR_CLASSES,
  CARD_COLOR_LABELS,
  type CardColorToken,
} from "./formatting";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), open);

  const token = CARD_COLOR_TOKENS.includes(value as CardColorToken)
    ? (value as CardColorToken)
    : "muted";
  const classes = CARD_COLOR_CLASSES[token];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn-ghost flex w-full items-center justify-between gap-2"
        onClick={() => setOpen(!open)}
        title="Choose colour"
        aria-label="Choose colour"
      >
        <span className="flex items-center gap-2">
          <span
            className={`h-4 w-4 rounded-sm ${classes.bg}`}
            aria-hidden="true"
          />
          <span className="text-sm">{CARD_COLOR_LABELS[token]}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-md border border-hairline bg-panel shadow-lg p-2 w-48">
          <div className="grid grid-cols-1 gap-0.5">
            {CARD_COLOR_TOKENS.map((t) => {
              const c = CARD_COLOR_CLASSES[t];
              return (
                <button
                  key={t}
                  type="button"
                  className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm transition hover:bg-muted ${
                    t === value
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground"
                  }`}
                  onClick={() => {
                    onChange(t);
                    setOpen(false);
                  }}
                  title={CARD_COLOR_LABELS[t]}
                  aria-label={CARD_COLOR_LABELS[t]}
                >
                  <span
                    className={`h-4 w-4 rounded-sm ${c.bg}`}
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-left">
                    {CARD_COLOR_LABELS[t]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
