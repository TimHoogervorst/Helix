import { useState, useEffect, useCallback, type ChangeEvent } from "react";
import { RotateCcw, Save, RefreshCw } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import {
  getActiveTheme,
  getSeedsForTheme,
} from "./themeStore";
import {
  applyTheme,
  DERIVED_KEYS,
  DEFAULT_FONTS,
  type ThemeSeeds,
  type Theme,
} from "../shared/applyTheme";
import { ModRegistry } from "../mod-system/ModRegistry";
import { deriveShade } from "../shared/components/IconBadge";

const SEED_LABELS: Record<keyof ThemeSeeds, string> = {
  background: "Background",
  surface: "Surface",
  card: "Card",
  ink: "Ink",
  primary: "Primary",
  accent: "Accent",
};

const SEED_KEYS = Object.keys(SEED_LABELS) as (keyof ThemeSeeds)[];

const DERIVED_GROUPS: { seed: string; prefix: string; keys: string[] }[] = [
  { seed: "Background", prefix: "background", keys: ["hover", "active", "subtle", "foreground"] },
  { seed: "Surface", prefix: "surface", keys: ["hover", "active", "subtle", "foreground"] },
  { seed: "Card", prefix: "card", keys: ["hover", "active", "subtle", "foreground"] },
  { seed: "Ink", prefix: "ink", keys: ["hover", "active", "subtle", "foreground", "border", "hairline", "muted-foreground"] },
  { seed: "Primary", prefix: "primary", keys: ["hover", "active", "subtle", "foreground"] },
  { seed: "Accent", prefix: "accent", keys: ["hover", "active", "subtle", "foreground"] },
];

const DERIVED_LABELS: Record<string, string> = {
  "background-hover": "hover",
  "background-active": "active",
  "background-subtle": "subtle",
  "background-foreground": "foreground",
  "surface-hover": "hover",
  "surface-active": "active",
  "surface-subtle": "subtle",
  "surface-foreground": "foreground",
  "card-hover": "hover",
  "card-active": "active",
  "card-subtle": "subtle",
  "card-foreground": "foreground",
  "ink-hover": "hover",
  "ink-active": "active",
  "ink-subtle": "subtle",
  "ink-foreground": "foreground",
  "ink-border": "border",
  "ink-hairline": "hairline",
  "ink-muted-foreground": "muted-foreground",
  "primary-hover": "hover",
  "primary-active": "active",
  "primary-subtle": "subtle",
  "primary-foreground": "foreground",
  "accent-hover": "hover",
  "accent-active": "active",
  "accent-subtle": "subtle",
  "accent-foreground": "foreground",
};

const FONT_PRESETS = [
  { label: "JetBrains Mono", value: `"JetBrains Mono Variable", "JetBrains Mono", "SF Mono", "Cascadia Code", Consolas, monospace` },
  { label: "Inter", value: `"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` },
  { label: "Fira Code", value: `"Fira Code Variable", "Fira Code", "SF Mono", Consolas, monospace` },
  { label: "Cascadia Code", value: `"Cascadia Code", "SF Mono", Consolas, monospace` },
  { label: "SF Mono", value: `"SF Mono", Consolas, monospace` },
  { label: "Courier New", value: `"Courier New", Courier, monospace` },
  { label: "System Sans", value: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` },
  { label: "System Mono", value: `"SF Mono", Consolas, "Courier New", monospace` },
];

const CUSTOM_PRESET_LABEL = "Custom…";

interface DerivedEntry {
  autoValue: string;
  editValue: string;
  storedExpected?: string;
  isAdjusted: boolean;
  isDirty: boolean;
}

function toHex(value: string): string {
  return value.startsWith("#") ? value : "#000000";
}

function findPresetLabel(value: string): string | null {
  if (!value) return null;
  const found = FONT_PRESETS.find((p) => p.value === value);
  return found ? found.label : null;
}

export function CustomizeTab() {
  const { activeThemeId, saveCustomTheme } = useTheme();
  const activeTheme = getActiveTheme();

  const [draftSeeds, setDraftSeeds] = useState<ThemeSeeds>(() =>
    getSeedsForTheme(activeThemeId),
  );

  const [derivedState, setDerivedState] = useState<Map<string, DerivedEntry>>(
    new Map(DERIVED_KEYS.map((k) => [k, { autoValue: "", editValue: "", isAdjusted: false, isDirty: false }])),
  );

  const [draftFonts, setDraftFonts] = useState<{ label: string; body: string }>(() => ({
    label: activeTheme.fonts?.label ?? DEFAULT_FONTS.label,
    body: activeTheme.fonts?.body ?? DEFAULT_FONTS.body,
  }));

  const [labelFontPreset, setLabelFontPreset] = useState<string>(() => {
    const label = activeTheme.fonts?.label ?? DEFAULT_FONTS.label;
    return findPresetLabel(label) ?? CUSTOM_PRESET_LABEL;
  });

  const [bodyFontPreset, setBodyFontPreset] = useState<string>(() => {
    const body = activeTheme.fonts?.body ?? DEFAULT_FONTS.body;
    return findPresetLabel(body) ?? CUSTOM_PRESET_LABEL;
  });

  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>(() => {
    const labels = activeTheme.labels ?? {};
    return { ...labels };
  });

  function getColorPaletteEntries(): { key: string; label: string; hex: string }[] {
    try {
      return Array.from(ModRegistry.getInstance().getColorPalette().entries()).map(
        ([key, entry]) => ({ key, label: entry.label, hex: entry.hex }),
      );
    } catch {
      return [];
    }
  }

  const handleLabelChange = (key: string, value: string) => {
    const next = { ...labelOverrides, [key]: value };
    setLabelOverrides(next);
    document.documentElement.style.setProperty(`--color-label-${key}`, value);
    document.documentElement.style.setProperty(`--color-label-${key}-foreground`, deriveShade(value));
  };

  const handleLabelReset = (key: string) => {
    const next = { ...labelOverrides };
    delete next[key];
    setLabelOverrides(next);
    document.documentElement.style.removeProperty(`--color-label-${key}`);
    document.documentElement.style.removeProperty(`--color-label-${key}-foreground`);
  };

  const applyThemeSnapshot = useCallback(
    (theme: Theme) => {
      applyTheme(theme, (adjustedKeys) => {
        updateDerivedStateFromDOM(theme, adjustedKeys);
      });
    },
    [],
  );

  const updateDerivedStateFromDOM = useCallback((theme: Theme, adjustedKeys: string[]) => {
    const autoValues = snapshotDerived();
    setDerivedState((prev) => {
      const next = new Map(prev);
      for (const key of DERIVED_KEYS) {
        const autoValue = autoValues[key] ?? "";
        const current = next.get(key);
        const override = theme.derived?.[key];
        const storedExpected = override?.expected;
        if (current) {
          const editValue = current.isDirty ? current.editValue : (override?.value ?? autoValue);
          next.set(key, {
            autoValue,
            editValue,
            storedExpected,
            isAdjusted: adjustedKeys.includes(key),
            isDirty: current.isDirty,
          });
        } else {
          next.set(key, {
            autoValue,
            editValue: override?.value ?? autoValue,
            storedExpected,
            isAdjusted: adjustedKeys.includes(key),
            isDirty: false,
          });
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const theme = getActiveTheme();
    setDerivedState(
      new Map(DERIVED_KEYS.map((k) => [k, { autoValue: "", editValue: "", isAdjusted: false, isDirty: false }])),
    );
    applyThemeSnapshot(theme);
    return () => {
      applyThemeSnapshot(theme);
    };
  }, [activeThemeId, applyThemeSnapshot]);

  const handleSeedChange = (key: keyof ThemeSeeds, value: string) => {
    const next = { ...draftSeeds, [key]: value };
    setDraftSeeds(next);
    const theme: Theme = {
      id: activeThemeId,
      name: "",
      description: "",
      seeds: next,
      derived: buildCurrentDerived(),
      fonts: draftFonts,
      labels: Object.keys(labelOverrides).length > 0 ? labelOverrides : undefined,
    };
    applyTheme(theme, (adjustedKeys) => {
      updateDerivedStateFromDOM(theme, adjustedKeys);
    });
  };

  const buildCurrentDerived = (): Record<string, { expected: string; value: string }> | undefined => {
    const result: Record<string, { expected: string; value: string }> = {};
    let hasAny = false;
    for (const key of DERIVED_KEYS) {
      const entry = derivedState.get(key);
      if (entry && entry.isDirty && entry.editValue !== entry.autoValue) {
        result[key] = { expected: entry.autoValue, value: entry.editValue };
        hasAny = true;
      }
    }
    return hasAny ? result : undefined;
  };

  const handleDerivedChange = (key: string, value: string) => {
    setDerivedState((prev) => {
      const next = new Map(prev);
      const entry = next.get(key);
      if (entry) {
        next.set(key, { ...entry, editValue: value, isDirty: true });
        document.documentElement.style.setProperty(`--color-${key}`, value);
      }
      return next;
    });
  };

  const handleDerivedReset = (key: string) => {
    setDerivedState((prev) => {
      const next = new Map(prev);
      const entry = next.get(key);
      if (entry) {
        next.set(key, {
          ...entry,
          editValue: entry.autoValue,
          storedExpected: undefined,
          isAdjusted: false,
          isDirty: true,
        });
        document.documentElement.style.removeProperty(`--color-${key}`);
      }
      return next;
    });
  };

  const handleFontPresetChange = (role: "label" | "body", presetLabel: string) => {
    if (role === "label") {
      setLabelFontPreset(presetLabel);
    } else {
      setBodyFontPreset(presetLabel);
    }

    const preset = FONT_PRESETS.find((p) => p.label === presetLabel);
    if (preset) {
      const nextFonts = { ...draftFonts, [role]: preset.value };
      setDraftFonts(nextFonts);
      document.documentElement.style.setProperty(
        role === "label" ? "--font-label" : "--font-body",
        preset.value,
      );
    }
  };

  const handleFontCustomChange = (role: "label" | "body", value: string) => {
    const nextFonts = { ...draftFonts, [role]: value };
    setDraftFonts(nextFonts);
    document.documentElement.style.setProperty(
      role === "label" ? "--font-label" : "--font-body",
      value,
    );
  };

  const handleReset = () => {
    const theme = getActiveTheme();
    setDraftSeeds(theme.seeds);
    setDraftFonts({
      label: theme.fonts?.label ?? DEFAULT_FONTS.label,
      body: theme.fonts?.body ?? DEFAULT_FONTS.body,
    });
    setLabelFontPreset(
      findPresetLabel(theme.fonts?.label ?? DEFAULT_FONTS.label) ?? CUSTOM_PRESET_LABEL,
    );
    setBodyFontPreset(
      findPresetLabel(theme.fonts?.body ?? DEFAULT_FONTS.body) ?? CUSTOM_PRESET_LABEL,
    );
    applyTheme(theme);
    setDerivedState(
      new Map(DERIVED_KEYS.map((k) => [k, { autoValue: "", editValue: "", isAdjusted: false, isDirty: false }])),
    );
    for (const key of Object.keys(labelOverrides)) {
      document.documentElement.style.removeProperty(`--color-label-${key}`);
      document.documentElement.style.removeProperty(`--color-label-${key}-foreground`);
    }
    setLabelOverrides(theme.labels ? { ...theme.labels } : {});
  };

  const handleSaveAsTheme = () => {
    const name = window.prompt("Theme name:");
    if (name && name.trim()) {
      const derived = buildCurrentDerived();
      saveCustomTheme({
        id: "",
        name: name.trim(),
        description: "",
        seeds: draftSeeds,
        derived,
        fonts: draftFonts,
        labels: Object.keys(labelOverrides).length > 0 ? labelOverrides : undefined,
      });
    }
  };

  const derivedIsDirty =
    Array.from(derivedState.values()).some((e) => e.isDirty) ||
    draftFonts.label !== (activeTheme.fonts?.label ?? DEFAULT_FONTS.label) ||
    draftFonts.body !== (activeTheme.fonts?.body ?? DEFAULT_FONTS.body) ||
    SEED_KEYS.some((key) => draftSeeds[key] !== activeTheme.seeds[key]) ||
    JSON.stringify(labelOverrides) !== JSON.stringify(activeTheme.labels ?? {});

  const isDirty = SEED_KEYS.some(
    (key) => draftSeeds[key] !== activeTheme.seeds[key],
  ) || derivedIsDirty;

  function renderDerivedGroup(group: (typeof DERIVED_GROUPS)[number]) {
    return (
      <div key={group.seed}>
        <div className="font-[var(--font-label)] text-2xs text-[var(--color-ink-muted-foreground)] mb-0.5 px-1">
          {group.seed}
        </div>
        <div className="flex flex-col gap-0.5">
          {group.keys.map((suffix) => {
            const key = `${group.prefix}-${suffix}`;
            const entry = derivedState.get(key);
            if (!entry) return null;
            return (
              <div
                key={key}
                className="flex items-center gap-1 rounded border border-[var(--color-ink-hairline)] px-1.5 py-0.5"
              >
                <span className="w-[55px] shrink-0 font-[var(--font-label)] text-2xs text-[var(--color-ink-muted)] truncate">
                  {DERIVED_LABELS[key] ?? suffix}
                </span>
                <button
                  type="button"
                  title={`Pick override color (${entry.autoValue})`}
                  onClick={() => {
                    const picker = document.getElementById(
                      `derived-picker-${key}`,
                    ) as HTMLInputElement | null;
                    picker?.click();
                  }}
                  className="shrink-0 cursor-pointer p-0 border-0 bg-transparent"
                >
                  <span
                    className="h-3.5 w-3.5 block rounded-full border border-[var(--color-ink-hairline)] hover:border-[var(--color-primary)] transition-colors"
                    style={{ backgroundColor: entry.autoValue }}
                  />
                </button>
                {entry.isDirty && (
                  <span className="shrink-0">
                    <span
                      className="h-3 w-3 rounded border border-[var(--color-ink-hairline)] inline-block align-middle"
                      style={{ backgroundColor: entry.editValue }}
                    />
                  </span>
                )}
                <input
                  id={`derived-picker-${key}`}
                  type="color"
                  value={toHex(entry.editValue)}
                  onChange={(e) => handleDerivedChange(key, e.target.value)}
                  aria-label={`${DERIVED_LABELS[key]} override color picker`}
                  className="h-0 w-0 opacity-0 absolute pointer-events-none"
                />
                {entry.isAdjusted && (
                  <button
                    type="button"
                    title="Reset to auto-derived value"
                    onClick={() => handleDerivedReset(key)}
                    className="ml-auto shrink-0 flex items-center justify-center h-4 w-4 rounded hover:bg-[var(--color-surface-hover)]"
                  >
                    <RefreshCw className="h-2.5 w-2.5 text-[var(--color-ink-muted-foreground)]" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── FONTS ── */}
      <div className="mb-3">
        <h3 className="font-[var(--font-label)] text-xs text-[var(--color-ink-muted)] mb-2">
          Fonts
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-[40px] shrink-0 font-[var(--font-label)] text-2xs text-[var(--color-ink-muted)]">
                Label
              </span>
              <select
                value={labelFontPreset}
                onChange={(e) => handleFontPresetChange("label", e.target.value)}
                className="flex-1 rounded border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
              >
                {FONT_PRESETS.map((p) => (
                  <option key={p.label} value={p.label} style={{ fontFamily: p.value }}>
                    {p.label}
                  </option>
                ))}
                <option value={CUSTOM_PRESET_LABEL}>{CUSTOM_PRESET_LABEL}</option>
              </select>
            </div>
            {labelFontPreset === CUSTOM_PRESET_LABEL && (
              <div className="flex items-center gap-2 ml-[calc(40px+0.5rem)]">
                <input
                  type="text"
                  value={draftFonts.label}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFontCustomChange("label", e.target.value)
                  }
                  placeholder="font-family value"
                  className="flex-1 rounded border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 py-1 font-mono text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-[40px] shrink-0 font-[var(--font-label)] text-2xs text-[var(--color-ink-muted)]">
                Body
              </span>
              <select
                value={bodyFontPreset}
                onChange={(e) => handleFontPresetChange("body", e.target.value)}
                className="flex-1 rounded border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 py-1 text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
              >
                {FONT_PRESETS.map((p) => (
                  <option key={p.label} value={p.label} style={{ fontFamily: p.value }}>
                    {p.label}
                  </option>
                ))}
                <option value={CUSTOM_PRESET_LABEL}>{CUSTOM_PRESET_LABEL}</option>
              </select>
            </div>
            {bodyFontPreset === CUSTOM_PRESET_LABEL && (
              <div className="flex items-center gap-2 ml-[calc(40px+0.5rem)]">
                <input
                  type="text"
                  value={draftFonts.body}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    handleFontCustomChange("body", e.target.value)
                  }
                  placeholder="font-family value"
                  className="flex-1 rounded border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 py-1 font-mono text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SEEDS ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
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
        <div className="flex flex-col gap-1.5">
          {SEED_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-center gap-2 rounded border border-[var(--color-ink-hairline)] px-2 py-1.5"
            >
              <span className="w-[60px] shrink-0 font-[var(--font-label)] text-2xs text-[var(--color-ink-muted)]">
                {SEED_LABELS[key]}
              </span>
              <input
                type="color"
                value={toHex(draftSeeds[key])}
                onChange={(e) => handleSeedChange(key, e.target.value)}
                aria-label={`${SEED_LABELS[key]} color picker`}
                className="h-6 w-8 shrink-0 cursor-pointer rounded border border-[var(--color-ink-hairline)] bg-transparent p-0"
              />
              <input
                type="text"
                value={draftSeeds[key]}
                onChange={(e) => handleSeedChange(key, e.target.value)}
                aria-label={`${SEED_LABELS[key]} hex value`}
                className="flex-1 min-w-0 rounded border border-[var(--color-ink-hairline)] bg-[var(--color-background)] px-2 py-1 font-mono text-xs text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── DERIVED ── */}
      <div className="mt-3">
        <h3 className="font-[var(--font-label)] text-xs text-[var(--color-ink-muted)] mb-2">
          Derived
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {DERIVED_GROUPS.slice(0, 3).map((group) => renderDerivedGroup(group))}
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          {DERIVED_GROUPS.slice(3).map((group) => renderDerivedGroup(group))}
        </div>
      </div>

      {/* ── LABEL COLOURS ── */}
      {getColorPaletteEntries().length > 0 && (
        <div className="mt-3">
          <h3 className="font-[var(--font-label)] text-xs text-[var(--color-ink-muted)] mb-2">
            Label Colours
          </h3>
          <div className="flex flex-col gap-0.5">
            {getColorPaletteEntries().map(({ key, label, hex }) => {
              const override = labelOverrides[key];
              return (
                <div
                  key={key}
                  className="flex items-center gap-1 rounded border border-[var(--color-ink-hairline)] px-1.5 py-0.5"
                >
                  <span className="w-[55px] shrink-0 font-[var(--font-label)] text-2xs text-[var(--color-ink-muted)] truncate">
                    {label}
                  </span>
                  <button
                    type="button"
                    title={`Pick override color (${hex})`}
                    onClick={() => {
                      const picker = document.getElementById(
                        `label-picker-${key}`,
                      ) as HTMLInputElement | null;
                      picker?.click();
                    }}
                    className="shrink-0 cursor-pointer p-0 border-0 bg-transparent"
                  >
                    <span
                      className="h-3.5 w-3.5 block rounded-full border border-[var(--color-ink-hairline)] hover:border-[var(--color-primary)] transition-colors"
                      style={{ backgroundColor: override ?? hex }}
                    />
                  </button>
                  <input
                    id={`label-picker-${key}`}
                    type="color"
                    value={override ? toHex(override) : toHex(hex)}
                    onChange={(e) => handleLabelChange(key, e.target.value)}
                    aria-label={`${label} color picker`}
                    className="h-0 w-0 opacity-0 absolute pointer-events-none"
                  />
                  {override && (
                    <button
                      type="button"
                      title="Reset to auto-derived value"
                      onClick={() => handleLabelReset(key)}
                      className="ml-auto shrink-0 flex items-center justify-center h-4 w-4 rounded hover:bg-[var(--color-surface-hover)]"
                    >
                      <RefreshCw className="h-2.5 w-2.5 text-[var(--color-ink-muted-foreground)]" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function snapshotDerived(): Record<string, string> {
  const style = getComputedStyle(document.documentElement);
  const result: Record<string, string> = {};
  for (const key of DERIVED_KEYS) {
    result[key] = style.getPropertyValue(`--color-${key}`).trim();
  }
  return result;
}
