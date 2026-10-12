"""Ensure checked-in generated Mod references match their source inputs."""

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).parents[3]


def test_generated_mod_documentation_is_current():
    result = subprocess.run(
        [sys.executable, "scripts/generate_mod_docs.py", "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
