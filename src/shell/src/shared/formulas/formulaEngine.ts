export type FormulaValue = string | number | boolean | null;
export type FormulaErrorCode =
  "#VALUE!" | "#REF!" | "#DIV/0!" | "#NAME?" | "#SYNTAX!" | "#CYCLE!";
export interface FormulaError {
  code: FormulaErrorCode;
  message: string;
}
export type FormulaResult =
  { ok: true; value: FormulaValue } | { ok: false; error: FormulaError };
export type FormulaRow = Record<string, FormulaValue>;
export interface FormulaTableContext {
  rows: FormulaRow[];
  rowIndex: number;
  formulas?: Record<string, Record<string, string>>;
  forbiddenColumns?: ReadonlySet<string>;
}
export interface FormulaColumn {
  expression: string;
  resultType?: string;
}
export type EvaluatedRow = Record<string, FormulaResult>;
export type FormulaFunctionImplementation = (
  args: FormulaResult[],
) => FormulaResult;

const clientImplementations = new Map<string, FormulaFunctionImplementation>();
const defaultClientFunctionIds = new Set([
  "IF",
  "IFERROR",
  "AND",
  "OR",
  "NOT",
  "ROUND",
  "ABS",
  "MIN",
  "MAX",
  "SUM",
  "AVERAGE",
  "COUNT",
  "CONCAT",
  "UPPER",
  "LOWER",
  "LEN",
]);
let hydratedFunctionIds: Set<string> | null = null;
let unavailableDeclaredFunctionIds = new Set<string>();

/** Register a client implementation, optionally validated against the catalog. */
export function registerFormulaFunction(
  id: string,
  implementation: FormulaFunctionImplementation,
): void {
  if (hydratedFunctionIds && !hydratedFunctionIds.has(id)) {
    console.warn(`Unknown formula function '${id}' was not registered.`);
    return;
  }
  clientImplementations.set(id, implementation);
}

/** Set the backend catalog and verify its client implementation declarations. */
export function hydrateFormulaCatalog(
  entries: Iterable<string | { id: string; clientImplemented?: boolean }>,
): void {
  const catalog = [...entries].map((entry) =>
    typeof entry === "string"
      ? { id: entry, clientImplemented: true }
      : entry,
  );
  hydratedFunctionIds = new Set(catalog.map((entry) => entry.id));
  const actualClientFunctionIds = new Set([
    ...defaultClientFunctionIds,
    ...clientImplementations.keys(),
  ]);
  unavailableDeclaredFunctionIds = new Set(
    catalog
      .filter(
        (entry) =>
          entry.clientImplemented === true &&
          !actualClientFunctionIds.has(entry.id),
      )
      .map((entry) => entry.id),
  );
  for (const entry of catalog) {
    if (entry.clientImplemented === true && !actualClientFunctionIds.has(entry.id)) {
      console.warn(
        `Formula function '${entry.id}' declares a client implementation but none is registered; treating it as backend-only.`,
      );
    } else if (entry.clientImplemented === false && actualClientFunctionIds.has(entry.id)) {
      console.warn(
        `Formula function '${entry.id}' is registered on the client but declared backend-only.`,
      );
    }
  }
  for (const id of clientImplementations.keys()) {
    if (!hydratedFunctionIds.has(id)) {
      clientImplementations.delete(id);
      console.warn(`Unknown formula function '${id}' was not registered.`);
    }
  }
}

export function getClientFormulaFunctionIds(): ReadonlySet<string> {
  const ids = new Set([...defaultClientFunctionIds, ...clientImplementations.keys()]);
  return hydratedFunctionIds
    ? new Set(
        [...ids].filter(
          (id) =>
            hydratedFunctionIds!.has(id) &&
            !unavailableDeclaredFunctionIds.has(id),
        ),
      )
    : ids;
}

export type FormulaAst =
  | { kind: "literal"; value: FormulaValue }
  | { kind: "reference"; name: string }
  | { kind: "unary"; operator: string; operand: FormulaAst }
  | { kind: "binary"; operator: string; left: FormulaAst; right: FormulaAst }
  | { kind: "call"; name: string; args: FormulaAst[] };
type Token = {
  kind: "value" | "reference" | "operator" | "left" | "right" | "comma";
  value: string;
};

const fail = (code: FormulaErrorCode, message: string): FormulaResult => ({
  ok: false,
  error: { code, message },
});
const pass = (value: FormulaValue): FormulaResult => ({ ok: true, value });

function tokenize(source: string): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < source.length;) {
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }
    const c = source[i];
    if (c === "[") {
      const end = source.indexOf("]", i + 1);
      if (end < 0 || end === i + 1) throw Error("Invalid column reference");
      result.push({
        kind: "reference",
        value: source.slice(i + 1, end),
      });
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let text = "";
      let end = i + 1;
      while (end < source.length && source[end] !== quote) {
        if (source[end] === "\\") end++;
        if (end < source.length) text += source[end++];
      }
      if (source[end] !== quote) throw Error("Unclosed string literal");
      result.push({ kind: "value", value: JSON.stringify(text) });
      i = end + 1;
      continue;
    }
    const number = source.slice(i).match(/^\d+(?:\.\d+)?/);
    if (number) {
      result.push({ kind: "value", value: number[0] });
      i += number[0].length;
      continue;
    }
    const name = source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (name) {
      result.push({ kind: "value", value: name[0] });
      i += name[0].length;
      continue;
    }
    const operator = source.slice(i).match(/^(<=|>=|<>|!=|==|[+\-*\/%^<>=])/);
    if (operator) {
      result.push({ kind: "operator", value: operator[0] });
      i += operator[0].length;
      continue;
    }
    if (c === "(") result.push({ kind: "left", value: c });
    else if (c === ")") result.push({ kind: "right", value: c });
    else if (c === ",") result.push({ kind: "comma", value: c });
    else throw Error(`Unexpected character '${c}'`);
    i++;
  }
  return result;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}
  private current() {
    return this.tokens[this.index];
  }
  private take() {
    const token = this.current();
    if (!token) throw Error("Unexpected end of formula");
    this.index++;
    return token;
  }
  private has(kind: Token["kind"], value?: string) {
    const t = this.current();
    return !!t && t.kind === kind && (value === undefined || t.value === value);
  }
  parse(): FormulaAst {
    if (!this.tokens.length) throw Error("Formula cannot be empty");
    const ast = this.comparison();
    if (this.current()) throw Error("Unexpected token");
    return ast;
  }
  private comparison() {
    let left = this.term();
    while (
      this.has("operator") &&
      ["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(
        this.current().value,
      )
    )
      left = {
        kind: "binary",
        operator: this.take().value,
        left,
        right: this.term(),
      } as FormulaAst;
    return left;
  }
  private term() {
    let left = this.factor();
    while (this.has("operator") && ["+", "-"].includes(this.current().value))
      left = {
        kind: "binary",
        operator: this.take().value,
        left,
        right: this.factor(),
      } as FormulaAst;
    return left;
  }
  private factor() {
    let left = this.unary();
    while (
      this.has("operator") &&
      ["*", "/", "%", "^"].includes(this.current().value)
    )
      left = {
        kind: "binary",
        operator: this.take().value,
        left,
        right: this.unary(),
      } as FormulaAst;
    return left;
  }
  private unary(): FormulaAst {
    if (this.has("operator", "-") || this.has("operator", "+"))
      return {
        kind: "unary",
        operator: this.take().value,
        operand: this.unary(),
      };
    return this.primary();
  }
  private primary(): FormulaAst {
    const token = this.take();
    if (token.kind === "reference")
      return { kind: "reference", name: token.value };
    if (token.kind === "left") {
      const ast = this.comparison();
      if (!this.has("right")) throw Error("Expected ')' ");
      this.take();
      return ast;
    }
    if (token.kind !== "value") throw Error("Expected a value");
    if (/^\d/.test(token.value))
      return { kind: "literal", value: Number(token.value) };
    if (token.value.startsWith('"'))
      return { kind: "literal", value: JSON.parse(token.value) };
    const name = token.value.includes(".")
      ? token.value
      : token.value.toUpperCase();
    if (this.has("left")) {
      this.take();
      const args: FormulaAst[] = [];
      if (!this.has("right")) {
        do {
          args.push(this.comparison());
          if (!this.has("comma")) break;
          this.take();
        } while (!this.has("right"));
      }
      if (!this.has("right"))
        throw Error("Expected ')' after function arguments");
      this.take();
      return { kind: "call", name, args };
    }
    if (name === "TRUE") return { kind: "literal", value: true };
    if (name === "FALSE") return { kind: "literal", value: false };
    if (name === "NULL") return { kind: "literal", value: null };
    throw Error(`Unknown name '${token.value}'`);
  }
}

export function parseFormula(
  expression: string,
): FormulaResult & { ast?: FormulaAst } {
  try {
    return {
      ok: true,
      value: null,
      ast: new Parser(tokenize(expression)).parse(),
    };
  } catch (e) {
    return fail("#SYNTAX!", e instanceof Error ? e.message : "Invalid formula");
  }
}

/** Visit every node in a parsed formula, including nested function arguments. */
export function walkFormulaAst(
  ast: FormulaAst,
  visit: (node: FormulaAst) => void,
): void {
  visit(ast);
  if (ast.kind === "unary") walkFormulaAst(ast.operand, visit);
  else if (ast.kind === "binary") {
    walkFormulaAst(ast.left, visit);
    walkFormulaAst(ast.right, visit);
  } else if (ast.kind === "call") {
    ast.args.forEach((argument) => walkFormulaAst(argument, visit));
  }
}

/** Return function IDs called by an expression, or an empty list if invalid. */
export function functionCallsIn(expression: string): string[] {
  const parsed = parseFormula(expression);
  if (!parsed.ok || !parsed.ast) return [];

  const calls: string[] = [];
  walkFormulaAst(parsed.ast, (node) => {
    if (node.kind === "call") calls.push(node.name);
  });
  return calls;
}

/** Return whether an expression calls a function without a client implementation. */
export function usesBackendOnlyFunction(
  expression: string,
  clientFunctionIds: ReadonlySet<string> = getClientFormulaFunctionIds(),
): boolean {
  return functionCallsIn(expression).some((id) => !clientFunctionIds.has(id));
}

function number(result: FormulaResult): number | FormulaResult {
  if (!result.ok) return result;
  if (typeof result.value === "number") return result.value;
  if (
    typeof result.value === "string" &&
    result.value.trim() !== "" &&
    !Number.isNaN(Number(result.value))
  )
    return Number(result.value);
  return fail("#VALUE!", "Expected a number");
}
function truth(result: FormulaResult): boolean | FormulaResult {
  if (!result.ok) return result;
  return (
    result.value !== null &&
    result.value !== false &&
    result.value !== "" &&
    result.value !== 0
  );
}
function evalAst(
  ast: FormulaAst,
  row: FormulaRow,
  context?: FormulaTableContext,
): FormulaResult {
  if (ast.kind === "literal") return pass(ast.value);
  if (ast.kind === "reference") {
    const match = ast.name.match(/^(.*):(\d+)$/);
    const name = match ? match[1] : ast.name;
    if (context?.forbiddenColumns?.has(name)) {
      return fail("#REF!", `Column '${name}' cannot be referenced`);
    }
    const referencedRow = match
      ? context?.rows[Number(match[2]) - 1]
      : context?.rows[context.rowIndex];
    const source = referencedRow ?? row;
    return Object.prototype.hasOwnProperty.call(source, name)
      ? pass(source[name])
      : fail("#REF!", `Unknown column '${name}'`);
  }
  if (ast.kind === "unary") {
    const n = number(evalAst(ast.operand, row, context));
    return typeof n === "number" ? pass(ast.operator === "-" ? -n : n) : n;
  }
  if (ast.kind === "binary") {
    const left = evalAst(ast.left, row, context);
    const right = evalAst(ast.right, row, context);
    if (!left.ok) return left;
    if (!right.ok) return right;
    if (["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(ast.operator)) {
      const equal = left.value === right.value;
      if (["=", "=="].includes(ast.operator)) return pass(equal);
      if (["!=", "<>"].includes(ast.operator)) return pass(!equal);
      const a =
        typeof left.value === "number" ? left.value : String(left.value);
      const b =
        typeof right.value === "number" ? right.value : String(right.value);
      return pass(
        ast.operator === "<"
          ? a < b
          : ast.operator === "<="
            ? a <= b
            : ast.operator === ">"
              ? a > b
              : a >= b,
      );
    }
    const a = number(left);
    const b = number(right);
    if (typeof a !== "number") return a;
    if (typeof b !== "number") return b;
    if ((ast.operator === "/" || ast.operator === "%") && b === 0)
      return fail("#DIV/0!", "Division by zero");
    return pass(
      ast.operator === "+"
        ? a + b
        : ast.operator === "-"
          ? a - b
          : ast.operator === "*"
            ? a * b
            : ast.operator === "/"
              ? a / b
              : ast.operator === "%"
                ? a % b
      : Math.pow(a, b),
    );
  }
  const registeredImplementation = clientImplementations.get(ast.name);
  if (registeredImplementation) {
    const args = ast.args.map((arg) => evalAst(arg, row, context));
    const bad = args.find((arg) => !arg.ok);
    return bad && !bad.ok ? bad : registeredImplementation(args);
  }
  if (ast.name === "IF") {
    if (ast.args.length !== 3)
      return fail("#VALUE!", "IF expects three arguments");
    const condition = truth(evalAst(ast.args[0], row, context));
    return typeof condition === "boolean"
      ? evalAst(condition ? ast.args[1] : ast.args[2], row, context)
      : condition;
  }
  if (ast.name === "IFERROR") {
    if (ast.args.length !== 2)
      return fail("#VALUE!", "IFERROR expects two arguments");
    const first = evalAst(ast.args[0], row, context);
    return first.ok ? first : evalAst(ast.args[1], row, context);
  }
  const args = ast.args.map((arg) => evalAst(arg, row, context));
  const bad = args.find((arg) => !arg.ok);
  if (bad && !bad.ok) return bad;
  const values = args.map(
    (arg) => (arg as { ok: true; value: FormulaValue }).value,
  );
  switch (ast.name) {
    case "AND":
      return pass(values.every(Boolean));
    case "OR":
      return pass(values.some(Boolean));
    case "NOT":
      return args.length === 1
        ? pass(!Boolean(values[0]))
        : fail("#VALUE!", "NOT expects one argument");
    case "ROUND": {
      if (args.length < 1 || args.length > 2)
        return fail("#VALUE!", "ROUND expects one or two arguments");
      const a = number(args[0]);
      const b = number(args[1] ?? pass(0));
      if (typeof a !== "number") return a;
      if (typeof b !== "number") return b;
      const factor = Math.pow(10, b);
      return pass(Math.round(a * factor) / factor);
    }
    case "ABS": {
      if (args.length !== 1) return fail("#VALUE!", "ABS expects one argument");
      const a = number(args[0]);
      return typeof a === "number" ? pass(Math.abs(a)) : a;
    }
    case "MIN":
    case "MAX": {
      if (!args.length)
        return fail("#VALUE!", `${ast.name} expects at least one argument`);
      const ns = args.map(number);
      const invalid = ns.find((n) => typeof n !== "number");
      return (
        invalid ??
        pass(
          ast.name === "MIN"
            ? Math.min(...(ns as number[]))
            : Math.max(...(ns as number[])),
        )
      );
    }
    case "SUM":
    case "AVERAGE": {
      if (!args.length)
        return fail("#VALUE!", `${ast.name} expects at least one argument`);
      const ns = args.map(number);
      const invalid = ns.find((n) => typeof n !== "number");
      if (invalid) return invalid;
      const total = (ns as number[]).reduce((sum, value) => sum + value, 0);
      return pass(ast.name === "SUM" ? total : total / ns.length);
    }
    case "COUNT":
      if (!args.length)
        return fail("#VALUE!", "COUNT expects at least one argument");
      return pass(args.filter((arg) => typeof number(arg) === "number").length);
    case "CONCAT":
      return pass(values.map((v) => v ?? "").join(""));
    case "UPPER":
      return args.length === 1
        ? pass(String(values[0] ?? "").toUpperCase())
        : fail("#VALUE!", "UPPER expects one argument");
    case "LOWER":
      return args.length === 1
        ? pass(String(values[0] ?? "").toLowerCase())
        : fail("#VALUE!", "LOWER expects one argument");
    case "LEN":
      return args.length === 1
        ? pass(String(values[0] ?? "").length)
        : fail("#VALUE!", "LEN expects one argument");
    default:
      return fail("#NAME?", `Unknown function '${ast.name}'`);
  }
}
export function evaluateFormula(
  expression: string,
  row: FormulaRow,
): FormulaResult {
  const parsed = parseFormula(expression);
  return parsed.ok && parsed.ast ? evalAst(parsed.ast, row) : parsed;
}

/** Evaluate a document-local formula against a complete table of data rows. */
export function evaluateCellFormula(
  expression: string,
  row: FormulaRow,
  context: FormulaTableContext,
): FormulaResult {
  const parsed = parseFormula(expression.replace(/^=/, ""));
  return parsed.ok && parsed.ast
    ? evalAst(parsed.ast, row, context)
    : parsed;
}
function refs(ast: FormulaAst, result: Set<string>) {
  walkFormulaAst(ast, (node) => {
    if (node.kind === "reference") result.add(node.name);
  });
}
export function evaluateRow(
  row: FormulaRow,
  formulas: Record<string, FormulaColumn>,
): EvaluatedRow {
  const output: EvaluatedRow = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, pass(v)]),
  );
  const states = new Map<string, "visiting" | "done">();
  const visit = (name: string): FormulaResult => {
    if (output[name] && !formulas[name]) return output[name];
    if (states.get(name) === "visiting")
      return fail("#CYCLE!", `Circular dependency involving '${name}'`);
    if (states.get(name) === "done") return output[name];
    const formula = formulas[name];
    if (!formula) return fail("#REF!", `Unknown column '${name}'`);
    states.set(name, "visiting");
    const parsed = parseFormula(formula.expression);
    if (!parsed.ok || !parsed.ast) {
      output[name] = parsed;
      states.set(name, "done");
      return parsed;
    }
    const dependencies = new Set<string>();
    refs(parsed.ast, dependencies);
    for (const dependency of dependencies)
      if (formulas[dependency]) {
        const dependencyResult = visit(dependency);
        if (!dependencyResult.ok) {
          output[name] = dependencyResult;
          states.set(name, "done");
          return dependencyResult;
        }
      }
    const values = Object.fromEntries(
      Object.entries(output).map(([k, v]) => [k, v.ok ? v.value : null]),
    );
    const result = evalAst(parsed.ast, values);
    output[name] = result;
    states.set(name, "done");
    return result;
  };
  Object.keys(formulas).forEach(visit);
  return output;
}
