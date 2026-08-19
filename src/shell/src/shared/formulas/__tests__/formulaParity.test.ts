import { describe, expect, it } from "vitest";
import { evaluateFormula, evaluateRow } from "../formulaEngine";
import { evaluateCellFormulas, rewriteCellFormulaRows } from "../cellFormulas";
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

  it("resolves data-row references and rewrites them like a spreadsheet", () => {
    expect(
      evaluateCellFormulas(
        [{ Amount: 2 }, { Amount: 5 }],
        { "0": { Total: "=[Amount:2] * 2" } },
      )[0].Total,
    ).toEqual({ ok: true, value: 10 });
    expect(
      rewriteCellFormulaRows(
        { "0": { Total: "=[Amount:2]" }, "1": { Total: "=[Amount:1]" } },
        1,
        "delete",
      ),
    ).toEqual({ "0": { Total: "=[#REF!]" } });
    expect(
      rewriteCellFormulaRows({ "0": { Total: "=[Amount:2]" } }, 1, "insert"),
    ).toEqual({ "0": { Total: "=[Amount:3]" } });
  });
});
