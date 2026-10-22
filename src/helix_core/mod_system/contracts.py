"""Declarative scientific contracts and exact, versioned fingerprints."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

from helix_core.mod_system.manifest import _SEMVER

_IDENTIFIER = re.compile(r"^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+(?:[.-][a-z0-9]+)*$")
_STABLE_NAME = re.compile(r"^[a-z][a-zA-Z0-9_]*$")
_KINDS = {"data", "action"}
_DOMAIN = b"helix.contract.v1\0"


class ContractError(ValueError):
    """A contract envelope, declaration, dependency, or fingerprint is invalid."""


def _reject_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ContractError(f"Duplicate JSON key {key!r}")
        result[key] = value
    return result


def parse_contract_json(source: str | bytes) -> dict[str, Any]:
    """Parse strict JSON while retaining exact number tokens and rejecting duplicates."""
    try:
        text = source.decode("utf-8", errors="strict") if isinstance(source, bytes) else source
        value = json.loads(
            text,
            object_pairs_hook=_reject_pairs,
            parse_float=Decimal,
            parse_int=Decimal,
            parse_constant=lambda token: (_ for _ in ()).throw(ContractError(f"Invalid number {token}")),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, InvalidOperation) as exc:
        raise ContractError("Invalid contract JSON") from exc
    _validate_unicode(value)
    if not isinstance(value, dict):
        raise ContractError("Contract envelope must be an object")
    validate_contract(value)
    return value


def _validate_unicode(value: Any) -> None:
    if isinstance(value, str):
        if any(0xD800 <= ord(char) <= 0xDFFF for char in value):
            raise ContractError("Unpaired Unicode surrogate")
    elif isinstance(value, dict):
        for key, item in value.items():
            _validate_unicode(key)
            _validate_unicode(item)
    elif isinstance(value, list):
        for item in value:
            _validate_unicode(item)


def validate_contract(envelope: dict[str, Any]) -> None:
    required = {"formatVersion", "kind", "id", "version", "description", "definition"}
    if set(envelope) != required:
        raise ContractError("Contract envelope has missing or unsupported keys")
    if envelope["formatVersion"] != 1 or isinstance(envelope["formatVersion"], bool):
        raise ContractError("Unsupported contract formatVersion")
    kind, identity, version = envelope["kind"], envelope["id"], envelope["version"]
    if not isinstance(kind, str) or kind not in _KINDS:
        raise ContractError("Contract kind must be data or action")
    if not isinstance(identity, str) or not _IDENTIFIER.fullmatch(identity):
        raise ContractError("Contract id must be a publisher-qualified lowercase identifier")
    if not isinstance(version, str) or not _SEMVER.fullmatch(version):
        raise ContractError("Contract version must be an exact SemVer")
    if not isinstance(envelope["description"], str) or not envelope["description"].strip():
        raise ContractError("Contract description is required")
    if not isinstance(envelope["definition"], dict):
        raise ContractError("Contract definition must be an object")
    _validate_definition(envelope["definition"], kind)


def _keys(value: dict[str, Any], required: set[str], allowed: set[str], where: str) -> None:
    if not required <= value.keys() or not value.keys() <= allowed:
        raise ContractError(f"Invalid {where} keys")


def _validate_type(node: Any, where: str, depth: int = 0) -> None:
    if depth > 128:
        raise ContractError(f"{where} exceeds the maximum definition depth")
    if not isinstance(node, dict) or not isinstance(node.get("type"), str):
        raise ContractError(f"{where} must be a discriminated type object")
    kind = node["type"]
    if kind == "number":
        _keys(node, {"type"}, {"type", "minimum", "maximum", "enum", "description"}, where)
        bounds = {}
        for bound in ("minimum", "maximum"):
            if bound in node:
                bounds[bound] = _decimal_constraint(node[bound], where)
        if "minimum" in bounds and "maximum" in bounds and bounds["minimum"] > bounds["maximum"]:
            raise ContractError(f"{where} has inverted numeric bounds")
        if "enum" in node:
            values = _enum(node, where)
            numbers = [_decimal_constraint(value, where) for value in values]
            if any(
                ("minimum" in bounds and value < bounds["minimum"])
                or ("maximum" in bounds and value > bounds["maximum"])
                for value in numbers
            ):
                raise ContractError(f"{where} number enum conflicts with its bounds")
    elif kind == "string":
        _keys(node, {"type"}, {"type", "minLength", "maxLength", "enum", "description"}, where)
        _validate_lengths(node, "minLength", "maxLength", where)
        if "enum" in node:
            values = _enum(node, where)
            if any(not isinstance(value, str) for value in values):
                raise ContractError(f"{where} string enum must contain only strings")
            if any(
                ("minLength" in node and len(value) < node["minLength"])
                or ("maxLength" in node and len(value) > node["maxLength"])
                for value in values
            ):
                raise ContractError(f"{where} string enum conflicts with its length bounds")
    elif kind in {"date", "datetime"}:
        _keys(node, {"type"}, {"type", "minimum", "maximum", "enum", "description"}, where)
        bounds = {}
        for bound in ("minimum", "maximum"):
            if bound in node:
                bounds[bound] = _temporal_constraint(kind, node[bound], where)
        if "minimum" in bounds and "maximum" in bounds and bounds["minimum"] > bounds["maximum"]:
            raise ContractError(f"{where} has inverted temporal bounds")
        if "enum" in node:
            values = [_temporal_constraint(kind, value, where) for value in _enum(node, where)]
            if any(
                ("minimum" in bounds and value < bounds["minimum"])
                or ("maximum" in bounds and value > bounds["maximum"])
                for value in values
            ):
                raise ContractError(f"{where} enum conflicts with its temporal bounds")
    elif kind == "boolean":
        _keys(node, {"type"}, {"type", "enum", "description"}, where)
        if "enum" in node and any(not isinstance(value, bool) for value in _enum(node, where)):
            raise ContractError(f"{where} boolean enum must contain only booleans")
    elif kind == "object":
        _keys(node, {"type", "fields"}, {"type", "fields", "additionalValues", "description"}, where)
        fields = node["fields"]
        if not isinstance(fields, dict) or any(
            not isinstance(name, str) or not _STABLE_NAME.fullmatch(name)
            for name in fields
        ):
            raise ContractError(f"{where} fields must use stable names")
        for name, field_type in fields.items():
            _validate_type(field_type, f"{where}.{name}", depth + 1)
        if "additionalValues" in node:
            _validate_type(node["additionalValues"], f"{where}.additionalValues", depth + 1)
    elif kind == "array":
        _keys(node, {"type", "items"}, {"type", "items", "minItems", "maxItems", "description"}, where)
        _validate_type(node["items"], f"{where}[]", depth + 1)
        for bound in ("minItems", "maxItems"):
            if bound in node:
                _integer_constraint(node[bound], where)
        if "minItems" in node and "maxItems" in node and node["minItems"] > node["maxItems"]:
            raise ContractError(f"{where} has inverted item bounds")
    elif kind == "optional":
        _keys(node, {"type", "valueType"}, {"type", "valueType", "description"}, where)
        _validate_type(node["valueType"], where, depth + 1)
    elif kind == "variant":
        _keys(node, {"type", "tag", "cases"}, {"type", "tag", "cases", "description"}, where)
        cases = node["cases"]
        if (
            not isinstance(node["tag"], str)
            or not _STABLE_NAME.fullmatch(node["tag"])
            or not isinstance(cases, dict)
            or not cases
        ):
            raise ContractError(f"{where} requires a stable tag and named cases")
        for name, case_type in cases.items():
            if not isinstance(name, str) or not _STABLE_NAME.fullmatch(name):
                raise ContractError(f"{where} has an invalid case name")
            _validate_type(case_type, f"{where}.{name}", depth + 1)
    elif kind == "quantity":
        _keys(node, {"type", "valueType", "unit", "description"}, {"type", "valueType", "unit", "description"}, where)
        if node["valueType"] != "number" or not isinstance(node["unit"], str) or not node["unit"]:
            raise ContractError(f"{where} quantity requires a number valueType and unit")
    elif kind == "contract":
        _keys(node, {"type", "kind", "id", "version"}, {"type", "kind", "id", "version"}, where)
        if (
            not isinstance(node["kind"], str)
            or node["kind"] not in _KINDS
            or not isinstance(node["id"], str)
            or not _IDENTIFIER.fullmatch(node["id"])
        ):
            raise ContractError(f"{where} has an invalid contract reference")
        if not isinstance(node["version"], str) or not _SEMVER.fullmatch(node["version"]):
            raise ContractError(f"{where} contract reference requires an exact version")
    elif kind in {"recordReference", "attachmentReference"}:
        _keys(node, {"type"}, {"type", "description"}, where)
    else:
        raise ContractError(f"Unsupported contract type {kind!r}")
    if "description" in node and not isinstance(node["description"], str):
        raise ContractError(f"{where} description must be text")


def _enum(node: dict[str, Any], where: str) -> list[Any]:
    values = node["enum"]
    if not isinstance(values, list) or not values:
        raise ContractError(f"{where} enum must be a non-empty array")
    return values


def _decimal_constraint(value: Any, where: str) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ContractError(f"{where} numeric bounds must be finite numbers")
    try:
        number = value if isinstance(value, Decimal) else Decimal(str(value))
    except InvalidOperation as exc:
        raise ContractError(f"{where} numeric bounds must be finite numbers") from exc
    if not number.is_finite():
        raise ContractError(f"{where} numeric bounds must be finite numbers")
    return number


def _integer_constraint(value: Any, where: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ContractError(f"{where} length bounds must be non-negative integers")
    try:
        number = value if isinstance(value, Decimal) else Decimal(str(value))
    except InvalidOperation as exc:
        raise ContractError(f"{where} length bounds must be non-negative integers") from exc
    if not number.is_finite() or number < 0:
        raise ContractError(f"{where} length bounds must be non-negative integers")
    sign, digits, exponent = number.as_tuple()
    if exponent < 0:
        fractional_digits = min(-exponent, len(digits))
        if any(digit != 0 for digit in digits[-fractional_digits:]):
            raise ContractError(f"{where} length bounds must be non-negative integers")
    return int(number)


def _validate_lengths(node: dict[str, Any], minimum: str, maximum: str, where: str) -> None:
    for key in (minimum, maximum):
        if key in node:
            _integer_constraint(node[key], where)
    if minimum in node and maximum in node and node[minimum] > node[maximum]:
        raise ContractError(f"{where} has inverted length bounds")


def _temporal_constraint(kind: str, value: Any, where: str):
    if not isinstance(value, str):
        raise ContractError(f"{where} {kind} bounds and enum values must be strings")
    try:
        if kind == "date":
            return date.fromisoformat(value)
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.utcoffset() is None:
            raise ContractError(f"{where} datetime values must include a timezone")
        return result
    except ValueError as exc:
        raise ContractError(f"{where} has an invalid {kind} value") from exc


def _validate_definition(definition: dict[str, Any], kind: str) -> None:
    if kind == "data":
        _keys(definition, {"type"}, {"type", "requiredValidators"}, "data definition")
        _validate_type(definition["type"], "data definition")
    else:
        required = {"inputs", "parameters", "outputs", "targets", "effects"}
        _keys(definition, required, required | {"requiredValidators"}, "action definition")
        for map_name in ("inputs", "parameters", "outputs"):
            ports = definition[map_name]
            if not isinstance(ports, dict) or any(
                not isinstance(name, str) or not _STABLE_NAME.fullmatch(name)
                for name in ports
            ):
                raise ContractError(f"Action {map_name} must use stable names")
            for name, port in ports.items():
                _validate_type(port, f"action {map_name}.{name}")
        for key in ("targets", "effects"):
            if not isinstance(definition[key], (dict, list)):
                raise ContractError(f"Action {key} must be structured declarative data")
    validators = definition.get("requiredValidators", [])
    if not isinstance(validators, list) or any(
        not isinstance(item, str) or not item for item in validators
    ):
        raise ContractError("requiredValidators must be a list of exact capability IDs")


def _number(value: Decimal | int | float) -> str:
    if isinstance(value, bool):
        raise ContractError("Boolean is not a JSON number")
    try:
        number = value if isinstance(value, Decimal) else Decimal(str(value))
    except InvalidOperation as exc:
        raise ContractError("Invalid JSON number") from exc
    if not number.is_finite():
        raise ContractError("Non-finite numbers are not supported")
    if number.is_zero():
        return "0"
    sign, digits, exponent = number.as_tuple()
    digits = list(digits)
    while digits and digits[-1] == 0:
        digits.pop()
        exponent += 1
    coefficient = "".join(str(digit) for digit in digits)
    return f"{'-' if sign else ''}{coefficient}e{exponent}"


def canonical_json(value: Any) -> bytes:
    """Version 1 canonical encoding; object keys sort by Unicode scalar order."""
    _validate_unicode(value)

    def encode(item: Any) -> str:
        if item is None:
            return "null"
        if item is True:
            return "true"
        if item is False:
            return "false"
        if isinstance(item, (Decimal, int, float)):
            return _number(item)
        if isinstance(item, str):
            return json.dumps(item, ensure_ascii=False, separators=(",", ":"))
        if isinstance(item, list):
            return "[" + ",".join(encode(child) for child in item) + "]"
        if isinstance(item, dict):
            if any(not isinstance(key, str) for key in item):
                raise ContractError("Canonical JSON object keys must be strings")
            return "{" + ",".join(
                encode(key) + ":" + encode(item[key]) for key in sorted(item)
            ) + "}"
        raise ContractError(f"Unsupported canonical JSON value {type(item).__name__}")

    return encode(value).encode("utf-8")


def contract_fingerprint(envelope: dict[str, Any]) -> str:
    validate_contract(envelope)
    return hashlib.sha256(_DOMAIN + canonical_json(envelope)).hexdigest()


def contract_identity(envelope: dict[str, Any]) -> tuple[str, str, str]:
    return envelope["kind"], envelope["id"], envelope["version"]


def authorize_publisher(mod_id: str, namespace_publishers: dict[str, str]) -> None:
    if not isinstance(namespace_publishers, dict) or any(
        not isinstance(namespace, str)
        or not isinstance(publisher, str)
        or not namespace
        or not publisher
        for namespace, publisher in namespace_publishers.items()
    ):
        raise ContractError("Publisher authorization must be a namespace-to-publisher mapping")
    namespace = mod_id.split(".", 1)[0]
    if namespace == "helix":
        if (
            mod_id != "helix.timhoogervorst"
            or namespace_publishers.get("helix") != "helix.timhoogervorst"
        ):
            raise ContractError("The helix namespace is reserved")
        return
    if namespace_publishers.get(namespace) != mod_id:
        raise ContractError(f"Publisher {mod_id!r} is not authorized for namespace {namespace!r}")


def resolve_artifacts(package_dir: Path, artifact_names: Iterable[str]) -> list[dict[str, Any]]:
    """Read package-relative contract files without allowing package escape."""
    root = package_dir.resolve(strict=True)
    result = []
    for name in artifact_names:
        if not isinstance(name, str) or not name:
            raise ContractError("Contract artifact paths must be non-empty strings")
        path = (root / name).resolve(strict=True)
        if not path.is_relative_to(root) or not path.is_file():
            raise ContractError(f"Contract artifact escapes package or is not a file: {name}")
        result.append(parse_contract_json(path.read_bytes()))
    return result


def validate_dependency_closure(
    contracts: Iterable[dict[str, Any]],
    retained: Iterable[dict[str, Any]] = (),
) -> None:
    available = {contract_identity(item) for item in [*retained, *contracts]}
    for envelope in contracts:
        for reference in _contract_references(envelope["definition"]):
            if reference not in available:
                raise ContractError(f"Missing exact contract dependency {reference!r}")


def _contract_references(value: Any):
    if isinstance(value, dict):
        if value.get("type") == "contract":
            yield value["kind"], value["id"], value["version"]
        for item in value.values():
            yield from _contract_references(item)
    elif isinstance(value, list):
        for item in value:
            yield from _contract_references(item)
