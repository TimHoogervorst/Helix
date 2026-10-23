"""CLI for author and deployment Mod validation."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence

from .validator import (
    EXIT_OK,
    Diagnostic,
    SourceLocation,
    ValidationResult,
    validate_author,
    validate_deployment,
)


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "author":
            result = validate_author(args.source)
        else:
            result = validate_deployment(args.output, active_mods=args.active)
    except Exception as exc:  # CLI boundary: unexpected tool/environment failure.
        result = ValidationResult(
            (Diagnostic("TOOL_FAILURE", "error", str(exc), SourceLocation("<tool>")),)
        )

    _write_result(result, args.json)
    return result.exit_code if result.exit_code != EXIT_OK else EXIT_OK


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="helix-validate")
    parser.add_argument("--json", action="store_true", dest="json")
    commands = parser.add_subparsers(dest="command", required=True)
    author = commands.add_parser("author", help="validate one Mod source repository")
    author.add_argument("source")
    deployment = commands.add_parser(
        "deployment", aliases=["deploy"], help="validate installed Mods and write the Catalog"
    )
    deployment.add_argument("output")
    deployment.add_argument(
        "--active",
        action="append",
        default=None,
        help="active Mod ID; may be supplied more than once",
    )
    return parser


def _write_result(result: ValidationResult, as_json: bool) -> None:
    if as_json:
        print(json.dumps(result.to_dict(), sort_keys=True))
        return
    if not result.diagnostics:
        print("Helix Mod validation passed.")
        return
    for diagnostic in result.diagnostics:
        location = diagnostic.location
        suffix = ""
        if location is not None:
            suffix = f" {location.path}"
            if location.line is not None:
                suffix += f":{location.line}:{location.column or 1}"
        print(f"{diagnostic.severity}: {diagnostic.code}:{suffix} {diagnostic.message}")


if __name__ == "__main__":
    raise SystemExit(main())
