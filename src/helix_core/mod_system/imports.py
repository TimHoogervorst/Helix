"""Static import-boundary checks for Mod source trees."""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ForbiddenImport:
    code: str
    path: str
    line: int
    imported: str

    def to_dict(self) -> dict[str, object]:
        return {
            "code": self.code,
            "path": self.path,
            "line": self.line,
            "import": self.imported,
        }


_JS_IMPORT = re.compile(
    r"^\s*(?:import|export)\b.*?\bfrom\s*[\"']([^\"']+)[\"']|"
    r"^\s*import\s*[\(]?\s*[\"']([^\"']+)[\"']"
)


def scan_forbidden_imports(
    source_dir: str | Path, *, package_name: str
) -> list[ForbiddenImport]:
    root = Path(source_dir)
    own_prefixes = {package_name, package_name.rsplit(".", 1)[-1]}
    if package_name.startswith(("bundled.", "mods.")):
        own_prefixes.add(package_name)
    findings: list[ForbiddenImport] = []
    for path in sorted(_source_files(root), key=lambda item: item.as_posix()):
        if path.suffix == ".py":
            findings.extend(_python_findings(path, root, own_prefixes))
        else:
            findings.extend(_javascript_findings(path, root))
    return sorted(findings, key=lambda finding: (finding.path, finding.line, finding.imported))


def _source_files(root: Path):
    ignored = {"__pycache__", "migrations", "tests", "__tests__"}
    for path in root.rglob("*"):
        if not path.is_file() or ignored.intersection(path.parts):
            continue
        if path.name.startswith("test_"):
            continue
        if path.suffix in {".py", ".ts", ".tsx", ".js", ".jsx"}:
            yield path


def _python_findings(path: Path, root: Path, own_prefixes: set[str]) -> list[ForbiddenImport]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    findings: list[ForbiddenImport] = []
    for node in ast.walk(tree):
        imported = None
        if isinstance(node, ast.Import):
            imported = node.names[0].name
        elif isinstance(node, ast.ImportFrom) and node.level == 0:
            imported = node.module
        if imported is None:
            continue
        code = _python_code(imported, own_prefixes)
        if code is not None:
            findings.append(_finding(code, path, root, node.lineno, imported))
    return findings


def _python_code(imported: str, own_prefixes: set[str]) -> str | None:
    if imported == "helix_core" or imported == "helix_core.public" or imported.startswith(
        "helix_core.public."
    ):
        return None
    if imported.startswith("helix_core."):
        return "FORBIDDEN_PRIVATE_HELIX_IMPORT"
    if imported == "bundled" or imported.startswith("bundled."):
        return (
            None
            if any(imported == prefix or imported.startswith(prefix + ".") for prefix in own_prefixes)
            else "FORBIDDEN_CROSS_MOD_IMPORT"
        )
    if imported == "mods" or imported.startswith("mods."):
        return (
            None
            if any(imported == prefix or imported.startswith(prefix + ".") for prefix in own_prefixes)
            else "FORBIDDEN_CROSS_MOD_IMPORT"
        )
    return None


def _javascript_findings(path: Path, root: Path) -> list[ForbiddenImport]:
    findings: list[ForbiddenImport] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        match = _JS_IMPORT.match(line)
        if not match:
            continue
        imported = match.group(1) or match.group(2)
        if imported == "@helix/mod-api":
            continue
        if imported.startswith("@helix/"):
            findings.append(
                _finding("FORBIDDEN_CROSS_MOD_IMPORT", path, root, line_number, imported)
            )
    return findings


def _finding(code: str, path: Path, root: Path, line: int, imported: str) -> ForbiddenImport:
    return ForbiddenImport(code, path.relative_to(root).as_posix(), line, imported)
