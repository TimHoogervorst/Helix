import json
import sys

import pytest

from helix_core.mod_system.catalog import (
    build_catalog,
    validate_catalog,
    write_catalog,
)


class _Distribution:
    name = "acme-sample"
    version = "2.3.0"


class _EntryPoint:
    name = "acme.sample"
    value = "acme_sample.mod"
    dist = _Distribution()


def _manifest():
    return {
        "id": "acme.sample",
        "displayName": "Sample",
        "version": "2.3.0",
        "requiresHelix": ">=1.0.0",
        "artifacts": ["backend"],
        "dependsOn": [
            {"id": "helix.zed", "version": "^1.0.0"},
            {"id": "helix.alpha", "version": "^1.0.0"},
        ],
    }


def test_catalog_discovers_entry_point_and_normalizes_manifest(tmp_path, monkeypatch):
    package = tmp_path / "acme_sample"
    package.mkdir()
    (package / "__init__.py").write_text("raise RuntimeError('must not execute')")
    (package / "mod.py").write_text("# registration is not imported during discovery\n")
    (package / "modManifest.json").write_text(json.dumps(_manifest()))
    monkeypatch.syspath_prepend(str(tmp_path))

    catalog = build_catalog(
        bundled_paths=[],
        external_entry_points=[_EntryPoint()],
    )

    assert catalog["mods"][0]["manifest"]["dependsOn"] == [
        {"id": "helix.alpha", "version": "^1.0.0"},
        {"id": "helix.zed", "version": "^1.0.0"},
    ]
    mod = catalog["mods"][0]
    assert mod["tier"] == "External"
    assert mod["artifacts"]["backend"]["locator"] == "acme_sample.mod"
    assert mod["artifacts"]["backend"]["distributionVersion"] == "2.3.0"
    assert len(mod["artifacts"]["backend"]["hash"]) == 64
    assert "activation" not in json.dumps(catalog)


def test_catalog_is_deterministic_and_replaced_atomically(tmp_path):
    first = build_catalog(bundled_paths=[], external_entry_points=[])
    second = build_catalog(bundled_paths=[], external_entry_points=[])
    assert first == second
    assert first["installationFingerprint"]

    target = tmp_path / "mod-catalog.json"
    write_catalog(target, first)
    assert json.loads(target.read_text())["installationFingerprint"] == first[
        "installationFingerprint"
    ]


def test_bundled_tier_clears_manifest_dependencies_and_stale_catalogs_fail():
    catalog = build_catalog(
        bundled_paths=["bundled.shared.home"], external_entry_points=[]
    )
    assert catalog["mods"][0]["tier"] == "Bundled"
    assert catalog["mods"][0]["manifest"]["dependsOn"] == []
    validate_catalog(catalog)

    catalog["mods"][0]["artifacts"]["backend"]["hash"] = "0" * 64
    with pytest.raises(ValueError, match="fingerprint"):
        validate_catalog(catalog)


def test_catalog_rejects_a_catalog_for_another_installation():
    catalog = build_catalog(bundled_paths=[], external_entry_points=[])

    with pytest.raises(ValueError, match="fingerprint"):
        validate_catalog(catalog, expected_fingerprint="different")
