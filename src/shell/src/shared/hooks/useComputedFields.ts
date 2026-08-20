import { useCallback, useRef, useState } from "react";
import { post } from "../../api/client";
import type { GridColumn } from "../types/types";
import {
  evaluateRow,
  functionCallsIn,
  parseFormula,
  usesBackendOnlyFunction,
  walkFormulaAst,
  type FormulaColumn,
  type FormulaRow,
} from "../formulas/formulaEngine";

export interface ComputedFieldRow {
  displayId: string;
  values: Record<string, unknown>;
}

export interface UseComputedFieldsOptions {
  columns: readonly GridColumn[];
  enabled: boolean;
  applyRowValues: (displayId: string, values: Record<string, unknown>) => void;
}

export interface ComputedFields {
  computedValues: (row: ComputedFieldRow) => Record<string, unknown>;
  backendOnlyColumns: GridColumn[];
  refresh: (row: ComputedFieldRow) => Promise<void>;
  isRefreshing: (displayId: string) => boolean;
  isStale: (row: ComputedFieldRow, columnName: string) => boolean;
  markRefreshed: (displayId: string, values: Record<string, unknown>) => void;
}

interface FormulaEvaluateResponse {
  results: Record<string, {
    ok: boolean;
    value?: unknown;
    error?: { code: string };
  }>;
}

/** Return column references from the parsed expression, including nested calls. */
export function referencesIn(expression: string): string[] {
  const parsed = parseFormula(expression);
  if (!parsed.ok || !parsed.ast) return [];

  const references: string[] = [];
  walkFormulaAst(parsed.ast, (node) => {
    if (node.kind === "reference") references.push(node.name);
  });
  return references;
}

function formulaColumns(columns: readonly GridColumn[]): GridColumn[] {
  return columns.filter((column) => column.type === "formula" && column.expression);
}

function snapshot(values: Record<string, unknown>, formulaNames: ReadonlySet<string>): string {
  const inputs = Object.keys(values)
    .filter((name) => !formulaNames.has(name))
    .sort()
    .reduce<Record<string, unknown>>((result, name) => {
      result[name] = values[name];
      return result;
    }, {});
  return JSON.stringify(inputs);
}

function complete(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function formulaDefinitions(columns: readonly GridColumn[]): Record<string, FormulaColumn> {
  return Object.fromEntries(
    formulaColumns(columns).map((column) => [
      column.name,
      { expression: column.expression! } satisfies FormulaColumn,
    ]),
  );
}

export function useComputedFields({
  columns,
  enabled,
  applyRowValues,
}: UseComputedFieldsOptions): ComputedFields {
  const formulas = formulaColumns(columns);
  const formulaNames = new Set(formulas.map((column) => column.name));
  const backendOnlyColumns = formulas.filter((column) =>
    usesBackendOnlyFunction(column.expression!),
  );
  const [refreshing, setRefreshing] = useState<Set<string>>(() => new Set());
  const refreshingRef = useRef(new Set<string>());
  const refreshedSnapshots = useRef(new Map<string, string>());

  const computedValues = useCallback(
    (row: ComputedFieldRow) => {
      const evaluated = evaluateRow(
        row.values as FormulaRow,
        formulaDefinitions(columns),
      );
      const values = { ...row.values };
      for (const column of formulas) {
        const result = evaluated[column.name];
        if (usesBackendOnlyFunction(column.expression!)) continue;
        values[column.name] = result?.ok ? result.value : result?.error.code;
      }
      return values;
    },
    [columns, formulas],
  );

  const refresh = useCallback(
    async (row: ComputedFieldRow) => {
      if (!enabled || !backendOnlyColumns.length || refreshingRef.current.has(row.displayId)) {
        return;
      }

      // A backend formula may depend on a formula that can be calculated locally,
      // so only non-formula references participate in the initial gate.
      const hasIncompleteInput = backendOnlyColumns.some((column) =>
        referencesIn(column.expression!).some(
          (name) => !formulaNames.has(name) && !complete(row.values[name]),
        ),
      );
      if (hasIncompleteInput) return;

      refreshingRef.current.add(row.displayId);
      setRefreshing((current) => new Set(current).add(row.displayId));
      const values = { ...row.values };
      for (const name of formulaNames) delete values[name];
      const pending = [...formulas];

      try {
        while (pending.length) {
          const ready = pending.filter((column) =>
            referencesIn(column.expression!).every((name) => complete(values[name])),
          );
          if (!ready.length) break;

          const response = await post<FormulaEvaluateResponse>(
            "/formulas/evaluate/",
            {
              expressions: Object.fromEntries(
                ready.map((column) => [column.name, column.expression]),
              ),
              row: { ...values },
            },
          );
          for (const column of ready) {
            const result = response.results[column.name];
            values[column.name] = result?.ok
              ? result.value
              : (result?.error?.code ?? "#VALUE!");
            pending.splice(pending.indexOf(column), 1);
          }
        }

        if (pending.length < formulas.length) {
          applyRowValues(row.displayId, values);
          refreshedSnapshots.current.set(
            row.displayId,
            snapshot(values, formulaNames),
          );
        }
      } finally {
        refreshingRef.current.delete(row.displayId);
        setRefreshing((current) => {
          const next = new Set(current);
          next.delete(row.displayId);
          return next;
        });
      }
    },
    [applyRowValues, backendOnlyColumns, enabled, formulas, formulaNames],
  );

  const isRefreshing = useCallback(
    (displayId: string) => refreshing.has(displayId),
    [refreshing],
  );

  const isStale = useCallback(
    (row: ComputedFieldRow, columnName: string) => {
      if (!backendOnlyColumns.some((column) => column.name === columnName)) {
        return false;
      }
      const refreshed = refreshedSnapshots.current.get(row.displayId);
      return refreshed !== undefined && refreshed !== snapshot(row.values, formulaNames);
    },
    [backendOnlyColumns, formulaNames],
  );

  const markRefreshed = useCallback(
    (displayId: string, values: Record<string, unknown>) => {
      refreshedSnapshots.current.set(displayId, snapshot(values, formulaNames));
    },
    [formulaNames],
  );

  return {
    computedValues,
    backendOnlyColumns,
    refresh,
    isRefreshing,
    isStale,
    markRefreshed,
  };
}

export { functionCallsIn, usesBackendOnlyFunction };
