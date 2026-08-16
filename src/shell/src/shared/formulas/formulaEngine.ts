export type FormulaValue = string | number | boolean | null;

export type FormulaErrorCode =
  | "#VALUE!"
  | "#REF!"
  | "#DIV/0!"
  | "#NAME?"
  | "#SYNTAX!"
  | "#CYCLE!";

export interface FormulaError {
  code: FormulaErrorCode;
  message: string;
}

export type FormulaResult =
  | { ok: true; value: FormulaValue }
  | { ok: false; error: FormulaError };

export interface FormulaColumn {
  expression: string;
  resultType?: string;
}

export type FormulaRow = Record<string, FormulaValue>;
export type EvaluatedRow = Record<string, FormulaResult>;

export interface FormulaEvaluator {
  parse: typeof parseFormula;
  evaluate: typeof evaluateFormula;
  evaluateRow: typeof evaluateRow;
}

type Token =
  | { kind: "number" | "string" | "identifier" | "reference"; value: string }
  | { kind: "operator" | "leftParen" | "rightParen" | "comma"; value: string };

type Expression =
  | { kind: "literal"; value: FormulaValue }
  | { kind: "reference"; name: string }
  | { kind: "unary"; operator: string; operand: Expression }
  | { kind: "binary"; operator: string; left: Expression; right: Expression }
  | { kind: "call"; name: string; args: Expression[] };

const error = (code: FormulaErrorCode, message: string): FormulaResult => ({
  ok: false,
  error: { code, message },
});

const value = (input: FormulaValue): FormulaResult => ({ ok: true, value: input });

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "[") {
      const end = expression.indexOf("]", index + 1);
      if (end < 0 || end === index + 1) throw new Error("Unclosed column reference");
      tokens.push({ kind: "reference", value: expression.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      let end = index + 1;
      let text = "";
      while (end < expression.length && expression[end] !== quote) {
        text += expression[end] === "\\" ? expression[end + 1] ?? "" : expression[end];
        end += expression[end] === "\\" ? 2 : 1;
      }
      if (expression[end] !== quote) throw new Error("Unclosed string literal");
      tokens.push({ kind: "string", value: text });
      index = end + 1;
      continue;
    }
    const number = expression.slice(index).match(/^\d+(?:\.\d+)?/);
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    const identifier = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    const operator = expression.slice(index).match(/^(<=|>=|<>|!=|==|[+\-*\/%^<>=])/);
    if (operator) {
      tokens.push({ kind: "operator", value: operator[0] });
      index += operator[0].length;
      continue;
    }
    if (char === "(") tokens.push({ kind: "leftParen", value: char });
    else if (char === ")") tokens.push({ kind: "rightParen", value: char });
    else if (char === ",") tokens.push({ kind: "comma", value: char });
    else throw new Error(`Unexpected character '${char}'`);
    index += 1;
  }
  return tokens;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Expression {
    if (this.tokens.length === 0) throw new Error("Formula cannot be empty");
    const result = this.parseComparison();
    if (this.index !== this.tokens.length) throw new Error("Unexpected token");
    return result;
  }

  private current(): Token | undefined { return this.tokens[this.index]; }
  private take(): Token {
    const token = this.current();
    if (!token) throw new Error("Unexpected end of formula");
    this.index += 1;
    return token;
  }
  private match(kind: Token["kind"], tokenValue?: string): boolean {
    const token = this.current();
    return Boolean(token && token.kind === kind && (tokenValue === undefined || token.value === tokenValue));
  }
  private parseComparison(): Expression {
    let left = this.parseTerm();
    while (this.match("operator") && ["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(this.current()!.value)) {
      const operator = this.take().value;
      left = { kind: "binary", operator, left, right: this.parseTerm() };
    }
    return left;
  }
  private parseTerm(): Expression {
    let left = this.parseFactor();
    while (this.match("operator") && ["+", "-"].includes(this.current()!.value)) {
      const operator = this.take().value;
      left = { kind: "binary", operator, left, right: this.parseFactor() };
    }
    return left;
  }
  private parseFactor(): Expression {
    let left = this.parseUnary();
    while (this.match("operator") && ["*", "/", "%", "^"].includes(this.current()!.value)) {
      const operator = this.take().value;
      left = { kind: "binary", operator, left, right: this.parseUnary() };
    }
    return left;
  }
  private parseUnary(): Expression {
    if (this.match("operator", "-") || this.match("operator", "+")) {
      return { kind: "unary", operator: this.take().value, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }
  private parsePrimary(): Expression {
    const token = this.take();
    if (token.kind === "number") return { kind: "literal", value: Number(token.value) };
    if (token.kind === "string") return { kind: "literal", value: token.value };
    if (token.kind === "reference") return { kind: "reference", name: token.value };
    if (token.kind === "leftParen") {
      const result = this.parseComparison();
      if (!this.match("rightParen")) throw new Error("Expected ')' ");
      this.take();
      return result;
    }
    if (token.kind !== "identifier") throw new Error("Expected a value");
    const name = token.value.toUpperCase();
    if (this.match("leftParen")) {
      this.take();
      const args: Expression[] = [];
      if (!this.match("rightParen")) {
        do {
          args.push(this.parseComparison());
          if (!this.match("comma")) break;
          this.take();
        } while (!this.match("rightParen"));
      }
      if (!this.match("rightParen")) throw new Error("Expected ')' after function arguments");
      this.take();
      return { kind: "call", name, args };
    }
    if (name === "TRUE") return { kind: "literal", value: true };
    if (name === "FALSE") return { kind: "literal", value: false };
    throw new Error(`Column references must use brackets: [${token.value}]`);
  }
}

export function parseFormula(expression: string): FormulaResult & { ast?: Expression } {
  try {
    return { ok: true, value: null, ast: new Parser(tokenize(expression)).parse() };
  } catch (cause) {
    return error("#SYNTAX!", cause instanceof Error ? cause.message : "Invalid formula");
  }
}

function numberValue(result: FormulaResult): number | FormulaResult {
  if (!result.ok) return result;
  if (typeof result.value === "number") return result.value;
  if (typeof result.value === "string" && result.value.trim() !== "") {
    const number = Number(result.value);
    if (!Number.isNaN(number)) return number;
  }
  return error("#VALUE!", "Expected a number");
}

function truthy(result: FormulaResult): boolean | FormulaResult {
  if (!result.ok) return result;
  return result.value !== null && result.value !== false && result.value !== "" && result.value !== 0;
}

function evaluateAst(ast: Expression, row: FormulaRow): FormulaResult {
  if (ast.kind === "literal") return value(ast.value);
  if (ast.kind === "reference") {
    return Object.prototype.hasOwnProperty.call(row, ast.name)
      ? value(row[ast.name])
      : error("#REF!", `Unknown column '${ast.name}'`);
  }
  if (ast.kind === "unary") {
    const operand = numberValue(evaluateAst(ast.operand, row));
    return typeof operand === "number" ? value(ast.operator === "-" ? -operand : operand) : operand;
  }
  if (ast.kind === "binary") {
    const left = evaluateAst(ast.left, row);
    const right = evaluateAst(ast.right, row);
    if (!left.ok) return left;
    if (!right.ok) return right;
    if (["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(ast.operator)) {
      const equal = left.value === right.value;
      if (ast.operator === "=" || ast.operator === "==") return value(equal);
      if (ast.operator === "!=" || ast.operator === "<>") return value(!equal);
      const comparable = [left.value, right.value].map((item) => typeof item === "number" ? item : String(item));
      return value(ast.operator === "<" ? comparable[0] < comparable[1] : ast.operator === "<=" ? comparable[0] <= comparable[1] : ast.operator === ">" ? comparable[0] > comparable[1] : comparable[0] >= comparable[1]);
    }
    const leftNumber = numberValue(left);
    const rightNumber = numberValue(right);
    if (typeof leftNumber !== "number") return leftNumber;
    if (typeof rightNumber !== "number") return rightNumber;
    if ((ast.operator === "/" || ast.operator === "%") && rightNumber === 0) return error("#DIV/0!", "Division by zero");
    return value(ast.operator === "+" ? leftNumber + rightNumber : ast.operator === "-" ? leftNumber - rightNumber : ast.operator === "*" ? leftNumber * rightNumber : ast.operator === "/" ? leftNumber / rightNumber : ast.operator === "%" ? leftNumber % rightNumber : Math.pow(leftNumber, rightNumber));
  }
  if (ast.name === "IF") {
    if (ast.args.length !== 3) return error("#VALUE!", "IF expects three arguments");
    const condition = truthy(evaluateAst(ast.args[0], row));
    if (typeof condition !== "boolean") return condition;
    return evaluateAst(condition ? ast.args[1] : ast.args[2], row);
  }
  if (ast.name === "IFERROR") {
    if (ast.args.length !== 2) return error("#VALUE!", "IFERROR expects two arguments");
    const primary = evaluateAst(ast.args[0], row);
    return primary.ok ? primary : evaluateAst(ast.args[1], row);
  }
  const args = ast.args.map((argument) => evaluateAst(argument, row));
  if (args.some((argument) => !argument.ok)) return args.find((argument) => !argument.ok)!;
  const values = args.map((argument) => (argument as { ok: true; value: FormulaValue }).value);
  switch (ast.name) {
    case "IF": return error("#VALUE!", "IF expects three arguments");
    case "AND": return value(values.every(Boolean));
    case "OR": return value(values.some(Boolean));
    case "NOT": return args.length === 1 ? value(!Boolean(values[0])) : error("#VALUE!", "NOT expects one argument");
    case "ROUND": {
      if (args.length < 1 || args.length > 2) return error("#VALUE!", "ROUND expects one or two arguments");
      const number = numberValue(args[0]);
      const digits = numberValue(args[1] ?? value(0));
      if (typeof number !== "number") return number;
      if (typeof digits !== "number") return digits;
      const factor = Math.pow(10, digits);
      return value(Math.round(number * factor) / factor);
    }
    case "ABS": {
      if (args.length !== 1) return error("#VALUE!", "ABS expects one argument");
      const number = numberValue(args[0]);
      return typeof number === "number" ? value(Math.abs(number)) : number;
    }
    case "MIN": case "MAX": {
      if (args.length === 0) return error("#VALUE!", `${ast.name} expects at least one argument`);
      const numbers = args.map((argument) => numberValue(argument));
      const invalid = numbers.find((number) => typeof number !== "number");
      return invalid ?? value(ast.name === "MIN" ? Math.min(...numbers as number[]) : Math.max(...numbers as number[]));
    }
    case "CONCAT": return value(values.map((item) => item ?? "").join(""));
    case "UPPER": return args.length === 1 ? value(String(values[0] ?? "").toUpperCase()) : error("#VALUE!", "UPPER expects one argument");
    case "LOWER": return args.length === 1 ? value(String(values[0] ?? "").toLowerCase()) : error("#VALUE!", "LOWER expects one argument");
    case "LEN": return args.length === 1 ? value(String(values[0] ?? "").length) : error("#VALUE!", "LEN expects one argument");
    default: return error("#NAME?", `Unknown function '${ast.name}'`);
  }
}

export function evaluateFormula(expression: string, row: FormulaRow): FormulaResult {
  const parsed = parseFormula(expression);
  return parsed.ok && parsed.ast ? evaluateAst(parsed.ast, row) : parsed;
}

function references(ast: Expression, result: Set<string>): void {
  if (ast.kind === "reference") result.add(ast.name);
  if (ast.kind === "unary") references(ast.operand, result);
  if (ast.kind === "binary") { references(ast.left, result); references(ast.right, result); }
  if (ast.kind === "call") ast.args.forEach((argument) => references(argument, result));
}

export function evaluateRow(row: FormulaRow, formulas: Record<string, FormulaColumn>): EvaluatedRow {
  const output: EvaluatedRow = Object.fromEntries(Object.entries(row).map(([name, item]) => [name, value(item)]));
  const states = new Map<string, "visiting" | "done">();
  const evaluateColumn = (name: string): FormulaResult => {
    if (output[name] && !formulas[name]) return output[name];
    if (states.get(name) === "visiting") return error("#CYCLE!", `Circular dependency involving '${name}'`);
    if (states.get(name) === "done") return output[name];
    const formula = formulas[name];
    if (!formula) return error("#REF!", `Unknown column '${name}'`);
    states.set(name, "visiting");
    const parsed = parseFormula(formula.expression);
    if (!parsed.ok || !parsed.ast) { output[name] = parsed; states.set(name, "done"); return parsed; }
    const deps = new Set<string>();
    references(parsed.ast, deps);
    for (const dependency of deps) {
      if (formulas[dependency]) {
        const dependencyResult = evaluateColumn(dependency);
        if (!dependencyResult.ok) { output[name] = dependencyResult; states.set(name, "done"); return dependencyResult; }
      }
    }
    const values: FormulaRow = Object.fromEntries(Object.entries(output).map(([key, result]) => [key, result.ok ? result.value : null]));
    const result = evaluateAst(parsed.ast, values);
    output[name] = result;
    states.set(name, "done");
    return result;
  };
  Object.keys(formulas).forEach(evaluateColumn);
  return output;
}

export const formulaEvaluator: FormulaEvaluator = {
  parse: parseFormula,
  evaluate: evaluateFormula,
  evaluateRow,
};
