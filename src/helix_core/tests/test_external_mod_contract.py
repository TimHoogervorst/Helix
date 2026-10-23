"""Platform contracts for optional Mods, independent of ELN."""

from __future__ import annotations

import json

import pytest

from helix_core.mod_system import loader
from helix_core.mod_system.lifecycle import ModLifecycleState, sync_mod_installations
from helix_core.models import ModInstallation


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
    monkeypatch.delenv("HELIX_NO_EXTERNAL_MODS", raising=False)
    monkeypatch.setattr(
        loader,
        "discover_python_mod_entry_points",
        lambda: {"test.external": "test_external"},
    )

    mods = loader.get_helix_mods()
    assert "test_external" in mods
    assert "mods.eln" not in mods


@pytest.mark.django_db
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


@pytest.mark.django_db
def test_discovered_package_registers_usable_content_and_actions(monkeypatch):
    import importlib
    from importlib.metadata import EntryPoint, EntryPoints
    from helix_core.public import ModRegistrar, load_entry_point_manifest
    from helix_core.mod_system.registry import BackendModRegistry
    from helix_core.tests.fixtures.external_mod.models import ConcreteTestEntity

    package = "helix_core.tests.fixtures.external_mod"
    monkeypatch.delenv("HELIX_NO_EXTERNAL_MODS", raising=False)
    monkeypatch.setattr(loader.metadata, "entry_points", lambda: EntryPoints([
        EntryPoint(name="test.external", value=package, group="helix.mods"),
    ]))
    assert package in loader.get_helix_mods()
    manifest = load_entry_point_manifest("test.external", package)
    registry = BackendModRegistry()
    importlib.import_module(f"{package}.mod").register(ModRegistrar(manifest, registry))
    assert registry.get_registered_models()["test.external:entity"] is ConcreteTestEntity
    assert registry.get_content_source("test.external:entry").hub_visible is True
    assert registry.validate_action("test.external:entity.created")
    from helix_core.core.models import User, Project, Folder
    from helix_core.models import SchemaType, Schema
    user = User.objects.create_user(username="fixture")
    project = Project.objects.create(name="Fixture")
    folder = Folder.objects.create(name="Root", project=project)
    schema_type = SchemaType.objects.create(display_name="Fixture", workspace_id="fixture", model=f"{package}.models.ConcreteTestEntity")
    schema = Schema.objects.create(name="Fixture", prefix="FIX", schema_type=schema_type)
    model = registry.get_registered_models()["test.external:entity"]
    entity = model.objects.create(name="Loaded content", author=user, source=folder, schema=schema)
    entity.refresh_from_db()
    assert entity.display_id == "FIX1"
    assert entity.project == project


def test_absent_external_package_keeps_bundled_discovery(monkeypatch):
    monkeypatch.delenv("HELIX_NO_EXTERNAL_MODS", raising=False)
    monkeypatch.setattr(loader, "discover_python_mod_entry_points", lambda: {})
    from helix_core.mod_system.bundled import BUNDLED_MODS
    assert set(loader.get_helix_mods()) == set(BUNDLED_MODS)
