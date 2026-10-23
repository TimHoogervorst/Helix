"""Build the ELN source distribution and verify its manifest payload."""

from __future__ import annotations

import json
import io
import os
import shutil
import tarfile
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from setuptools import build_meta


package_root = Path(__file__).resolve().parents[1]
manifest = json.loads((package_root / "modManifest.json").read_text(encoding="utf-8"))
required_files = ["modManifest.json", *manifest["contracts"]]
required_files.extend(
    f"migrations/{path.name}" for path in (package_root / "migrations").glob("*.py")
)
with tempfile.TemporaryDirectory(
    prefix="helix-eln-sdist-", dir=package_root
) as output_dir:
    build_root = Path(output_dir)
    source_package = build_root / "src" / "mods" / "eln"
    source_package.parent.mkdir(parents=True)
    shutil.copytree(
        package_root,
        source_package,
        ignore=shutil.ignore_patterns(Path(output_dir).name, "__pycache__", "*.pyc"),
    )
    distribution_dir = build_root / "dist"
    distribution_dir.mkdir()
    previous_directory = Path.cwd()
    try:
        os.chdir(source_package)
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            artifact = build_meta.build_sdist(str(distribution_dir))
    finally:
        os.chdir(previous_directory)
    source_archive = distribution_dir / artifact
    with tarfile.open(source_archive, "r:gz") as archive:
        members = set(archive.getnames())

    for relative_path in required_files:
        expected_suffix = f"/{relative_path}"
        if not any(member.endswith(expected_suffix) for member in members):
            raise AssertionError(
                f"{relative_path} is missing from built source distribution {source_archive.name}; "
                f"members: {sorted(members)}"
            )

print("ELN source distribution contains its manifest and every declared contract.")
