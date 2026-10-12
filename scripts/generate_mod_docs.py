"""Generate the External Mod contract references.

The references are deliberately generated from files that exist in this
repository.  The source hashes in each output make a stale checked-in copy a
CI failure even when a source change does not require a new prose section.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "src/helix_core/mod_system/manifest_schema.json"
PYTHON_SOURCES = [
    ROOT / "src/helix_core/mod_system/manifest.py",
    ROOT / "src/helix_core/mod_system/loader.py",
    ROOT / "src/helix_core/mod_system/registry.py",
]
TYPESCRIPT_SOURCES = [
    ROOT / "src/shell/src/mod-system/types.ts",
    ROOT / "src/shell/src/mod-system/index.ts",
    ROOT / "src/shell/src/mod-system/Mod.ts",
    ROOT / "src/shell/src/mod-system/ModLoader.tsx",
]
OUTPUTS = {
    "manifest": ROOT / "docs/mod-manifest-1.0.0.md",
    "typescript": ROOT / "docs/generated/typescript-api.md",
    "python": ROOT / "docs/generated/python-api.md",
    "diagnostics": ROOT / "docs/generated/validator-diagnostics.md",
}


def source_hashes(paths: list[Path]) -> str:
    lines = []
    for path in paths:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        lines.append(f"<!-- {path.relative_to(ROOT).as_posix()}: {digest} -->")
    return "\n".join(lines)


def header(title: str, paths: list[Path]) -> str:
    return (
        f"# {title}\n\n"
        "<!-- This file is generated. Do not edit it directly. -->\n"
        f"{source_hashes(paths)}\n\n"
    )


def schema_reference() -> str:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    required = set(schema["required"])
    rows = [
        "| Field | Required | JSON type | Contract |",
        "| --- | --- | --- | --- |",
    ]
    for name, definition in schema["properties"].items():
        json_type = definition.get("type", "reference")
        contract = []
        if "minLength" in definition:
            contract.append(f"minimum length {definition['minLength']}")
        if "minItems" in definition:
            contract.append(f"minimum items {definition['minItems']}")
        if "enum" in definition:
            contract.append("one of " + ", ".join(f"`{item}`" for item in definition["enum"]))
        if "pattern" in definition:
            contract.append(f"pattern `{definition['pattern']}`")
        if definition.get("uniqueItems"):
            contract.append("unique items")
        if name == "dependsOn":
            contract.append("items are `{id, version}` objects")
        rows.append(
            f"| `{name}` | {'yes' if name in required else 'no'} | `{json_type}` | "
            + ("; ".join(contract) or "as defined by the schema")
            + " |"
        )
    return header("Mod Manifest Fields", [SCHEMA]) + "\n".join(rows) + "\n"


def exported_typescript_symbols() -> list[str]:
    index = (ROOT / "src/shell/src/mod-system/index.ts").read_text(encoding="utf-8")
    symbols = re.findall(r"export \{\s*([^}]+?)\s*\} from", index, re.S)
    result = []
    for group in symbols:
        for symbol in group.split(","):
            name = symbol.strip().split()[0]
            if name:
                result.append(name)
    return result


def typescript_reference() -> str:
    types = (ROOT / "src/shell/src/mod-system/types.ts").read_text(encoding="utf-8")
    interfaces = re.findall(r"export interface (\w+)", types)
    classes = []
    methods = []
    for path in TYPESCRIPT_SOURCES:
        text = path.read_text(encoding="utf-8")
        found_classes = re.findall(r"export (?:default )?class (\w+)", text)
        classes.extend(found_classes)
        for class_name in found_classes:
            class_body = text.split(f"class {class_name}", 1)[-1]
            methods.extend(
                f"{class_name}.{method}"
                for method in re.findall(r"^\s{2}(?:async\s+)?(?:get\s+)?(\w+)\s*\(", class_body, re.M)
                if method != "constructor" and not method.startswith("_")
            )
    symbols = list(dict.fromkeys(exported_typescript_symbols() + interfaces + classes + ["parseJsonManifest"]))
    bullets = ["- `" + symbol + "`" for symbol in symbols + list(dict.fromkeys(methods))]
    return (
        header("TypeScript Mod API Reference", TYPESCRIPT_SOURCES)
        + "The public Mod-system entry point is `src/shell/src/mod-system/index.ts`.\n\n"
        + "The following symbols are exported or implemented by that entry point:\n\n"
        + "\n".join(bullets)
        + "\n\n"
        + "Manifest shape and validation rules are generated separately in "
        "[Mod Manifest Fields](mod-manifest-fields.md).\n"
    )


def python_signature(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    args = ast.unparse(node.args)
    prefix = "async " if isinstance(node, ast.AsyncFunctionDef) else ""
    return f"{prefix}{node.name}({args})"


def python_reference() -> str:
    entries: list[tuple[str, str]] = []
    for path in PYTHON_SOURCES:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        module = path.relative_to(ROOT).as_posix()
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith("_"):
                entries.append((module, python_signature(node)))
            elif isinstance(node, ast.ClassDef) and not node.name.startswith("_"):
                entries.append((module, f"class {node.name}"))
                for child in node.body:
                    if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and not child.name.startswith("_"):
                        entries.append((module, f"{node.name}.{python_signature(child)}"))
    bullets = [f"- `{module}`: `{signature}`" for module, signature in entries]
    return (
        header("Python Mod API Reference", PYTHON_SOURCES)
        + "The public backend SDK is rooted at `helix_core`. The entries below "
        "are derived from the manifest, loader, and registry modules.\n\n"
        + "\n".join(bullets)
        + "\n"
    )


def diagnostics_reference() -> str:
    manifest = (ROOT / "src/helix_core/mod_system/manifest.py").read_text(encoding="utf-8")
    checks = [
        ("SCHEMA", "JSON Schema validation", "Draft202012Validator"),
        ("ARTIFACT_DUPLICATE", "Duplicate artifacts", "artifacts must not contain duplicates"),
        ("DEPENDENCY_DUPLICATE", "Duplicate dependency IDs", "dependsOn must not contain duplicate IDs"),
        ("VERSION_INVALID", "Invalid manifest SemVer", "version must be a valid SemVer"),
        ("HELIX_RANGE_INVALID", "Invalid requiresHelix range", "requiresHelix must be a valid npm range"),
        ("DEPENDENCY_RANGE_INVALID", "Invalid dependency range", "has an invalid npm range"),
    ]
    rows = [
        "| Code | Condition | Current source evidence |",
        "| --- | --- | --- |",
    ]
    for code, condition, evidence in checks:
        if evidence not in manifest:
            raise SystemExit(f"diagnostic evidence disappeared from manifest.py: {evidence}")
        rows.append(f"| `{code}` | {condition} | `{evidence}` |")
    return (
        header("Validator Diagnostics", [ROOT / "src/helix_core/mod_system/manifest.py", SCHEMA])
        + "The validator currently exposes `ValueError` messages rather than a "
        "machine-readable diagnostic object. These labels are stable documentation "
        "anchors for the existing checks; changing a source message requires regenerating this file.\n\n"
        + "\n".join(rows)
        + "\n\n"
        + "Schema failures use the JSON Schema validator's message and path. "
        "Loader failures are documented with the loader API and are not duplicated here.\n"
    )


def generated() -> dict[str, str]:
    return {
        "manifest": schema_reference(),
        "typescript": typescript_reference(),
        "python": python_reference(),
        "diagnostics": diagnostics_reference(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if generated files are stale")
    args = parser.parse_args()
    output = generated()
    stale = []
    for name, path in OUTPUTS.items():
        content = output[name]
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != content:
                stale.append(path.relative_to(ROOT).as_posix())
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    if stale:
        print("Generated documentation is stale:")
        print("\n".join(f"- {path}" for path in stale))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
