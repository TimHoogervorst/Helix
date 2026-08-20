import { describe, expect, it, vi } from "vitest";
import {
  evaluateFormula,
  evaluateRow,
  functionCallsIn,
  getClientFormulaFunctionIds,
  hydrateFormulaCatalog,
  registerFormulaFunction,
  parseFormula,
  unimplementedFormulaFunctionsIn,
  usesBackendOnlyFunction,
  walkFormulaAst,
} from "../formulaEngine";
import fixtures from "../parity.json";

type Fixture = {
  name: string;
  expression?: string;
  row: Record<string, string | number | boolean | null>;
  backendOnly?: boolean;
  formulas?: Record<string, { expression: string }>;
  expected?: object;
  expectedRow?: object;
};
const parityFixtures = fixtures as Fixture[];

describe("formula parity fixtures", () => {
  it.each(parityFixtures.filter((fixture) => fixture.expression))(
    "evaluates $name",
    (fixture) => {
      const expected = fixture.backendOnly
        ? { ok: false, error: { code: "#NAME?" } }
        : fixture.expected;
      expect(
        evaluateFormula(
          fixture.expression!,
          fixture.row as Record<string, string | number | boolean | null>,
        ),
      ).toMatchObject(expected as object);
    },
  );

  it("queries the backend-only function for every backend-only fixture", () => {
    for (const fixture of parityFixtures.filter(
      (item) => item.backendOnly && item.expression,
    )) {
      const calls = functionCallsIn(fixture.expression!);
      expect(unimplementedFormulaFunctionsIn(fixture.expression!)).toEqual(
        calls,
      );
    }
  });

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
    expect(
      functionCallsIn("IF(AND(TRUE, NOT(FALSE)), ROUND([Amount], 1), 0)"),
    ).toEqual(["IF", "AND", "NOT", "ROUND"]);
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

  it("queries catalogued functions without client implementations", () => {
    const originalIds = [...getClientFormulaFunctionIds()];
    try {
      hydrateFormulaCatalog([
        { id: "IF", clientImplemented: true },
        { id: "server.only", clientImplemented: false },
        { id: "molBio.gcContent", clientImplemented: false },
      ]);
      expect(unimplementedFormulaFunctionsIn("IF(TRUE, 1, 0)")).toEqual([]);
      expect(
        unimplementedFormulaFunctionsIn("molBio.gcContent([Sequence])"),
      ).toEqual(["molBio.gcContent"]);
      expect(unimplementedFormulaFunctionsIn("NOPE([Amount])")).toEqual([]);
      expect(
        unimplementedFormulaFunctionsIn(
          "IF(server.only([Amount]), molBio.gcContent([Sequence]), NOPE([Amount]))",
        ),
      ).toEqual(["server.only", "molBio.gcContent"]);
      hydrateFormulaCatalog([]);
      expect(unimplementedFormulaFunctionsIn("NOPE([Amount])")).toEqual([]);
    } finally {
      hydrateFormulaCatalog(originalIds);
    }
  });

  it("does not scan string literals or invalid expressions", () => {
    expect(usesBackendOnlyFunction('"SQRT(1)"')).toBe(false);
    expect(usesBackendOnlyFunction("[Amount] +")).toBe(false);
  });

  it("uses the hydrated client-function catalog by default", () => {
    const originalIds = [...getClientFormulaFunctionIds()];
    try {
      hydrateFormulaCatalog(["IF", "molBio.gcContent"]);
      expect(usesBackendOnlyFunction("molBio.gcContent([Sequence])")).toBe(
        true,
      );
    } finally {
      hydrateFormulaCatalog(originalIds);
    }
  });

  it("degrades a declared client function when no implementation is registered", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const originalIds = [...getClientFormulaFunctionIds()];
    try {
      hydrateFormulaCatalog([
        { id: "missing.client", clientImplemented: true },
      ]);
      expect(getClientFormulaFunctionIds()).not.toContain("missing.client");
      expect(warning).toHaveBeenCalledWith(
        "Formula function 'missing.client' declares a client implementation but none is registered; treating it as backend-only.",
      );
    } finally {
      hydrateFormulaCatalog(originalIds);
      warning.mockRestore();
    }
  });

  it("keeps a registered function when the catalog declaration is stale", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const originalIds = [...getClientFormulaFunctionIds()];
    try {
      hydrateFormulaCatalog([{ id: "stale.client", clientImplemented: false }]);
      registerFormulaFunction("stale.client", () => ({ ok: true, value: 1 }));
      hydrateFormulaCatalog([{ id: "stale.client", clientImplemented: false }]);
      expect(getClientFormulaFunctionIds()).toContain("stale.client");
      expect(warning).toHaveBeenCalledWith(
        "Formula function 'stale.client' is registered on the client but declared backend-only.",
      );
    } finally {
      hydrateFormulaCatalog(originalIds);
      warning.mockRestore();
    }
  });
});
