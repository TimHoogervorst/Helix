export interface ThemeSeeds {
  background: string;
  surface: string;
  ink: string;
  primary: string;
  accent: string;
}

export function applyThemeSeeds(seeds: ThemeSeeds): void {
  const root = document.documentElement;
  root.style.setProperty("--color-background", seeds.background);
  root.style.setProperty("--color-surface", seeds.surface);
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
    ink: style.getPropertyValue("--color-ink").trim(),
    primary: style.getPropertyValue("--color-primary").trim(),
    accent: style.getPropertyValue("--color-accent").trim(),
  };
}

export const DEFAULT_SEEDS: ThemeSeeds = {
  background: "oklch(0.985 0.005 95)",
  surface: "oklch(0.975 0.008 95)",
  ink: "oklch(0.22 0.02 260)",
  primary: "oklch(0.42 0.08 195)",
  accent: "oklch(0.94 0.03 180)",
};
