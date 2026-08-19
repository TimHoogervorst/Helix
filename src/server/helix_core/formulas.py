"""Small, deterministic formula grammar shared by computed-field evaluation."""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from typing import Any

FormulaValue = str | int | float | bool | None
ERROR_CODES = {"#VALUE!", "#REF!", "#DIV/0!", "#NAME?", "#SYNTAX!", "#CYCLE!"}


def _ok(value: FormulaValue) -> dict[str, Any]:
    return {"ok": True, "value": value}


def _error(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}}


@dataclass(frozen=True)
class _Token:
    kind: str
    value: str


class _Parser:
    def __init__(self, tokens: list[_Token]):
        self.tokens, self.index = tokens, 0

    def current(self):
        return self.tokens[self.index] if self.index < len(self.tokens) else None

    def take(self):
        token = self.current()
        if token is None:
            raise ValueError("Unexpected end of formula")
        self.index += 1
        return token

    def has(self, kind: str, value: str | None = None):
        token = self.current()
        return token is not None and token.kind == kind and (value is None or token.value == value)

    def parse(self):
        if not self.tokens:
            raise ValueError("Formula cannot be empty")
        result = self.comparison()
        if self.current() is not None:
            raise ValueError("Unexpected token")
        return result

    def comparison(self):
        result = self.term()
        while self.has("operator") and self.current().value in {"=", "==", "!=", "<>", "<", "<=", ">", ">="}:
            result = ("binary", self.take().value, result, self.term())
        return result

    def term(self):
        result = self.factor()
        while self.has("operator") and self.current().value in {"+", "-"}:
            result = ("binary", self.take().value, result, self.factor())
        return result

    def factor(self):
        result = self.unary()
        while self.has("operator") and self.current().value in {"*", "/", "%", "^"}:
            result = ("binary", self.take().value, result, self.unary())
        return result

    def unary(self):
        if self.has("operator", "-") or self.has("operator", "+"):
            return ("unary", self.take().value, self.unary())
        return self.primary()

    def primary(self):
        token = self.take()
        if token.kind == "reference":
            return ("reference", token.value)
        if token.kind == "left":
            result = self.comparison()
            if not self.has("right"):
                raise ValueError("Expected ')' ")
            self.take()
            return result
        if token.kind != "value":
            raise ValueError("Expected a value")
        if token.value[0].isdigit():
            return ("literal", float(token.value) if "." in token.value else int(token.value))
        if token.value.startswith('"'):
            return ("literal", json.loads(token.value))
        name = token.value if "." in token.value else token.value.upper()
        if self.has("left"):
            self.take()
            args = []
            if not self.has("right"):
                while True:
                    args.append(self.comparison())
                    if not self.has("comma"):
                        break
                    self.take()
            if not self.has("right"):
                raise ValueError("Expected ')' after function arguments")
            self.take()
            return ("call", name, args)
        if name in {"TRUE", "FALSE", "NULL"}:
            return ("literal", {"TRUE": True, "FALSE": False, "NULL": None}[name])
        raise ValueError(f"Unknown name '{token.value}'")


def _tokenize(source: str) -> list[_Token]:
    tokens: list[_Token] = []
    i = 0
    while i < len(source):
        if source[i].isspace():
            i += 1
            continue
        if source[i] == "[":
            end = source.find("]", i + 1)
            if end < 0 or end == i + 1:
                raise ValueError("Invalid column reference")
            tokens.append(_Token("reference", source[i + 1 : end]))
            i = end + 1
            continue
        if source[i] in "\"'":
            quote, end = source[i], i + 1
            text = ""
            while end < len(source) and source[end] != quote:
                if source[end] == "\\":
                    end += 1
                if end < len(source):
                    text += source[end]
                end += 1
            if end >= len(source):
                raise ValueError("Unclosed string literal")
            tokens.append(_Token("value", json.dumps(text)))
            i = end + 1
            continue
        match = re.match(r"\d+(?:\.\d+)?", source[i:])
        if match:
            tokens.append(_Token("value", match.group()))
            i += len(match.group())
            continue
        match = re.match(r"[A-Za-z_][A-Za-z0-9_.]*", source[i:])
        if match:
            tokens.append(_Token("value", match.group()))
            i += len(match.group())
            continue
        match = re.match(r"<=|>=|<>|!=|==|[+\-*/%^<>=]", source[i:])
        if match:
            tokens.append(_Token("operator", match.group()))
            i += len(match.group())
            continue
        if source[i] in "(),":
            tokens.append(_Token({"(": "left", ")": "right", ",": "comma"}[source[i]], source[i]))
            i += 1
            continue
        raise ValueError(f"Unexpected character '{source[i]}'")
    return tokens


def parse_formula(expression: str):
    try:
        return {"ok": True, "value": None, "ast": _Parser(_tokenize(expression)).parse()}
    except (ValueError, json.JSONDecodeError) as exc:
        return _error("#SYNTAX!", str(exc))


def _formula_nodes(ast):
    """Yield references and function calls from a parsed formula AST."""
    if ast[0] == "reference":
        yield "reference", ast[1]
    elif ast[0] == "call":
        yield "call", ast[1]
        for argument in ast[2]:
            yield from _formula_nodes(argument)
    elif ast[0] == "unary":
        yield from _formula_nodes(ast[2])
    elif ast[0] == "binary":
        yield from _formula_nodes(ast[2])
        yield from _formula_nodes(ast[3])


def validate_formula_columns(columns):
    """Validate all computed-field expressions against sibling columns."""
    from helix_core.column_types import registry as column_type_registry
    from helix_core.mod_system.registry import registry

    names = {column.get("name") for column in columns if column.get("name")}
    formulas = {
        column["name"]: column
        for column in columns
        if column.get("type") == "formula"
    }
    dependencies = {}

    for name, column in formulas.items():
        expression = column.get("expression")
        if not isinstance(expression, str) or not expression.strip():
            return f"Computed field '{name}' must have a non-empty expression."
        result_type = column.get("resultType")
        result_column_type = column_type_registry.get_column_type(result_type)
        if not result_type or not result_column_type or result_type == "formula":
            return f"Computed field '{name}' must have a valid resultType."
        parsed = parse_formula(expression)
        if not parsed["ok"]:
            return f"Computed field '{name}': {parsed['error']['message']}"
        dependencies[name] = set()
        for node_type, node_value in _formula_nodes(parsed["ast"]):
            if node_type == "reference":
                if node_value not in names:
                    return f"Computed field '{name}' references unknown column '{node_value}'."
                if node_value == name:
                    return f"Computed field '{name}' cannot reference itself."
                if node_value in formulas:
                    dependencies[name].add(node_value)
            elif registry.get_formula_function(node_value) is None:
                return f"Computed field '{name}' uses unknown function '{node_value}'."

    states = {}

    def visit(name):
        if states.get(name) == "visiting":
            return False
        if states.get(name) == "done":
            return True
        states[name] = "visiting"
        for dependency in dependencies.get(name, ()):
            if not visit(dependency):
                return False
        states[name] = "done"
        return True

    for name in formulas:
        if not visit(name):
            return f"Computed field dependency cycle includes '{name}'."
    return None


def _number(result):
    if not result["ok"]:
        return result
    value = result["value"]
    if isinstance(value, bool):
        return _error("#VALUE!", "Expected a number")
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return float(value) if "." in value else int(value)
        except ValueError:
            pass
    return _error("#VALUE!", "Expected a number")


def _truth(result):
    if not result["ok"]:
        return result
    return result["value"] is not None and result["value"] is not False and result["value"] != "" and result["value"] != 0


def _equal(left, right):
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    return type(left) is type(right) and left == right


def _numeric_arguments(args, name: str):
    if not args:
        return _error("#VALUE!", f"{name} expects at least one argument")
    values = [_number(arg) for arg in args]
    for value in values:
        if isinstance(value, dict):
            return value
    return values


def _formula_implementation(name: str, args):
    if name in {"AND", "OR"}:
        if not args:
            return _error("#VALUE!", f"{name} expects at least one argument")
        values = [arg["value"] for arg in args]
        return _ok(all(values) if name == "AND" else any(values))
    if name == "NOT":
        return _ok(not bool(args[0]["value"])) if len(args) == 1 else _error("#VALUE!", "NOT expects one argument")
    if name in {"MIN", "MAX"}:
        values = _numeric_arguments(args, name)
        if isinstance(values, dict):
            return values
        return _ok(min(values) if name == "MIN" else max(values))
    if name == "ABS":
        if len(args) != 1:
            return _error("#VALUE!", "ABS expects one argument")
        value = _number(args[0])
        return _ok(abs(value)) if not isinstance(value, dict) else value
    if name == "ROUND":
        if not 1 <= len(args) <= 2:
            return _error("#VALUE!", "ROUND expects one or two arguments")
        value = _number(args[0])
        digits = _number(args[1] if len(args) == 2 else _ok(0))
        if isinstance(value, dict):
            return value
        if isinstance(digits, dict):
            return digits
        factor = 10 ** int(digits)
        return _ok(math.floor(value * factor + 0.5) / factor)
    if name in {"SUM", "AVERAGE"}:
        values = _numeric_arguments(args, name)
        if isinstance(values, dict):
            return values
        total = sum(values)
        return _ok(total if name == "SUM" else total / len(values))
    if name == "COUNT":
        if not args:
            return _error("#VALUE!", "COUNT expects at least one argument")
        return _ok(sum(1 for arg in args if isinstance(_number(arg), (int, float))))
    if name == "CONCAT":
        def text(value):
            if value is None:
                return ""
            if isinstance(value, bool):
                return "true" if value else "false"
            if isinstance(value, float) and value.is_integer():
                return str(int(value))
            return str(value)

        return _ok("".join(text(arg["value"]) for arg in args))
    if name in {"UPPER", "LOWER"}:
        if len(args) != 1:
            return _error("#VALUE!", f"{name} expects one argument")
        value = str(args[0]["value"] or "")
        return _ok(value.upper() if name == "UPPER" else value.lower())
    if name == "LEN":
        if len(args) != 1:
            return _error("#VALUE!", "LEN expects one argument")
        return _ok(len(str(args[0]["value"] or "")))
    if name in {"CEILING", "FLOOR", "SQRT", "SIGN"}:
        if len(args) != 1:
            return _error("#VALUE!", f"{name} expects one argument")
        value = _number(args[0])
        if isinstance(value, dict):
            return value
        if name == "CEILING":
            return _ok(math.ceil(value))
        if name == "FLOOR":
            return _ok(math.floor(value))
        if name == "SQRT":
            return _ok(math.sqrt(value)) if value >= 0 else _error("#VALUE!", "SQRT expects a non-negative number")
        return _ok(1 if value > 0 else -1 if value < 0 else 0)
    if name == "MOD":
        if len(args) != 2:
            return _error("#VALUE!", "MOD expects two arguments")
        left = _number(args[0])
        right = _number(args[1])
        if isinstance(left, dict):
            return left
        if isinstance(right, dict):
            return right
        if right == 0:
            return _error("#DIV/0!", "MOD divisor cannot be zero")
        return _ok(left % right)
    if name == "POWER":
        if len(args) != 2:
            return _error("#VALUE!", "POWER expects two arguments")
        base = _number(args[0])
        exponent = _number(args[1])
        if isinstance(base, dict):
            return base
        if isinstance(exponent, dict):
            return exponent
        try:
            return _ok(base ** exponent)
        except (OverflowError, ValueError):
            return _error("#VALUE!", "POWER result is not a valid number")
    if name == "LOG":
        if not 1 <= len(args) <= 2:
            return _error("#VALUE!", "LOG expects one or two arguments")
        value = _number(args[0])
        base = _number(args[1]) if len(args) == 2 else 10
        if isinstance(value, dict):
            return value
        if isinstance(base, dict):
            return base
        if value <= 0 or base <= 0 or base == 1:
            return _error("#VALUE!", "LOG expects a positive value and a valid base")
        return _ok(math.log(value, base))
    if name == "TRIM":
        if len(args) != 1:
            return _error("#VALUE!", "TRIM expects one argument")
        return _ok(" ".join(str(args[0]["value"] or "").split()))
    if name in {"LEFT", "RIGHT"}:
        if not 1 <= len(args) <= 2:
            return _error("#VALUE!", f"{name} expects one or two arguments")
        text = str(args[0]["value"] or "")
        count = _number(args[1]) if len(args) == 2 else 1
        if isinstance(count, dict):
            return count
        if count < 0:
            return _error("#VALUE!", f"{name} count cannot be negative")
        count = int(count)
        return _ok(text[:count] if name == "LEFT" else text[-count:] if count else "")
    if name == "MID":
        if len(args) != 3:
            return _error("#VALUE!", "MID expects three arguments")
        text = str(args[0]["value"] or "")
        start = _number(args[1])
        count = _number(args[2])
        if isinstance(start, dict):
            return start
        if isinstance(count, dict):
            return count
        if start < 1 or count < 0:
            return _error("#VALUE!", "MID expects a positive start and non-negative count")
        return _ok(text[int(start) - 1 : int(start) - 1 + int(count)])
    if name == "SUBSTITUTE":
        if not 3 <= len(args) <= 4:
            return _error("#VALUE!", "SUBSTITUTE expects three or four arguments")
        text = str(args[0]["value"] or "")
        old = str(args[1]["value"] or "")
        new = str(args[2]["value"] or "")
        if len(args) == 3:
            return _ok(text.replace(old, new))
        instance = _number(args[3])
        if isinstance(instance, dict):
            return instance
        if instance < 1:
            return _error("#VALUE!", "SUBSTITUTE instance must be positive")
        parts = text.split(old)
        index = int(instance)
        if index >= len(parts):
            return _ok(text)
        return _ok(old.join(parts[:index]) + new + old.join(parts[index:]))
    return _error("#NAME?", f"Unknown function '{name}'")


def get_builtin_formula_functions() -> list[dict[str, Any]]:
    """Return platform functions for registration during core startup."""
    descriptions = {
        "IF": "Return one of two values based on a condition.",
        "IFERROR": "Return a fallback value when an expression errors.",
        "AND": "Return true when all arguments are truthy.",
        "OR": "Return true when any argument is truthy.",
        "NOT": "Invert a boolean value.",
        "ROUND": "Round a number to a number of decimal places.",
        "ABS": "Return the absolute value of a number.",
        "MIN": "Return the smallest numeric argument.",
        "MAX": "Return the largest numeric argument.",
        "SUM": "Add numeric arguments.",
        "AVERAGE": "Return the average of numeric arguments.",
        "COUNT": "Count numeric arguments.",
        "CONCAT": "Concatenate values as text.",
        "UPPER": "Convert text to uppercase.",
        "LOWER": "Convert text to lowercase.",
        "LEN": "Return the length of text.",
        "CEILING": "Round a number up to the nearest integer.",
        "FLOOR": "Round a number down to the nearest integer.",
        "MOD": "Return the remainder after division.",
        "SQRT": "Return the square root of a number.",
        "POWER": "Raise a number to a power.",
        "LOG": "Return the logarithm of a number.",
        "SIGN": "Return the sign of a number.",
        "TRIM": "Remove leading, trailing, and repeated spaces from text.",
        "LEFT": "Return characters from the left of text.",
        "RIGHT": "Return characters from the right of text.",
        "MID": "Return a section of text.",
        "SUBSTITUTE": "Replace text within text.",
    }
    argument_kinds = {
        "IF": ["boolean", "any", "any"],
        "IFERROR": ["any", "any"],
        "NOT": ["any"],
        "ROUND": ["number", "number?"],
        "ABS": ["number"],
        "UPPER": ["any"],
        "LOWER": ["any"],
        "LEN": ["any"],
        "CEILING": ["number"],
        "FLOOR": ["number"],
        "MOD": ["number", "number"],
        "SQRT": ["number"],
        "POWER": ["number", "number"],
        "LOG": ["number", "number?"],
        "SIGN": ["number"],
        "TRIM": ["any"],
        "LEFT": ["any", "number?"],
        "RIGHT": ["any", "number?"],
        "MID": ["any", "number", "number"],
        "SUBSTITUTE": ["any", "any", "any", "number?"],
    }
    variadic = {"AND", "OR", "MIN", "MAX", "SUM", "AVERAGE", "COUNT", "CONCAT"}
    functions = []
    for name, description in descriptions.items():
        functions.append({
            "function_id": name,
            "argument_kinds": argument_kinds.get(name, ["any..."] if name in variadic else ["any"]),
            "result_kind": "boolean" if name in {"AND", "OR", "NOT"} else "number" if name in {"ROUND", "ABS", "MIN", "MAX", "SUM", "AVERAGE", "COUNT", "LEN", "CEILING", "FLOOR", "MOD", "SQRT", "POWER", "LOG", "SIGN"} else "any",
            "description": description,
            "implementation": (lambda args, function_name=name: _formula_implementation(function_name, args)),
        })
    return functions


def _eval(ast, row):
    kind = ast[0]
    if kind == "literal": return _ok(ast[1])
    if kind == "reference": return _ok(row[ast[1]]) if ast[1] in row else _error("#REF!", f"Unknown column '{ast[1]}'")
    if kind == "unary":
        value = _number(_eval(ast[2], row))
        return _ok(-value if ast[1] == "-" else value) if isinstance(value, (int, float)) and not isinstance(value, bool) else value
    if kind == "binary":
        left, right = _eval(ast[2], row), _eval(ast[3], row)
        if not left["ok"]: return left
        if not right["ok"]: return right
        if ast[1] in {"=", "==", "!=", "<>", "<", "<=", ">", ">="}:
            if ast[1] in {"=", "==", "!=", "<>"}:
                equal = _equal(left["value"], right["value"])
                return _ok(equal if ast[1] in {"=", "=="} else not equal)
            a, b = left["value"], right["value"]
            if not isinstance(a, (int, float)) or isinstance(a, bool): a = str(a)
            if not isinstance(b, (int, float)) or isinstance(b, bool): b = str(b)
            return _ok({"<": a < b, "<=": a <= b, ">": a > b, ">=": a >= b}[ast[1]])
        left, right = _number(left), _number(right)
        if not isinstance(left, (int, float)) or isinstance(left, bool): return left
        if not isinstance(right, (int, float)) or isinstance(right, bool): return right
        if ast[1] in {"/", "%"} and right == 0: return _error("#DIV/0!", "Division by zero")
        if ast[1] == "+": return _ok(left + right)
        if ast[1] == "-": return _ok(left - right)
        if ast[1] == "*": return _ok(left * right)
        if ast[1] == "/": return _ok(left / right)
        if ast[1] == "%": return _ok(left % right)
        return _ok(left ** right)
    if ast[1] == "IF":
        if len(ast[2]) != 3: return _error("#VALUE!", "IF expects three arguments")
        condition = _truth(_eval(ast[2][0], row))
        return condition if isinstance(condition, dict) else _eval(ast[2][1] if condition else ast[2][2], row)
    if ast[1] == "IFERROR":
        if len(ast[2]) != 2: return _error("#VALUE!", "IFERROR expects two arguments")
        result = _eval(ast[2][0], row)
        return result if result["ok"] else _eval(ast[2][1], row)
    args = [_eval(arg, row) for arg in ast[2]]
    if any(not arg["ok"] for arg in args): return next(arg for arg in args if not arg["ok"])
    from helix_core.mod_system.registry import registry

    function = registry.get_formula_function(ast[1])
    if function is None:
        return _error("#NAME?", f"Unknown function '{ast[1]}'")
    return function["implementation"](args)


def evaluate_formula(expression: str, row: dict[str, FormulaValue]):
    parsed = parse_formula(expression)
    return _eval(parsed["ast"], row) if parsed["ok"] else parsed


def evaluate_row(row: dict[str, FormulaValue], formulas: dict[str, dict[str, str]]):
    output = {name: _ok(value) for name, value in row.items()}
    states: dict[str, str] = {}

    def visit(name):
        if name in output and name not in formulas: return output[name]
        if states.get(name) == "visiting": return _error("#CYCLE!", f"Circular dependency involving '{name}'")
        if states.get(name) == "done": return output[name]
        formula = formulas.get(name)
        if formula is None: return _error("#REF!", f"Unknown column '{name}'")
        states[name] = "visiting"
        parsed = parse_formula(formula["expression"])
        if not parsed["ok"]:
            output[name], states[name] = parsed, "done"; return parsed
        dependencies = set()
        def collect(ast):
            if ast[0] == "reference": dependencies.add(ast[1])
            elif ast[0] == "unary": collect(ast[2])
            elif ast[0] == "binary": collect(ast[2]); collect(ast[3])
            elif ast[0] == "call": [collect(arg) for arg in ast[2]]
        collect(parsed["ast"])
        for dependency in dependencies:
            if dependency in formulas:
                result = visit(dependency)
                if not result["ok"]: output[name], states[name] = result, "done"; return result
        values = {key: result["value"] if result["ok"] else None for key, result in output.items()}
        result = _eval(parsed["ast"], values)
        output[name], states[name] = result, "done"
        return result

    for name in formulas: visit(name)
    return output
