import { describe, expect, it } from "vitest";
import {
  evaluateFormula,
  evaluateRow,
  functionCallsIn,
  getClientFormulaFunctionIds,
  hydrateFormulaCatalog,
  parseFormula,
  usesBackendOnlyFunction,
  walkFormulaAst,
} from "../formulaEngine";
import fixtures from "../parity.json";

type Fixture = {
  name: string;
  expression?: string;
  row: Record<string, string | number | boolean | null>;
  formulas?: Record<string, { expression: string }>;
  expected?: object;
  expectedRow?: object;
};
const parityFixtures = fixtures as Fixture[];

describe("formula parity fixtures", () => {
  it.each(parityFixtures.filter((fixture) => fixture.expression))(
    "evaluates $name",
    (fixture) => {
      expect(
        evaluateFormula(
          fixture.expression!,
          fixture.row as Record<string, string | number | boolean | null>,
        ),
      ).toMatchObject(fixture.expected as object);
    },
  );

  it("evaluates formula dependencies and reports cycles", () => {
    expect(
      evaluateRow(
        { Amount: 12, Count: 3 },
        {
          Ratio: { expression: "[Amount] / [Count]" },
          Rounded: { expression: "ROUND([Ratio], 1)" },
        },
      ).Rounded,
    ).toEqual({ ok: true, value: 4 });
    const fixture = parityFixtures.find((item) => item.name === "cycle")!;
    expect(evaluateRow(fixture.row, fixture.formulas!)).toMatchObject(
      fixture.expectedRow!,
    );
  });

  it("extracts function calls from the parsed AST", () => {
    expect(functionCallsIn("IF(AND(TRUE, NOT(FALSE)), ROUND([Amount], 1), 0)"))
      .toEqual(["IF", "AND", "NOT", "ROUND"]);
    expect(functionCallsIn("molBio.gcContent([Sequence])")).toEqual([
      "molBio.gcContent",
    ]);
    expect(functionCallsIn('"NOPE(1)"')).toEqual([]);
    expect(functionCallsIn("[Amount] +")).toEqual([]);
  });

  it("walks a parsed AST without extracting function-like string text", () => {
    const parsed = parseFormula('CONCAT("NOPE(1)", [Name])');
    const nodes: string[] = [];

    if (parsed.ok && parsed.ast) {
      walkFormulaAst(parsed.ast, (node) => nodes.push(node.kind));
    }

    expect(nodes).toEqual(["call", "literal", "reference"]);
  });

  it("detects calls without hydrated client implementations", () => {
    const clientFunctionIds = new Set(["IF"]);

    expect(usesBackendOnlyFunction("IF(TRUE, 1, 0)", clientFunctionIds)).toBe(
      false,
    );
    expect(
      usesBackendOnlyFunction("molBio.gcContent([Sequence])", clientFunctionIds),
    ).toBe(true);
    expect(usesBackendOnlyFunction('"SQRT(1)"', clientFunctionIds)).toBe(false);
    expect(usesBackendOnlyFunction("[Amount] +", clientFunctionIds)).toBe(false);
  });

  it("uses the hydrated client-function catalog by default", () => {
    const originalIds = [...getClientFormulaFunctionIds()];
    try {
      hydrateFormulaCatalog(["IF", "molBio.gcContent"]);
      expect(usesBackendOnlyFunction("molBio.gcContent([Sequence])")).toBe(true);
    } finally {
      hydrateFormulaCatalog(originalIds);
    }
  });

});
