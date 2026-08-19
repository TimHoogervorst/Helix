import { useEffect, useMemo, useState } from "react";
import { post } from "../../../shell/src/api/client";
import { Button } from "../../../shell/src/shared/primitives/Button";
import { Input } from "../../../shell/src/shared/primitives/Input";
import { Select } from "../../../shell/src/shared/primitives/Input";
import { Modal } from "../../../shell/src/shared/primitives/Modal";
import { ModRegistry } from "../../../shell/src/mod-system/ModRegistry";
import { evaluateRow, type FormulaResult } from "../../../shell/src/shared/formulas/formulaEngine";
import type { ColumnDef } from "../types";

interface FormulaEditorModalProps {
  open: boolean;
  column: ColumnDef;
  siblingColumns: ColumnDef[];
  onClose: () => void;
  onSave: (expression: string, resultType: string) => void;
}

function sampleValue(value: string): string | number | boolean | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const number = Number(trimmed);
  return Number.isNaN(number) ? value : number;
}

export default function FormulaEditorModal({
  open,
  column,
  siblingColumns,
  onClose,
  onSave,
}: FormulaEditorModalProps) {
  const [expression, setExpression] = useState(column.expression ?? "");
  const [resultType, setResultType] = useState(column.resultType ?? "text");
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [evaluation, setEvaluation] = useState<FormulaResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!open) return;
    setExpression(column.expression ?? "");
    setResultType(column.resultType ?? "text");
    setSamples({});
    setEvaluation(null);
  }, [column.expression, column.resultType, open]);

  const names = useMemo(
    () => siblingColumns.filter((item) => item.name.trim()).map((item) => item.name.trim()),
    [siblingColumns],
  );
  const references = useMemo(
    () => [...expression.matchAll(/\[([^\]]*)\]/g)].map((match) => match[1].trim()).filter(Boolean),
    [expression],
  );
  const catalog = [...ModRegistry.getInstance().getFormulaFunctions().values()];
  const catalogIds = new Set(catalog.map((item) => item.id));
  const validation = useMemo(() => {
    if (!expression.trim()) return null;
    const formulas = Object.fromEntries(
      siblingColumns
        .filter((item) => item.type === "formula" && item.name.trim() && item.expression)
        .map((item) => [item.name.trim(), { expression: item.expression! }]),
    );
    formulas[column.name] = { expression };
    const formulaNames = new Set(Object.keys(formulas));
    const row = Object.fromEntries(
      names.filter((name) => !formulaNames.has(name)).map((name) => [name, 1]),
    );
    const results = evaluateRow(row, formulas);
    const invalid = Object.entries(results).find(([name, result]) => {
      if (result.ok) return false;
      if (result.error.code !== "#NAME?") return true;
      const formulaCalls = [...(formulas[name]?.expression ?? "").matchAll(/\b([A-Za-z_][\w.]*)\s*\(/g)].map(
        (match) => match[1],
      );
      return !formulaCalls.every((functionName) => catalogIds.has(functionName));
    });
    return invalid && !invalid[1].ok ? invalid[1].error : null;
  }, [catalogIds, column.name, expression, names, siblingColumns]);
  const suggestions = [
    ...names.map((name) => ({ id: name, label: `[${name}]`, description: "Sibling column" })),
    ...catalog.map((item) => ({
      id: item.id,
      label: `${item.id}(${item.argumentKinds.join(", ")})`,
      description: item.description,
    })),
  ];

  const insertSuggestion = (value: string) => {
    setExpression((current) => `${current}${value}`);
    setShowSuggestions(false);
  };

  const evaluate = async () => {
    setEvaluating(true);
    try {
      const row = Object.fromEntries(
        references.map((name) => [name, sampleValue(samples[name] ?? "")]),
      );
      const response = await post<{ result: FormulaResult }>("/formulas/evaluate/", {
        expression,
        row,
      });
      setEvaluation(response.result);
    } catch (error) {
      setEvaluation({
        ok: false,
        error: { code: "#VALUE!", message: error instanceof Error ? error.message : "Evaluation failed" },
      });
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Formula Editor: ${column.name || "New field"}`} className="max-w-2xl">
      <div className="space-y-4">
        <div className="relative">
          <label className="mb-1 block text-xs font-medium text-[var(--color-ink-muted-foreground)]" htmlFor="formula-expression">
            Expression
          </label>
          <Input
            id="formula-expression"
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 0)}
            aria-label="Formula expression"
            placeholder="e.g. [Amount] * [Count]"
          />
          {showSuggestions && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-md border border-[var(--color-ink-hairline)] bg-[var(--color-card)] p-1 shadow-lg" data-testid="formula-autocomplete">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="block! w-full justify-start! rounded px-2 py-1.5 text-left text-xs font-normal!"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertSuggestion(suggestion.label)}
                >
                  <span className="font-medium text-[var(--color-ink)]">{suggestion.label}</span>
                  <span className="ml-2 text-[var(--color-ink-muted-foreground)]">{suggestion.description}</span>
                </Button>
              ))}
            </div>
          )}
        </div>

        {validation && (
          <p className="text-xs text-[var(--color-warning)]" role="alert">
            {validation.code}: {validation.message}
          </p>
        )}

        <label className="block text-xs font-medium text-[var(--color-ink-muted-foreground)]">
          Result type
          <Select
            value={resultType}
            onChange={(event) => setResultType(event.target.value)}
            aria-label="Formula result type"
            className="mt-1 block w-full"
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="boolean">Boolean</option>
          </Select>
        </label>

        <section className="rounded-md border border-[var(--color-ink-hairline)] p-3">
          <h3 className="text-sm font-medium text-[var(--color-ink)]">Test bench</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {references.map((name) => (
              <label key={name} className="text-xs text-[var(--color-ink-muted-foreground)]">
                {name}
                <Input
                  value={samples[name] ?? ""}
                  onChange={(event) => setSamples((current) => ({ ...current, [name]: event.target.value }))}
                  aria-label={`Sample value for ${name}`}
                  className="mt-1"
                />
              </label>
            ))}
          </div>
          <Button type="button" size="sm" className="mt-3" onClick={evaluate} disabled={!expression.trim() || evaluating}>
            {evaluating ? "Evaluating..." : "Evaluate"}
          </Button>
          {evaluation && (
            <p className="mt-3 text-sm" data-testid="formula-evaluation-result">
              {evaluation.ok ? String(evaluation.value) : `${evaluation.error.code}: ${evaluation.error.message}`}
            </p>
          )}
        </section>

        <div className="flex justify-end gap-2 border-t border-[var(--color-ink-hairline)] pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => onSave(expression, resultType)} disabled={Boolean(validation) || !expression.trim()}>
            Save expression
          </Button>
        </div>
      </div>
    </Modal>
  );
}
