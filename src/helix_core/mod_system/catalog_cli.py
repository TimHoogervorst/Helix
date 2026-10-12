"""Command-line entry point for deployment Mod Catalog generation."""

from __future__ import annotations

import argparse

from .bundled import BUNDLED_MODS
from .catalog import generate_catalog


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the Helix Mod Catalog")
    parser.add_argument("output", help="catalog path to replace atomically")
    args = parser.parse_args()
    generate_catalog(args.output, bundled_paths=BUNDLED_MODS)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
