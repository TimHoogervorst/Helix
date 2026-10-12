import json
from types import SimpleNamespace

from helix_core.mod_system.validator import (
    EXIT_CONTRACT_VIOLATION,
    EXIT_OK,
    EXIT_TOOL_FAILURE,
    Diagnostic,
    SourceLocation,
    validate_author,
    validate_activation,
    validate_deployment,
    ValidationFailure,
)


def _manifest(**overrides):
    value = {
        "id": "acme.sample",
        "displayName": "Sample",
        "version": "1.0.0",
        "requiresHelix": ">=1.0.0",
        "artifacts": ["backend"],
        "dependsOn": [],
    }
    value.update(overrides)
    return value


def test_author_validation_reports_stable_code_and_manifest_location(tmp_path):
    mod_dir = tmp_path / "sample"
    mod_dir.mkdir()
    manifest_path = mod_dir / "modManifest.json"
    manifest_path.write_text(json.dumps(_manifest(version="not-semver")))

    result = validate_author(mod_dir)

    assert result.exit_code == EXIT_CONTRACT_VIOLATION
    assert result.diagnostics[0].code == "VERSION_INVALID"
    assert result.diagnostics[0].location == SourceLocation(
        path=str(manifest_path), line=1, column=1
    )


def test_author_validation_rejects_incomplete_declared_artifacts(tmp_path):
    mod_dir = tmp_path / "sample"
    mod_dir.mkdir()
    (mod_dir / "modManifest.json").write_text(
        json.dumps(_manifest(artifacts=["frontend", "backend"]))
    )
    (mod_dir / "mod.py").write_text("")

    result = validate_author(mod_dir)

    assert result.exit_code == EXIT_CONTRACT_VIOLATION
    assert [diagnostic.code for diagnostic in result.diagnostics] == [
        "ARTIFACT_MISSING"
    ]
    assert result.diagnostics[0].location.path.endswith("index.ts")


def test_diagnostic_json_is_stable_and_machine_readable():
    diagnostic = Diagnostic(
        code="REFERENCE_UNRESOLVED",
        severity="error",
        message="A reference could not be resolved.",
        location=SourceLocation("mod.py", 4, 2),
    )

    assert diagnostic.to_dict() == {
        "code": "REFERENCE_UNRESOLVED",
        "severity": "error",
        "message": "A reference could not be resolved.",
        "location": {"path": "mod.py", "line": 4, "column": 2},
    }
    assert EXIT_OK == 0
    assert EXIT_TOOL_FAILURE == 2


def test_deployment_writes_catalog_only_after_installation_and_activation_pass(
    tmp_path,
):
    package = tmp_path / "sample"
    package.mkdir()
    (package / "__init__.py").write_text("")
    (package / "mod.py").write_text("")
    (package / "modManifest.json").write_text(json.dumps(_manifest()))
    entry_point = SimpleNamespace(
        name="acme.sample", value="sample", dist=SimpleNamespace(name="sample", version="1.0.0")
    )
    output = tmp_path / "catalog.json"

    # The package is discoverable without importing __init__ or mod.py.
    import sys

    sys.path.insert(0, str(tmp_path))
    try:
        result = validate_deployment(
            output,
            bundled_paths=[],
            external_entry_points=[entry_point],
            active_mods=["acme.sample"],
        )
    finally:
        sys.path.remove(str(tmp_path))

    assert result.exit_code == EXIT_OK
    assert output.is_file()
    assert json.loads(output.read_text())["mods"][0]["manifest"]["id"] == "acme.sample"


def test_activation_scope_rejects_an_active_mod_without_its_active_dependency(tmp_path):
    package = tmp_path / "sample"
    package.mkdir()
    (package / "__init__.py").write_text("")
    (package / "mod.py").write_text("")
    (package / "modManifest.json").write_text(
        json.dumps(_manifest(dependsOn=[{"id": "helix.base", "version": "^1.0.0"}]))
    )
    entry_point = SimpleNamespace(
        name="acme.sample", value="sample", dist=SimpleNamespace(name="sample", version="1.0.0")
    )

    import sys

    sys.path.insert(0, str(tmp_path))
    try:
        result = validate_deployment(
            tmp_path / "catalog.json",
            bundled_paths=[],
            external_entry_points=[entry_point],
            active_mods=["acme.sample"],
        )
    finally:
        sys.path.remove(str(tmp_path))

    assert result.exit_code == EXIT_CONTRACT_VIOLATION
    assert result.diagnostics[0].code == "DEPENDENCY_MISSING"
    assert not (tmp_path / "catalog.json").exists()


def test_activation_boundary_turns_unresolved_references_into_stable_failure():
    class Registry:
        def resolve_references(self):
            raise ValueError("Unresolved registrations: model acme.sample:thing")

    try:
        validate_activation(Registry())
    except ValidationFailure as failure:
        assert failure.diagnostic.code == "REFERENCE_UNRESOLVED"
    else:
        raise AssertionError("activation should fail before the application starts")
