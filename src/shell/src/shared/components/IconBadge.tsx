import {
  Circle,
  Dna,
  Rat,
  Leaf,
  Cog,
  NotebookText,
  User,
  Folder,
  FlaskConical,
  ScrollText,
  TestTubes,
  AlertTriangle,
  Activity,
  BarChart3,
  Beaker,
  CircleDollarSign,
  Clock,
  FileText,
  Thermometer,
  TrendingUp,
  CheckCircle,
} from "lucide-react";
import type { ComponentType } from "react";

export interface IconBadgeProps {
  iconKey: string;
  colorKey: string;
  size?: "sm" | "md" | "lg";
  onChange?: () => void;
}

const FALLBACK_ICON = Circle;
const FALLBACK_COLOR_HEX = "#d9d9d9";

const COLOR_HEX_MAP: Record<string, string> = {
  enzyme: "#d9b3e6",
  flask: "#b3d9e6",
  solvent: "#b3e6c8",
  warn: "#e6d9b3",
  primary: "#7fb3d9",
  success: "#b3e6b3",
  destructive: "#e6b3b3",
  muted: "#d9d9d9",
};

const ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  circle: Circle,
  dna: Dna,
  rat: Rat,
  leaf: Leaf,
  cog: Cog,
  notebook: NotebookText,
  user: User,
  folder: Folder,
  "flask-conical": FlaskConical,
  "scroll-text": ScrollText,
  "test-tubes": TestTubes,
  "alert-triangle": AlertTriangle,
  activity: Activity,
  "bar-chart-3": BarChart3,
  beaker: Beaker,
  "circle-dollar-sign": CircleDollarSign,
  clock: Clock,
  "file-text": FileText,
  thermometer: Thermometer,
  "trending-up": TrendingUp,
  "check-circle": CheckCircle,
};

export function resolveIcon(key: string): ComponentType<{ className?: string }> {
  return ICON_MAP[key] ?? FALLBACK_ICON;
}

export function resolveColorHex(key: string): string {
  return COLOR_HEX_MAP[key] ?? FALLBACK_COLOR_HEX;
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

export function IconBadge({
  iconKey,
  colorKey,
  size = "md",
  onChange,
}: IconBadgeProps) {
  const IconComponent = resolveIcon(iconKey);
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
        <IconComponent className={icon} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      data-testid="icon-badge"
      className={`${box} rounded border border-border flex shrink-0 items-center justify-center`}
      style={style}
    >
      <IconComponent className={icon} aria-hidden="true" />
    </div>
  );
}
