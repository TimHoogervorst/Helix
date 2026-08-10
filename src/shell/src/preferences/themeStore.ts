import type { ThemeSeeds, Theme, DerivedOverride } from "../shared/applyTheme";
import { applyTheme as applyThemeUnified, DEFAULT_SEEDS } from "../shared/applyTheme";

export type { Theme } from "../shared/applyTheme";

const STORAGE_KEY = "helix-active-theme";
const CUSTOM_STORAGE_KEY = "helix-custom-themes";
const DEFAULT_ID = "original";

const themeModules = import.meta.glob<Record<string, unknown>>(
  "./themes/*.json",
  { eager: true },
);

function validateTheme(raw: unknown): Theme | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string") return null;
  if (typeof obj.name !== "string") return null;
  if (typeof obj.description !== "string") return null;
  if (obj.mode !== "light" && obj.mode !== "dark") return null;
  if (typeof obj.seeds !== "object" || obj.seeds === null) return null;
  const seeds = obj.seeds as Record<string, unknown>;
  if (
    typeof seeds.background !== "string" ||
    typeof seeds.surface !== "string" ||
    typeof seeds.card !== "string" ||
    typeof seeds.ink !== "string" ||
    typeof seeds.primary !== "string" ||
    typeof seeds.accent !== "string"
  )
    return null;

  let derived: Record<string, DerivedOverride> | undefined;
  if (obj.derived !== undefined) {
    if (typeof obj.derived !== "object" || obj.derived === null) return null;
    const derivedObj = obj.derived as Record<string, unknown>;
    derived = {};
    for (const key of Object.keys(derivedObj)) {
      const val = derivedObj[key];
      if (
        typeof val !== "object" ||
        val === null ||
        typeof (val as Record<string, unknown>).expected !== "string" ||
        typeof (val as Record<string, unknown>).value !== "string"
      )
        return null;
      derived[key] = {
        expected: (val as Record<string, string>).expected,
        value: (val as Record<string, string>).value,
      };
    }
  }

  let fonts: { label: string; body: string } | undefined;
  if (obj.fonts !== undefined) {
    if (typeof obj.fonts !== "object" || obj.fonts === null) return null;
    const fontsObj = obj.fonts as Record<string, unknown>;
    if (
      typeof fontsObj.label !== "string" ||
      typeof fontsObj.body !== "string"
    )
      return null;
    fonts = { label: fontsObj.label, body: fontsObj.body };
  }

  let labels: Record<string, string> | undefined;
  if (obj.labels !== undefined) {
    if (typeof obj.labels !== "object" || obj.labels === null) return null;
    labels = {};
    for (const [k, v] of Object.entries(obj.labels)) {
      if (typeof k !== "string" || typeof v !== "string") return null;
      labels[k] = v;
    }
  }

  return {
    id: obj.id,
    name: obj.name,
    description: obj.description,
    mode: obj.mode as "light" | "dark",
    seeds: {
      background: seeds.background,
      surface: seeds.surface,
      card: seeds.card,
      ink: seeds.ink,
      primary: seeds.primary,
      accent: seeds.accent,
    },
    derived,
    fonts,
    labels,
  };
}

function loadBuiltins(): Theme[] {
  const themes: Theme[] = [];
  for (const [filePath, raw] of Object.entries(themeModules)) {
    const theme = validateTheme(raw);
    if (theme) {
      themes.push(theme);
    } else {
      console.warn(`[themes] Skipping malformed theme file: ${filePath}`);
    }
  }
  return themes;
}

const builtins: Theme[] = loadBuiltins();

function getBuiltinById(id: string): Theme | undefined {
  return builtins.find((t) => t.id === id);
}

function readActiveId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_ID;
  } catch {
    return DEFAULT_ID;
  }
}

function writeActiveId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable — ignore
  }
}

function readCustomThemes(): Theme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item: unknown): item is Theme =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).id === "string" &&
          typeof (item as Record<string, unknown>).name === "string" &&
          typeof (item as Record<string, unknown>).seeds === "object",
      )
      .map((t) => ({
        ...t,
        mode: (t.mode && (t.mode === "light" || t.mode === "dark")) ? t.mode : "light",
      }));
  } catch {
    return [];
  }
}

function writeCustomThemes(themes: Theme[]): void {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(themes));
  } catch {
    // storage unavailable — ignore
  }
}

function getCustomById(id: string): Theme | undefined {
  return readCustomThemes().find((t) => t.id === id);
}

function getThemeById(id: string): Theme | undefined {
  const builtin = getBuiltinById(id);
  if (builtin) return builtin;
  const custom = getCustomById(id);
  if (custom) return { ...custom, description: "" };
  return undefined;
}

export function getSeedsForTheme(id: string): ThemeSeeds {
  const theme = getThemeById(id);
  if (theme) return theme.seeds;
  const fallback = getBuiltinById(DEFAULT_ID);
  return fallback ? fallback.seeds : DEFAULT_SEEDS;
}

export function getThemeForTheme(id: string): Theme | undefined {
  return getThemeById(id);
}

export function getActiveThemeId(): string {
  const id = readActiveId();
  if (getBuiltinById(id)) return id;
  if (getCustomById(id)) return id;
  return DEFAULT_ID;
}

export function getThemes(): Theme[] {
  const customs = readCustomThemes();
  const customThemes: Theme[] = customs.map((c) => ({
    ...c,
    description: "",
  }));
  return [...builtins, ...customThemes];
}

export function getActiveTheme(): Theme {
  const id = getActiveThemeId();
  const builtin = getBuiltinById(id);
  if (builtin) return builtin;
  const custom = getCustomById(id);
  if (custom) return { ...custom, description: "" };
  return getBuiltinById(DEFAULT_ID)!;
}

export function applyTheme(id: string): void {
  const theme = getThemeById(id);
  if (theme) {
    applyThemeUnified(theme);
  }
  writeActiveId(id);
}

export function bootActiveTheme(): void {
  const id = getActiveThemeId();
  applyTheme(id);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function saveCustomTheme(theme: Theme): string {
  const slug = slugify(theme.name);
  const random = Math.random().toString(36).slice(2, 8);
  const id = `custom-${slug}-${random}`;
  const customs = readCustomThemes();
  customs.push({ ...theme, id });
  writeCustomThemes(customs);
  applyTheme(id);
  return id;
}

export function deleteCustomTheme(id: string): void {
  const customs = readCustomThemes().filter((c) => c.id !== id);
  writeCustomThemes(customs);
  const activeId = readActiveId();
  if (activeId === id) {
    applyTheme(DEFAULT_ID);
  }
}

bootActiveTheme();
