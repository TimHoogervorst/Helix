"""Platform contracts for optional Mods, independent of ELN."""

from __future__ import annotations

import json

import pytest

from helix_core.mod_system import loader
from helix_core.mod_system.lifecycle import ModLifecycleState, sync_mod_installations
from helix_core.models import ModInstallation


pytestmark = pytest.mark.django_db


def _write_external_mod(tmp_path):
    """Create the smallest package that can cross the external-mod seam."""
    package = tmp_path / "test_external"
    package.mkdir()
    (package / "__init__.py").write_text("", encoding="utf-8")
    (package / "modManifest.json").write_text(
        json.dumps(
            {
                "id": "test.external",
                "displayName": "Test External Mod",
                "version": "1.0.0",
                "requiresHelix": ">=1.0.0",
                "artifacts": ["backend"],
                "dependsOn": [],
            }
        ),
        encoding="utf-8",
    )
    return package


def test_external_mod_discovery_does_not_depend_on_eln(monkeypatch, tmp_path):
    """The package contract is testable even when ELN is not installed."""
    _write_external_mod(tmp_path)
    monkeypatch.syspath_prepend(str(tmp_path))
    monkeypatch.setattr(
        loader,
        "discover_python_mod_entry_points",
        lambda: {"test.external": "test_external"},
    )

    mods = loader.get_helix_mods()
    assert "test_external" in mods
    assert "mods.eln" not in mods


def test_new_external_mods_start_inactive():
    """Discovery must not implicitly activate an optional Mod."""
    sync_mod_installations(
        {
            "test.external": {
                "id": "test.external",
                "displayName": "Test External Mod",
                "version": "1.0.0",
                "requiresHelix": ">=1.0.0",
                "artifacts": ["backend"],
                "dependsOn": [],
            }
        },
        {"test.external": "test_external"},
    )

    installation = ModInstallation.objects.get(mod_id="test.external")
    assert installation.state == ModLifecycleState.INACTIVE
    assert installation.desired_state == ModLifecycleState.INACTIVE
