import { Circle } from "lucide-react";
import type { ComponentType } from "react";
import { useMemo, lazy, Suspense } from "react";
import { ModRegistry } from "../../mod-system/ModRegistry";

export interface IconBadgeProps {
  iconKey: string;
  colorKey: string;
  size?: "sm" | "md" | "lg";
  onChange?: () => void;
}

const FALLBACK_COLOR_HEX = "#d9d9d9";
const warnedKeys = new Set<string>();

export function warnMissingIcon(key: string) {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(
    `[IconBadge] Unknown icon key "${key}" — not found in the icon library. Falling back to a circle.`,
  );
}

export function resolveColorHex(key: string): string {
  return `var(--color-label-${key}, ${resolveColorRaw(key)})`;
}

export function resolveColorForeground(key: string): string {
  const shade = deriveShade(resolveColorRaw(key));
  return `var(--color-label-${key}-foreground, ${shade})`;
}

function resolveColorRaw(key: string): string {
  try {
    const entry = ModRegistry.getInstance().getColorPalette().get(key);
    if (entry) return entry.hex;
  } catch {
    // registry not available
  }
  return FALLBACK_COLOR_HEX;
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round((n + m) * 255)));
  return "#" + rgb.map((c) => clamp(c).toString(16).padStart(2, "0")).join("");
}

export function deriveShade(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(100, s * 1.15), l * 0.42);
}

export function deriveForeground(hex: string): string {
  return deriveShade(hex);
}

const SIZE_CLASSES: Record<
  NonNullable<IconBadgeProps["size"]>,
  { box: string; icon: string }
> = {
  sm: { box: "h-6 w-6", icon: "h-3.5 w-3.5" },
  md: { box: "h-9 w-9", icon: "h-5 w-5" },
  lg: { box: "h-12 w-12", icon: "h-7 w-7" },
};

// ── Dynamic Lucide icon imports ─────────────────────────────────────────

let _dynamicIconImports: Record<
  string,
  () => Promise<{ default: ComponentType<{ className?: string }> }>
> | null = null;

function getIconImport(
  token: string,
): (() => Promise<{ default: ComponentType<{ className?: string }> }>) | undefined {
  if (!_dynamicIconImports) return undefined;
  return _dynamicIconImports[token];
}

function loadDynamicIconImports() {
  if (_dynamicIconImports) return;
  import("lucide-react/dynamicIconImports")
    .then((mod) => {
      _dynamicIconImports = mod.default as unknown as Record<
        string,
        () => Promise<{ default: ComponentType<{ className?: string }> }>
      >;
    })
    .catch(() => {
      // dynamic imports unavailable (e.g. test environment) — fall back gracefully
    });
}
loadDynamicIconImports();

export function LazyIcon({
  token,
  className,
}: {
  token: string;
  className?: string;
}) {
  const Component = useMemo(() => {
    const importFn = getIconImport(token);
    if (!importFn) return null;
    return lazy(importFn);
  }, [token]);

  if (!Component) {
    return <Circle className={className} />;
  }

  return (
    <Suspense fallback={<div className={className} />}>
      <Component className={className} />
    </Suspense>
  );
}

function CustomSvg({
  svg,
  className,
}: {
  svg: string;
  className?: string;
}) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-hidden="true"
    />
  );
}

// ── Resolution helpers ──────────────────────────────────────────────────

function resolveDynamicIcon(
  iconKey: string,
  iconClass: string,
) {
  let entry;
  try {
    entry = ModRegistry.getInstance().getIconLibrary().get(iconKey);
  } catch {
    // registry not available
  }

  if (entry) {
    if (entry.kind === "lucide" && entry.token) {
      return <LazyIcon token={entry.token} className={iconClass} />;
    }
    if (entry.kind === "custom" && entry.svg) {
      return <CustomSvg svg={entry.svg} className={iconClass} />;
    }
  }

  warnMissingIcon(iconKey);
  return <Circle className={iconClass} aria-hidden="true" />;
}

// ── IconBadge component ─────────────────────────────────────────────────

export function IconBadge({
  iconKey,
  colorKey,
  size = "md",
  onChange,
}: IconBadgeProps) {
  const hex = resolveColorHex(colorKey);
  const foreground = resolveColorForeground(colorKey);
  const { box, icon } = SIZE_CLASSES[size];

  const style = { backgroundColor: hex, color: foreground };

  if (onChange) {
    return (
      <button
        type="button"
        data-testid="icon-badge"
        className={`${box} rounded flex shrink-0 items-center justify-center cursor-pointer`}
        style={style}
        onClick={onChange}
        aria-label="Change icon"
      >
        {resolveDynamicIcon(iconKey, icon)}
      </button>
    );
  }

  return (
    <div
      data-testid="icon-badge"
      className={`${box} rounded flex shrink-0 items-center justify-center`}
      style={style}
    >
      {resolveDynamicIcon(iconKey, icon)}
    </div>
  );
}
