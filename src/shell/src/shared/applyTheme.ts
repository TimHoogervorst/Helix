export interface ThemeSeeds {
  background: string;
  surface: string;
  card: string;
  ink: string;
  primary: string;
  accent: string;
}

export interface DerivedOverride {
  expected: string;
  value: string;
}

export interface ThemeFonts {
  label: string;
  body: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  seeds: ThemeSeeds;
  derived?: Record<string, DerivedOverride>;
  fonts?: ThemeFonts;
  labels?: Record<string, string>;
}

export const DERIVED_KEYS = [
  "background-hover",
  "background-active",
  "background-subtle",
  "background-foreground",
  "surface-hover",
  "surface-active",
  "surface-subtle",
  "surface-foreground",
  "card-hover",
  "card-active",
  "card-subtle",
  "card-foreground",
  "ink-hover",
  "ink-active",
  "ink-subtle",
  "ink-foreground",
  "ink-border",
  "ink-hairline",
  "ink-muted-foreground",
  "primary-hover",
  "primary-active",
  "primary-subtle",
  "primary-foreground",
  "accent-hover",
  "accent-active",
  "accent-subtle",
  "accent-foreground",
] as const;

export const DEFAULT_SEEDS: ThemeSeeds = {
  background: "oklch(0.985 0.005 95)",
  surface: "oklch(0.975 0.008 95)",
  card: "oklch(0.982 0.006 95)",
  ink: "oklch(0.22 0.02 260)",
  primary: "oklch(0.42 0.08 195)",
  accent: "oklch(0.94 0.03 180)",
};

const JETBRAINS_MONO_STACK =
  '"JetBrains Mono Variable", "JetBrains Mono", "SF Mono", "Cascadia Code", Consolas, monospace';
const INTER_STACK =
  '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const DEFAULT_FONTS: ThemeFonts = {
  label: JETBRAINS_MONO_STACK,
  body: INTER_STACK,
};

const DERIVED_CSS_VAR_PREFIX = "--color-";

let _currentLabelKeys: Set<string> = new Set();

function clearDerivedOverrides(root: HTMLElement): void {
  for (const key of DERIVED_KEYS) {
    root.style.removeProperty(`${DERIVED_CSS_VAR_PREFIX}${key}`);
  }
}

function snapshotDerivedValues(root: HTMLElement): Record<string, string> {
  const style = getComputedStyle(root);
  const result: Record<string, string> = {};
  for (const key of DERIVED_KEYS) {
    result[key] = style.getPropertyValue(`${DERIVED_CSS_VAR_PREFIX}${key}`).trim();
  }
  return result;
}

export function applyTheme(theme: Theme, onAdjusted?: (keys: string[]) => void): void {
  const root = document.documentElement;

  root.style.setProperty("--color-background", theme.seeds.background);
  root.style.setProperty("--color-surface", theme.seeds.surface);
  root.style.setProperty("--color-card", theme.seeds.card);
  root.style.setProperty("--color-ink", theme.seeds.ink);
  root.style.setProperty("--color-primary", theme.seeds.primary);
  root.style.setProperty("--color-accent", theme.seeds.accent);

  root.style.setProperty("--font-label", theme.fonts?.label ?? DEFAULT_FONTS.label);
  root.style.setProperty("--font-body", theme.fonts?.body ?? DEFAULT_FONTS.body);

  for (const key of _currentLabelKeys) {
    root.style.removeProperty(`--color-label-${key}`);
    root.style.removeProperty(`--color-label-${key}-foreground`);
  }
  _currentLabelKeys.clear();

  if (theme.labels) {
    for (const [key, value] of Object.entries(theme.labels)) {
      root.style.setProperty(`--color-label-${key}`, value);
      _currentLabelKeys.add(key);
    }
  }

  clearDerivedOverrides(root);

  requestAnimationFrame(() => {
    const autoValues = snapshotDerivedValues(root);
    const adjustedKeys: string[] = [];

    if (theme.derived) {
      for (const key of DERIVED_KEYS) {
        const override = theme.derived[key];
        if (!override) continue;
        if (override.expected !== autoValues[key]) {
          adjustedKeys.push(key);
        }
        root.style.setProperty(`--color-${key}`, override.value);
      }
    }

    onAdjusted?.(adjustedKeys);
  });
}

export function applyThemeSeeds(seeds: ThemeSeeds): void {
  const root = document.documentElement;
  root.style.setProperty("--color-background", seeds.background);
  root.style.setProperty("--color-surface", seeds.surface);
  root.style.setProperty("--color-card", seeds.card);
  root.style.setProperty("--color-ink", seeds.ink);
  root.style.setProperty("--color-primary", seeds.primary);
  root.style.setProperty("--color-accent", seeds.accent);
}

export function getCurrentSeeds(): ThemeSeeds {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  return {
    background: style.getPropertyValue("--color-background").trim(),
    surface: style.getPropertyValue("--color-surface").trim(),
    card: style.getPropertyValue("--color-card").trim(),
    ink: style.getPropertyValue("--color-ink").trim(),
    primary: style.getPropertyValue("--color-primary").trim(),
    accent: style.getPropertyValue("--color-accent").trim(),
  };
}
