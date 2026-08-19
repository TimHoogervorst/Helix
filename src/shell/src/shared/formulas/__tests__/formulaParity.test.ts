import { describe, expect, it } from "vitest";
import { evaluateFormula, evaluateRow } from "../formulaEngine";
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
});
