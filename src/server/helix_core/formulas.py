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
        name = token.value.upper()
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
        match = re.match(r"[A-Za-z_][A-Za-z0-9_]*", source[i:])
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
                equal = left["value"] == right["value"]
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
    values = [arg["value"] for arg in args]
    if ast[1] == "AND": return _ok(all(values))
    if ast[1] == "OR": return _ok(any(values))
    if ast[1] == "NOT": return _ok(not bool(values[0])) if len(values) == 1 else _error("#VALUE!", "NOT expects one argument")
    if ast[1] in {"MIN", "MAX"}:
        if not args: return _error("#VALUE!", f"{ast[1]} expects at least one argument")
        numbers = [_number(arg) for arg in args]
        if any(isinstance(item, dict) for item in numbers): return next(item for item in numbers if isinstance(item, dict))
        return _ok(min(numbers) if ast[1] == "MIN" else max(numbers))
    if ast[1] == "ABS" and len(args) == 1:
        value = _number(args[0]); return _ok(abs(value)) if isinstance(value, (int, float)) and not isinstance(value, bool) else value
    if ast[1] == "ROUND" and 1 <= len(args) <= 2:
        value, digits = _number(args[0]), _number(args[1] if len(args) == 2 else _ok(0))
        if isinstance(value, dict): return value
        if isinstance(digits, dict): return digits
        factor = 10 ** int(digits)
        return _ok(math.floor(value * factor + 0.5) / factor)
    if ast[1] == "CONCAT": return _ok("".join("" if value is None else str(value) for value in values))
    if ast[1] in {"UPPER", "LOWER"} and len(values) == 1: return _ok(str(values[0] or "").upper() if ast[1] == "UPPER" else str(values[0] or "").lower())
    if ast[1] == "LEN" and len(values) == 1: return _ok(len(str(values[0] or "")))
    return _error("#NAME?", f"Unknown function '{ast[1]}'")


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
