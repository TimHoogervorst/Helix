import {
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
  type LucideIcon,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export type ComparisonOp = "lt" | "lte" | "gt" | "gte" | "eq" | "neq";

export interface FormattingRule {
  when: {
    op: ComparisonOp;
    value: number;
  };
  color?: string;
  icon?: string;
  text?: string | null;
}

export interface FormattingStyle {
  color: string;
  icon: string;
  text: string | null;
}

export interface FormattingConfig {
  rules: FormattingRule[];
  default: FormattingStyle;
}

// ── Semantic Color Tokens ──────────────────────────────────────────────────

export const CARD_COLOR_TOKENS = [
  "flask",
  "enzyme",
  "solvent",
  "warn",
  "success",
  "muted",
] as const;

export type CardColorToken = (typeof CARD_COLOR_TOKENS)[number];

export const CARD_COLOR_CLASSES: Record<
  CardColorToken,
  { bg: string; text: string }
> = {
  flask: { bg: "bg-flask", text: "text-flask-foreground" },
  enzyme: { bg: "bg-enzyme", text: "text-enzyme-foreground" },
  solvent: { bg: "bg-solvent", text: "text-solvent-foreground" },
  warn: { bg: "bg-warn", text: "text-warn-foreground" },
  success: { bg: "bg-success", text: "text-success-foreground" },
  muted: { bg: "bg-muted", text: "text-muted-foreground" },
};

export const CARD_COLOR_LABELS: Record<CardColorToken, string> = {
  flask: "Flask",
  enzyme: "Enzyme",
  solvent: "Solvent",
  warn: "Warn",
  success: "Success",
  muted: "Muted",
};

// ── Curated Icon Set ───────────────────────────────────────────────────────

export const CARD_ICONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "flask-conical", label: "Flask", Icon: FlaskConical },
  { key: "scroll-text", label: "Scroll", Icon: ScrollText },
  { key: "test-tubes", label: "Test Tubes", Icon: TestTubes },
  { key: "alert-triangle", label: "Alert", Icon: AlertTriangle },
  { key: "activity", label: "Activity", Icon: Activity },
  { key: "bar-chart-3", label: "Chart", Icon: BarChart3 },
  { key: "beaker", label: "Beaker", Icon: Beaker },
  { key: "circle-dollar-sign", label: "Dollar", Icon: CircleDollarSign },
  { key: "clock", label: "Clock", Icon: Clock },
  { key: "file-text", label: "File", Icon: FileText },
  { key: "thermometer", label: "Thermometer", Icon: Thermometer },
  { key: "trending-up", label: "Trending", Icon: TrendingUp },
  { key: "check-circle", label: "Check", Icon: CheckCircle },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CARD_ICONS.map(({ key, Icon }) => [key, Icon]),
);

export function resolveIcon(token: string): LucideIcon {
  return ICON_MAP[token] ?? FlaskConical;
}

// ── Rule Comparison ────────────────────────────────────────────────────────

export const COMPARISON_OPS: { value: ComparisonOp; label: string }[] = [
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
];

function evaluateOp(
  actual: number,
  op: ComparisonOp,
  threshold: number,
): boolean {
  switch (op) {
    case "lt":
      return actual < threshold;
    case "lte":
      return actual <= threshold;
    case "gt":
      return actual > threshold;
    case "gte":
      return actual >= threshold;
    case "eq":
      return actual === threshold;
    case "neq":
      return actual !== threshold;
  }
}

// ── Formatting Evaluation ──────────────────────────────────────────────────

const DEFAULT_STYLE: FormattingStyle = {
  color: "muted",
  icon: "flask-conical",
  text: null,
};

export function resolveFormatting(
  value: number | null,
  formatting: FormattingConfig | undefined,
): FormattingStyle {
  if (!formatting || value === null) {
    return { ...DEFAULT_STYLE };
  }

  const def = formatting.default ?? DEFAULT_STYLE;
  const matchedRule = formatting.rules?.find((rule) =>
    rule.when ? evaluateOp(value, rule.when.op, rule.when.value) : false,
  );

  if (!matchedRule) {
    return { ...def };
  }

  return {
    color: matchedRule.color ?? def.color,
    icon: matchedRule.icon ?? def.icon,
    text:
      matchedRule.text != null ? matchedRule.text : def.text,
  };
}

export function applyValueTemplate(
  text: string | null,
  value: number | null,
): string | null {
  if (text === null || value === null) return text;
  return text.replace(/\{value\}/g, String(value));
}

// ── Default Formatting ─────────────────────────────────────────────────────

export function defaultFormatting(): FormattingConfig {
  return {
    rules: [],
    default: { color: "muted", icon: "flask-conical", text: null },
  };
}

export function defaultRuleColor(): string {
  return "warn";
}
