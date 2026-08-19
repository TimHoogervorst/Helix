import {
  evaluateCellFormula,
  type FormulaResult,
  type FormulaRow,
} from "./formulaEngine";

export type CellFormulaMap = Record<string, Record<string, string>>;

export function formulaText(value: unknown): string | undefined {
  return typeof value === "string" && value.trimStart().startsWith("=")
    ? value
    : undefined;
}

export function evaluateCellFormulas(
  rows: FormulaRow[],
  formulas: CellFormulaMap = {},
  forbiddenColumns?: ReadonlySet<string>,
): Record<string, FormulaResult>[] {
  const output: Record<string, FormulaResult>[] = [];
  const states = new Map<string, "visiting" | "done">();
  const visit = (rowIndex: number, column: string): FormulaResult => {
    const key = `${rowIndex}:${column}`;
    const expression = formulas[String(rowIndex)]?.[column];
    if (!expression) return { ok: true, value: rows[rowIndex]?.[column] ?? null };
    if (states.get(key) === "visiting") {
      return { ok: false, error: { code: "#CYCLE!", message: key } };
    }
    if (states.get(key) === "done") return output[rowIndex][column];
    states.set(key, "visiting");
    const row = { ...(rows[rowIndex] ?? {}) };
    const resolvedRows = rows.map((source, index) => {
      const resolved = { ...source };
      for (const name of Object.keys(formulas[String(index)] ?? {})) {
        const result = visit(index, name);
        resolved[name] = result.ok ? result.value : null;
      }
      return resolved;
    });
    const result = evaluateCellFormula(expression, row, {
      rows: resolvedRows,
      rowIndex,
      forbiddenColumns,
    });
    output[rowIndex] ??= {};
    output[rowIndex][column] = result;
    states.set(key, "done");
    return result;
  };
  rows.forEach((row, rowIndex) => {
    output[rowIndex] = Object.fromEntries(
      Object.entries(row).map(([column, value]) => [column, { ok: true, value }]),
    );
    Object.keys(formulas[String(rowIndex)] ?? {}).forEach((column) => visit(rowIndex, column));
  });
  return output;
}

function rewriteReference(expression: string, row: number, delta: 1 | -1) {
  return expression.replace(/\[([^\]]+):(\d+)\]/g, (_full, column: string, raw: string) => {
    const current = Number(raw);
    if (delta === 1) return `[${column}:${current >= row ? current + 1 : current}]`;
    if (current === row) return "[#REF!]";
    return `[${column}:${current > row ? current - 1 : current}]`;
  });
}

export function rewriteCellFormulaRows(
  formulas: CellFormulaMap,
  row: number,
  operation: "insert" | "delete",
): CellFormulaMap {
  const next: CellFormulaMap = {};
  Object.entries(formulas).forEach(([key, values]) => {
    const index = Number(key);
    if (operation === "delete" && index === row) return;
    const target = operation === "insert" && index >= row
      ? index + 1
      : operation === "delete" && index > row
        ? index - 1
        : index;
    next[String(target)] = Object.fromEntries(
      Object.entries(values).map(([column, expression]) => [
        column,
        rewriteReference(expression, row + 1, operation === "insert" ? 1 : -1),
      ]),
    );
  });
  return next;
}
