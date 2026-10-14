"""Acceptance tests for the in-repository ELN External Mod package."""

from pathlib import Path

from helix_core.mod_system import loader


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
ELN_PACKAGE = REPOSITORY_ROOT / "src" / "mods" / "eln"


def test_eln_is_loaded_as_an_external_package(monkeypatch):
    """The in-repository package is discovered through the external seam."""
    monkeypatch.setattr(
        loader,
        "discover_python_mod_entry_points",
        lambda: {"helix.eln": "mods.eln"},
    )

    mods = loader.get_helix_mods()

    assert "mods.eln" in mods


def test_eln_package_owns_app_label_and_migrations():
    """Django's app and migration state resolve inside the external package."""
    apps = ELN_PACKAGE / "apps.py"
    migrations = ELN_PACKAGE / "migrations"

    assert apps.is_file()
    assert (migrations / "__init__.py").is_file()
    assert sorted(migrations.glob("*.py"))
    assert "load_entry_point_manifest" in apps.read_text(encoding="utf-8")
    assert '"eln"' in apps.read_text(encoding="utf-8")


def test_eln_migrations_are_registered_under_the_external_app_label():
    """Django resolves the app and migration package from the external path."""
    from django.apps import apps
    from importlib import import_module

    config = apps.get_app_config("eln")

    assert config.name == "mods.eln"
    assert config.label == "eln"
    assert import_module(config.name + ".migrations").__package__ == "mods.eln.migrations"
