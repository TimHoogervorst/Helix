import { useState, useEffect } from "react";
import { RotateCcw, Save } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { getSeedsForTheme } from "./themeStore";
import { applyThemeSeeds, type ThemeSeeds } from "../shared/applyThemeSeeds";

const SEED_LABELS: Record<keyof ThemeSeeds, string> = {
  background: "Background",
  surface: "Surface",
  ink: "Ink",
  primary: "Primary",
  accent: "Accent",
};

const SEED_KEYS = Object.keys(SEED_LABELS) as (keyof ThemeSeeds)[];

function toHex(value: string): string {
  return value.startsWith("#") ? value : "#000000";
}

export function CustomizeTab() {
  const { activeThemeId, saveCustomTheme } = useTheme();

  const [draft, setDraft] = useState<ThemeSeeds>(() =>
    getSeedsForTheme(activeThemeId),
  );

  useEffect(() => {
    const initialSeeds = getSeedsForTheme(activeThemeId);
    return () => {
      applyThemeSeeds(initialSeeds);
    };
  }, [activeThemeId]);

  const handleChange = (key: keyof ThemeSeeds, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    applyThemeSeeds(next);
  };

  const handleReset = () => {
    const seeds = getSeedsForTheme(activeThemeId);
    setDraft(seeds);
    applyThemeSeeds(seeds);
  };

  const handleSaveAsTheme = () => {
    const name = window.prompt("Theme name:");
    if (name && name.trim()) {
      saveCustomTheme(name.trim(), draft);
    }
  };

  const isDirty = SEED_KEYS.some(
    (key) => draft[key] !== getSeedsForTheme(activeThemeId)[key],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-[var(--font-label)] text-xs text-[var(--color-ink-muted)]">
          Theme Seeds
        </h3>
        {isDirty && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAsTheme}
              className="flex items-center gap-1.5 font-[var(--font-label)] text-2xs text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-ink)] transition-colors"
            >
              <Save className="h-3 w-3" />
              Save as theme…
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 font-[var(--font-label)] text-2xs text-[var(--color-ink-muted-foreground)] hover:text-[var(--color-ink)] transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {SEED_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center gap-3 rounded-md border border-[var(--color-ink-hairline)] px-3 py-2"
          >
            <span className="w-[80px] shrink-0 font-[var(--font-label)] text-2xs text-[var(--color-ink-muted)]">
              {SEED_LABELS[key]}
            </span>
            <input
              type="color"
              value={toHex(draft[key])}
              onChange={(e) => handleChange(key, e.target.value)}
              aria-label={`${SEED_LABELS[key]} color picker`}
              className="h-6 w-8 shrink-0 cursor-pointer rounded border border-[var(--color-ink-hairline)] bg-transparent p-0"
            />
            <input
              type="text"
              value={draft[key]}
              onChange={(e) => handleChange(key, e.target.value)}
              aria-label={`${SEED_LABELS[key]} hex value`}
              className="flex-1 min-w-0 rounded border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 py-1 font-mono text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
