
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
