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
  try {
    const entry = ModRegistry.getInstance().getColorPalette().get(key);
    if (entry) return entry.hex;
  } catch {
    // registry not available
  }
  return FALLBACK_COLOR_HEX;
}

export function deriveForeground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const rLin = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gLin = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bLin = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  const luminance = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;

  return luminance > 0.5 ? "#1a1a1a" : "#ffffff";
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
  const foreground = deriveForeground(hex);
  const { box, icon } = SIZE_CLASSES[size];

  const style = { backgroundColor: hex, color: foreground };

  if (onChange) {
    return (
      <button
        type="button"
        data-testid="icon-badge"
        className={`${box} rounded border border-border flex shrink-0 items-center justify-center cursor-pointer`}
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
      className={`${box} rounded border border-border flex shrink-0 items-center justify-center`}
      style={style}
    >
      {resolveDynamicIcon(iconKey, icon)}
    </div>
  );
}
