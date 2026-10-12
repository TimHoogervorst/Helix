"""Contract validation shared by authoring tools and deployment startup."""

from __future__ import annotations

import json
from importlib import resources
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from .bundled import BUNDLED_MODS
from .catalog import build_catalog, write_catalog
from .manifest import validate_manifest
from .imports import scan_forbidden_imports

EXIT_OK = 0
EXIT_CONTRACT_VIOLATION = 1
EXIT_TOOL_FAILURE = 2


@dataclass(frozen=True)
class SourceLocation:
    path: str
    line: int | None = None
    column: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            key: value
            for key, value in {
                "path": self.path,
                "line": self.line,
                "column": self.column,
            }.items()
            if value is not None
        }


@dataclass(frozen=True)
class Diagnostic:
    code: str
    severity: str
    message: str
    location: SourceLocation | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
        }
        if self.location is not None:
            result["location"] = self.location.to_dict()
        return result


@dataclass(frozen=True)
class ValidationResult:
    diagnostics: tuple[Diagnostic, ...] = ()
    catalog: dict[str, Any] | None = None
    tool_failure: bool = False

    @property
    def exit_code(self) -> int:
        if self.tool_failure:
            return EXIT_TOOL_FAILURE
        return (
            EXIT_CONTRACT_VIOLATION
            if any(diagnostic.severity == "error" for diagnostic in self.diagnostics)
            else EXIT_OK
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.exit_code == EXIT_OK,
            "diagnostics": [diagnostic.to_dict() for diagnostic in self.diagnostics],
            **({"catalog": self.catalog} if self.catalog is not None else {}),
        }


def validate_author(source_dir: str | Path) -> ValidationResult:
    """Validate one Mod source repository without importing registration code."""
    root = Path(source_dir)
    manifest_path = root / "modManifest.json"
    diagnostics: list[Diagnostic] = []

    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return _contract_result(
            "MANIFEST_MISSING", f"Manifest not found: {manifest_path}", manifest_path
        )
    except (OSError, json.JSONDecodeError) as exc:
        return _contract_result("MANIFEST_INVALID", str(exc), manifest_path)

    try:
        validate_manifest(raw)
    except (TypeError, ValueError) as exc:
        diagnostics.append(
            Diagnostic(
                _manifest_code(str(exc), raw),
                "error",
                str(exc),
                SourceLocation(str(manifest_path), 1, 1),
            )
        )
        return ValidationResult(tuple(diagnostics))

    artifacts = set(raw["artifacts"])
    required_files = {
        "frontend": root / "index.ts",
        "backend": root / "mod.py",
    }
    for artifact in sorted(artifacts):
        path = required_files[artifact]
        if not path.is_file():
            diagnostics.append(
                Diagnostic(
                    "ARTIFACT_MISSING",
                    "error",
                    f"Declared {artifact} artifact is missing.",
                    SourceLocation(str(path)),
                )
            )

    for finding in scan_forbidden_imports(root, package_name=root.name):
        diagnostics.append(
            Diagnostic(
                finding.code,
                "error",
                f"Import '{finding.imported}' is not allowed for an External Mod.",
                SourceLocation(str(root / finding.path), finding.line, 1),
            )
        )

    return ValidationResult(tuple(diagnostics))


def validate_deployment(
    output: str | Path,
    *,
    bundled_paths: Iterable[str] = BUNDLED_MODS,
    external_entry_points: Iterable[Any] | None = None,
    active_mods: Iterable[str] | None = None,
) -> ValidationResult:
    """Validate the installed set and atomically publish its Catalog if valid."""
    try:
        catalog = build_catalog(
            bundled_paths=bundled_paths,
            external_entry_points=external_entry_points,
        )
        diagnostics = _validate_catalog_dependencies(catalog)
        diagnostics.extend(_validate_catalog_imports(catalog))
        diagnostics.extend(_validate_active_mods(catalog, active_mods))
        diagnostics = list({(diagnostic.code, diagnostic.message): diagnostic for diagnostic in diagnostics}.values())
        if diagnostics:
            return ValidationResult(tuple(diagnostics))
        write_catalog(output, catalog)
        return ValidationResult((), catalog)
    except ValueError as exc:
        return _contract_result(_catalog_code(str(exc)), str(exc), Path(output))
    except (OSError, ImportError, RuntimeError) as exc:
        return _tool_result(str(exc), Path(output))


def validate_activation(registry: Any) -> None:
    """Resolve backend references at the boot boundary, before the app runs."""
    try:
        registry.resolve_references()
    except (TypeError, ValueError) as exc:
        raise ValidationFailure(
            Diagnostic(
                "REFERENCE_UNRESOLVED",
                "error",
                str(exc),
            )
        ) from exc


class ValidationFailure(RuntimeError):
    def __init__(self, diagnostic: Diagnostic) -> None:
        super().__init__(diagnostic.message)
        self.diagnostic = diagnostic


def _validate_catalog_dependencies(catalog: dict[str, Any]) -> list[Diagnostic]:
    records = catalog.get("mods", [])
    versions = {
        record["manifest"]["id"]: record["manifest"]["version"]
        for record in records
    }
    diagnostics: list[Diagnostic] = []
    for record in records:
        manifest = record["manifest"]
        for dependency in manifest.get("dependsOn", []):
            dependency_id = dependency["id"]
            if dependency_id not in versions:
                diagnostics.append(
                    Diagnostic(
                        "DEPENDENCY_MISSING",
                        "error",
                        f"Mod '{manifest['id']}' depends on missing '{dependency_id}'.",
                    )
                )
            elif not _satisfies(versions[dependency_id], dependency["version"]):
                diagnostics.append(
                    Diagnostic(
                        "DEPENDENCY_INCOMPATIBLE",
                        "error",
                        f"Mod '{manifest['id']}' requires '{dependency_id}' "
                        f"{dependency['version']}, found {versions[dependency_id]}.",
                    )
                )
    return diagnostics


def _validate_catalog_imports(catalog: dict[str, Any]) -> list[Diagnostic]:
    baseline = _bundled_import_baseline()
    diagnostics: list[Diagnostic] = []
    for record in catalog.get("mods", []):
        manifest = record["manifest"]
        for finding in record.get("importViolations", []):
            key = _import_key(record, finding)
            if record["tier"] == "Bundled" and key in baseline:
                continue
            diagnostics.append(
                Diagnostic(
                    finding["code"],
                    "error",
                    f"Import '{finding['import']}' is forbidden for "
                    f"{record['tier']} Mod '{manifest['id']}'.",
                    SourceLocation(finding["path"], finding["line"], 1),
                )
            )
    return diagnostics


def _bundled_import_baseline() -> set[str]:
    data = resources.files("helix_core.mod_system").joinpath("forbidden_import_baseline.json")
    return set(json.loads(data.read_text(encoding="utf-8")))


def _import_key(record: dict[str, Any], finding: dict[str, Any]) -> str:
    locator = next(iter(record["artifacts"].values()))["locator"]
    return ":".join(
        (locator, finding["code"], finding["path"], str(finding["line"]), finding["import"])
    )


def _validate_active_mods(
    catalog: dict[str, Any], active_mods: Iterable[str] | None
) -> list[Diagnostic]:
    if active_mods is None:
        return []
    installed = {record["manifest"]["id"] for record in catalog.get("mods", [])}
    active = set(active_mods)
    diagnostics: list[Diagnostic] = []
    for mod_id in sorted(active - installed):
        diagnostics.append(
            Diagnostic("ACTIVE_MOD_MISSING", "error", f"Active Mod '{mod_id}' is not installed.")
        )
    by_id = {record["manifest"]["id"]: record["manifest"] for record in catalog.get("mods", [])}
    for mod_id in sorted(active & installed):
        for dependency in by_id[mod_id].get("dependsOn", []):
            if dependency["id"] not in active:
                diagnostics.append(
                    Diagnostic(
                        "ACTIVE_DEPENDENCY_MISSING",
                        "error",
                        f"Active Mod '{mod_id}' requires active Mod '{dependency['id']}'.",
                    )
                )
            elif not _satisfies(
                by_id[dependency["id"]]["version"], dependency["version"]
            ):
                diagnostics.append(
                    Diagnostic(
                        "DEPENDENCY_INCOMPATIBLE",
                        "error",
                        f"Mod '{mod_id}' requires '{dependency['id']}' "
                        f"{dependency['version']}, found {by_id[dependency['id']]['version']}.",
                    )
                )
    return diagnostics


def _satisfies(version: str, requirement: str) -> bool:
    """Evaluate the npm range forms accepted by the manifest contract."""
    from .manifest import _compare, _version

    actual = _version(version)
    for alternative in requirement.split("||"):
        comparators: list[tuple[str, tuple[int, int, int, tuple[str, ...]]]] = []
        for token in alternative.strip().split():
            if token in {"*", "x", "X"}:
                continue
            operator = "="
            for candidate in (">=", "<=", ">", "<", "=", "^", "~"):
                if token.startswith(candidate):
                    operator, token = candidate, token[len(candidate):]
                    break
            parts = token.split(".")
            numeric_parts = [part for part in parts if part.lower() not in {"x", "*"}]
            if not numeric_parts or len(numeric_parts) > 3:
                return False
            expected = _version(".".join((numeric_parts + ["0", "0"])[:3]))
            if operator == "^":
                upper = _caret_upper_bound(expected, len(numeric_parts))
                comparators.extend(((">=", expected), ("<", upper)))
            elif operator == "~":
                upper = (expected[0], expected[1] + 1, 0, ())
                comparators.extend(((">=", expected), ("<", upper)))
            elif operator == "=" and len(numeric_parts) < 3:
                upper = _partial_upper_bound(expected, len(numeric_parts))
                comparators.extend(((">=", expected), ("<", upper)))
            else:
                comparators.append((operator, expected))
        if _range_matches(actual, comparators, _compare):
            return True
    return False


def _caret_upper_bound(version: tuple[int, int, int, tuple[str, ...]], parts: int):
    major, minor, patch, _ = version
    if major > 0:
        return major + 1, 0, 0, ()
    if parts == 1:
        return 1, 0, 0, ()
    if minor > 0 or parts == 2:
        return 0, minor + 1, 0, ()
    return 0, 0, patch + 1, ()


def _partial_upper_bound(version, parts: int):
    if parts == 1:
        return version[0] + 1, 0, 0, ()
    return version[0], version[1] + 1, 0, ()


def _range_matches(actual, comparators, compare) -> bool:
    if actual[3] and not any(expected[3] and actual[:3] == expected[:3] for _, expected in comparators):
        return False
    return all({
        ">=": compare(actual, expected) >= 0,
        "<=": compare(actual, expected) <= 0,
        ">": compare(actual, expected) > 0,
        "<": compare(actual, expected) < 0,
        "=": compare(actual, expected) == 0,
    }[operator] for operator, expected in comparators)


def _manifest_code(message: str, raw: Any | None = None) -> str:
    if isinstance(raw, dict) and isinstance(raw.get("version"), str):
        from .manifest import _SEMVER

        if not _SEMVER.fullmatch(raw["version"]):
            return "VERSION_INVALID"
    if "artifacts must not" in message:
        return "ARTIFACT_DUPLICATE"
    if "dependsOn must not" in message:
        return "DEPENDENCY_DUPLICATE"
    if "version must" in message:
        return "VERSION_INVALID"
    if "requiresHelix must" in message:
        return "HELIX_RANGE_INVALID"
    if "dependency" in message and "range" in message:
        return "DEPENDENCY_RANGE_INVALID"
    return "SCHEMA"


def _catalog_code(message: str) -> str:
    if "fingerprint" in message:
        return "CATALOG_STALE"
    if "depends" in message and "missing" in message:
        return "DEPENDENCY_MISSING"
    if "modManifest" in message or "manifest" in message.lower():
        return "MANIFEST_INVALID"
    return "CATALOG_INVALID"


def _contract_result(code: str, message: str, path: Path) -> ValidationResult:
    return ValidationResult((Diagnostic(code, "error", message, SourceLocation(str(path))),))


def _tool_result(message: str, path: Path) -> ValidationResult:
    return ValidationResult(
        (Diagnostic("TOOL_FAILURE", "error", message, SourceLocation(str(path))),),
        tool_failure=True,
    )
