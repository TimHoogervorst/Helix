"""Loader tests for canonical 1.0.0 manifests."""

import json
from types import SimpleNamespace

import pytest

from helix_core.mod_system import loader
from helix_core.mod_system.loader import _read_json_manifest, _validate_manifest_set


def _write_manifest(directory, **overrides):
    data = {
        "id": "acme.sample",
        "displayName": "Sample",
        "version": "1.0.0",
        "requiresHelix": ">=1.0.0",
        "artifacts": ["backend"],
        "dependsOn": [],
    }
    data.update(overrides)
    (directory / "modManifest.json").write_text(json.dumps(data))


def test_json_loader_preserves_canonical_identity(tmp_path):
    mod_dir = tmp_path / "sample"
    mod_dir.mkdir()
    _write_manifest(mod_dir)
    manifest = _read_json_manifest(mod_dir, "sample")
    assert manifest.id == "acme.sample"
    assert manifest.artifacts == ("backend",)


@pytest.mark.parametrize("overrides", [
    {"vendor": "acme", "name": "sample"},
    {"coreVersion": "1.0.0"},
    {"dependsOn": ["helix.core"]},
])
def test_json_loader_rejects_legacy_fields(tmp_path, overrides):
    mod_dir = tmp_path / "sample"
    mod_dir.mkdir()
    _write_manifest(mod_dir, **overrides)
    with pytest.raises(ValueError):
        _read_json_manifest(mod_dir, "sample")


def test_dependency_graph_uses_canonical_ids(tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir()
    second.mkdir()
    _write_manifest(first, id="acme.first")
    _write_manifest(second, id="acme.second", dependsOn=[{"id": "acme.first", "version": "^1.0.0"}])
    manifests = {
        "acme.first": _read_json_manifest(first, "first"),
        "acme.second": _read_json_manifest(second, "second"),
    }
    _validate_manifest_set(manifests)


def test_entry_point_discovery_uses_installed_package_manifest(tmp_path, monkeypatch):
    package = tmp_path / "sample"
    package.mkdir()
    (package / "__init__.py").write_text("")
    _write_manifest(package, id="acme.sample")
    monkeypatch.syspath_prepend(str(tmp_path))
    entry_point = SimpleNamespace(name="acme.sample", value="sample")
    monkeypatch.setattr(
        loader.importlib.metadata,
        "entry_points",
        lambda **_: [entry_point],
    )

    manifests = loader._auto_discover(None)

    assert list(manifests) == ["acme.sample"]
