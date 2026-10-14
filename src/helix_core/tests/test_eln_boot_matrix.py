"""Acceptance matrix for booting with and without the optional ELN package."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[2]
MANAGE = SRC / "server" / "manage.py"


def _run_manage(src: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment.update(
        {
            "DATABASE_URL": f"sqlite://{src / 'boot-matrix.sqlite3'}",
            "SECRET_KEY": "boot-matrix",
            "DEBUG": "true",
            "PYTHONPATH": str(src),
        }
    )
    return subprocess.run(
        [sys.executable, str(src / "server" / "manage.py"), *arguments],
        cwd=src / "server",
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )


def _assert_manage_succeeds(src: Path, *arguments: str) -> None:
    result = _run_manage(src, *arguments)
    assert result.returncode == 0, result.stdout + result.stderr


def test_installed_eln_passes_check_and_migrate():
    """The normal package composition remains a valid Django installation."""
    _assert_manage_succeeds(SRC, "check")
    _assert_manage_succeeds(SRC, "migrate", "--noinput")


def test_removing_eln_folder_keeps_shell_bootable(tmp_path: Path):
    """Deleting the optional package leaves the platform shell operational."""
    deployed_src = tmp_path / "src"
    shutil.copytree(SRC, deployed_src, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.rmtree(deployed_src / "mods" / "eln")

    environment = os.environ.copy()
    environment.update(
        {
            "DATABASE_URL": f"sqlite://{deployed_src / 'boot-matrix.sqlite3'}",
            "SECRET_KEY": "boot-matrix",
            "DEBUG": "true",
            "PYTHONPATH": str(deployed_src),
            "HELIX_NO_EXTERNAL_MODS": "1",
        }
    )
    for command in (("check",), ("migrate", "--noinput")):
        result = subprocess.run(
            [sys.executable, str(deployed_src / "server" / "manage.py"), *command],
            cwd=deployed_src / "server",
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stdout + result.stderr
