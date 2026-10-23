"""Exercise real startup across process boundaries, outside pytest's registry bypass."""

import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize("without_external_mods", ["1", "0"])
def test_server_registers_bundled_routes_after_separate_migration(tmp_path, without_external_mods):
    import config

    src = Path(__file__).resolve().parents[2]
    server = Path(config.__file__).resolve().parent.parent
    env = {
        **os.environ,
        "PYTHONPATH": os.pathsep.join((str(src), str(server))),
        "DJANGO_SETTINGS_MODULE": "config.settings",
        "DATABASE_URL": "sqlite://startup.sqlite3",
        "HELIX_NO_EXTERNAL_MODS": without_external_mods,
    }

    def run(*args):
        result = subprocess.run(
            [sys.executable, *args], cwd=tmp_path, env=env,
            capture_output=True, text=True, timeout=120,
        )
        assert result.returncode == 0, result.stdout + result.stderr

    run(str(server / "manage.py"), "check")
    run(str(server / "manage.py"), "migrate", "--noinput")
    run("-c", """
import django
django.setup()
from django.urls import resolve
from helix_core.models import ModInstallation
for path in ('/api/core/tabs/', '/api/core/tabs/folders/', '/api/access/projects/', '/api/home/cards/'):
    resolve(path)
assert ModInstallation.objects.filter(state='active').exists()
assert not ModInstallation.objects.filter(tier='External', state='active').exists()
"""
    )
