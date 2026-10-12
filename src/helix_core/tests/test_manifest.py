"""Contract tests for the strict 1.0.0 external manifest."""

import json
from pathlib import Path

import pytest

from helix_core.mod_system.manifest import Dependency, ModManifest, validate_manifest


FIXTURES = json.loads(
    (Path(__file__).parents[1] / "mod_system" / "manifest_fixtures.json").read_text()
)
VALID = FIXTURES["valid"][0]


def test_valid_manifest_is_typed_without_normalization():
    manifest = ModManifest.from_dict(VALID)
    assert manifest.id == "acme.sample-mod"
    assert manifest.artifacts == ("frontend", "backend")
    assert manifest.depends_on == (Dependency("helix.lims", "^1.4.0"),)


@pytest.mark.parametrize("field", ["id", "version", "requiresHelix", "artifacts", "dependsOn"])
def test_required_fields_are_enforced(field):
    invalid = {key: value for key, value in VALID.items() if key != field}
    with pytest.raises(ValueError):
        validate_manifest(invalid)


@pytest.mark.parametrize("manifest", [
    {**VALID, "id": "Acme.sample"},
    {**VALID, "id": "acme"},
    {**VALID, "id": "acme.sämple"},
    {**VALID, "dependsOn": ["helix.lims"]},
    {**VALID, "dependsOn": [{"id": "helix.lims"}]},
    {**VALID, "coreVersion": ">=1.0.0"},
    {**VALID, "artifacts": ["fullstack"]},
    {**VALID, "artifacts": ["frontend", "frontend"]},
    {**VALID, "dependsOn": [{"id": "helix.lims", "version": "^1.0.0"}, {"id": "helix.lims", "version": "^2.0.0"}]},
])
def test_legacy_and_invalid_shapes_are_rejected(manifest):
    with pytest.raises(ValueError):
        validate_manifest(manifest)


def test_shared_invalid_fixtures_are_rejected():
    for manifest in FIXTURES["invalid"]:
        with pytest.raises(ValueError):
            validate_manifest(manifest)
