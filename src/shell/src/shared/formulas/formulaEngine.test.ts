import { describe, expect, it } from "vitest";
import { evaluateFormula, evaluateRow, parseFormula } from "./formulaEngine";

describe("formula engine", () => {
  it("parses references, operators, and parentheses", () => {
    expect(parseFormula("([Amount] + 2) * 3")).toMatchObject({ ok: true });
    expect(parseFormula("[Amount] +")).toMatchObject({ ok: false, error: { code: "#SYNTAX!" } });
  });

  it.each([
    ["[Amount] / [Count]", { Amount: 12, Count: 3 }, 4],
    ["ROUND(ABS(-2.345), 2)", {}, 2.35],
    ["MIN(8, 3, 5)", {}, 3],
    ["MAX(8, 3, 5)", {}, 8],
    ["CONCAT(UPPER([First]), \" \", LOWER([LAST]))", { First: "Ada", LAST: "LOVELACE" }, "ADA lovelace"],
    ["LEN([Name])", { Name: "Ada" }, 3],
  ])("evaluates %s", (expression, row, expected) => {
    expect(evaluateFormula(expression, row)).toEqual({ ok: true, value: expected });
  });

  it("supports logical functions and numeric-string coercion", () => {
    expect(evaluateFormula("IF(AND([Ready], [Count] > 2), \"yes\", \"no\")", { Ready: true, Count: "3" })).toEqual({ ok: true, value: "yes" });
    expect(evaluateFormula("NOT([Ready])", { Ready: false })).toEqual({ ok: true, value: true });
    expect(evaluateFormula("IFERROR(1 / 0, \"safe\")", {})).toEqual({ ok: true, value: "safe" });
    expect(evaluateFormula("IF(FALSE, [Missing], \"safe\")", {})).toEqual({ ok: true, value: "safe" });
  });

  it.each([
    ["[Missing] + 1", "#REF!"],
    ["1 / 0", "#DIV/0!"],
    ["UNKNOWN(1)", "#NAME?"],
  ])("returns a tagged %s error", (expression, code) => {
    expect(evaluateFormula(expression, {})).toMatchObject({ ok: false, error: { code } });
  });

  it("returns tagged errors for malformed function calls", () => {
    expect(evaluateFormula("ABS()", {})).toMatchObject({ ok: false, error: { code: "#VALUE!" } });
    expect(evaluateFormula("MIN()", {})).toMatchObject({ ok: false, error: { code: "#VALUE!" } });
  });

  it("evaluates formula dependencies in topological order", () => {
    const result = evaluateRow({ Amount: 12, Count: 3 }, {
      Ratio: { expression: "[Amount] / [Count]" },
      Rounded: { expression: "ROUND([Ratio], 1)" },
    });
    expect(result.Rounded).toEqual({ ok: true, value: 4 });
  });

  it("reports formula cycles as typed errors", () => {
    const result = evaluateRow({}, {
      First: { expression: "[Second] + 1" },
      Second: { expression: "[First] + 1" },
    });
    expect(result.First).toMatchObject({ ok: false, error: { code: "#CYCLE!" } });
    expect(result.Second).toMatchObject({ ok: false, error: { code: "#CYCLE!" } });
  });
});
