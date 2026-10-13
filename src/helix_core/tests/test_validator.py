import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from helix_core.mod_system.validator import (
    EXIT_CONTRACT_VIOLATION,
    EXIT_OK,
    EXIT_TOOL_FAILURE,
    Diagnostic,
    SourceLocation,
    validate_author,
    validate_activation,
    validate_deployment,
    validate_no_eln_references,
    ValidationFailure,
)
from helix_core.mod_system.validator import _satisfies
from helix_core.mod_system.validator import scan_forbidden_eln_references


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


def test_external_author_validation_rejects_private_helix_import(tmp_path):
    mod_dir = tmp_path / "hello_world"
    mod_dir.mkdir()
    (mod_dir / "modManifest.json").write_text(json.dumps(_manifest()))
    (mod_dir / "mod.py").write_text("from helix_core.models import Schema\n")

    result = validate_author(mod_dir)

    assert result.exit_code == EXIT_CONTRACT_VIOLATION
    assert [diagnostic.code for diagnostic in result.diagnostics] == [
        "FORBIDDEN_PRIVATE_HELIX_IMPORT"
    ]
    assert result.diagnostics[0].location.line == 1


def test_external_author_validation_rejects_cross_mod_import_even_when_declared(tmp_path):
    mod_dir = tmp_path / "hello_world"
    mod_dir.mkdir()
    (mod_dir / "modManifest.json").write_text(
        json.dumps(_manifest(dependsOn=[{"id": "helix.lims", "version": "^1.0.0"}]))
    )
    (mod_dir / "mod.py").write_text("from bundled.lims.models import Entity\n")

    result = validate_author(mod_dir)

    assert result.exit_code == EXIT_CONTRACT_VIOLATION
    assert [diagnostic.code for diagnostic in result.diagnostics] == [
        "FORBIDDEN_CROSS_MOD_IMPORT"
    ]
    assert "dependsOn" not in result.diagnostics[0].message


def test_external_author_validation_allows_framework_and_self_imports(tmp_path):
    mod_dir = tmp_path / "hello_world"
    mod_dir.mkdir()
    (mod_dir / "modManifest.json").write_text(json.dumps(_manifest()))
    (mod_dir / "mod.py").write_text(
        "from helix_core import Mod\n"
        "from helix_core.public import load_entry_point_manifest\n"
        "from hello_world.models import Thing\n"
    )

    result = validate_author(mod_dir)

    assert result.exit_code == EXIT_OK
    assert result.diagnostics == ()


def test_external_author_validation_rejects_cross_mod_frontend_import(tmp_path):
    mod_dir = tmp_path / "hello_world"
    mod_dir.mkdir()
    (mod_dir / "modManifest.json").write_text(
        json.dumps(_manifest(artifacts=["frontend"]))
    )
    (mod_dir / "index.ts").write_text(
        'import type { Mod } from "@helix/mod-api";\n'
        'import { register } from "@helix/lims";\n'
    )

    result = validate_author(mod_dir)

    assert result.exit_code == EXIT_CONTRACT_VIOLATION
    assert result.diagnostics[0].code == "FORBIDDEN_CROSS_MOD_IMPORT"
    assert result.diagnostics[0].location.path.endswith("index.ts")


def test_startup_scan_rejects_eln_imports_and_migration_dependencies(tmp_path):
    package = tmp_path / "bundled_sample"
    (package / "migrations").mkdir(parents=True)
    (package / "index.ts").write_text('import { create } from "@helix/eln";\n')
    (package / "migrations" / "0001_initial.py").write_text(
        'dependencies = [("eln", "0001_initial")]\n'
        'Model = apps.get_model("eln", "NotebookEntry")\n'
    )

    findings = scan_forbidden_eln_references(package, package_name="bundled.sample")

    assert [(finding.path, finding.imported) for finding in findings] == [
        ("index.ts", "@helix/eln"),
        ("migrations/0001_initial.py", "eln"),
        ("migrations/0001_initial.py", "eln"),
    ]


def test_startup_scan_rejects_eln_sql_and_frontend_identifiers(tmp_path):
    package = tmp_path / "bundled_sample"
    (package / "migrations").mkdir(parents=True)
    (package / "migrations" / "0002_view.py").write_text(
        'migrations.RunSQL("SELECT * FROM eln_entry")\n'
    )
    (package / "index.ts").write_text('const route = "helix.eln:entry";\n')

    findings = scan_forbidden_eln_references(package, package_name="bundled.sample")

    assert [(finding.path, finding.imported) for finding in findings] == [
        ("index.ts", "helix.eln"),
        ("migrations/0002_view.py", "eln"),
    ]


def test_startup_validation_fails_fast_on_a_bundled_eln_reference(tmp_path):
    platform = tmp_path / "platform"
    bundled = tmp_path / "bundled"
    platform.mkdir()
    bundled.mkdir()
    (bundled / "mod.py").write_text('from mods.eln.models import NotebookEntry\n')

    with pytest.raises(ValidationFailure, match="references ELN"):
        validate_no_eln_references(platform_path=platform, bundled_paths=[bundled])


def test_bundled_lims_source_and_migrations_are_provider_independent():
    root = Path(__file__).resolve().parents[2] / "bundled" / "lims"

    assert scan_forbidden_eln_references(root, package_name="bundled.lims") == []


def test_bundled_import_baseline_rejects_new_violation(tmp_path):
    package = tmp_path / "bundled_sample"
    package.mkdir()
    (package / "modManifest.json").write_text(
        json.dumps(_manifest(id="helix.sample", artifacts=["backend"]))
    )
    (package / "mod.py").write_text("from bundled.other.models import Thing\n")
    (package / "__init__.py").write_text("")

    import sys

    sys.path.insert(0, str(tmp_path))
    try:
        result = validate_deployment(
            tmp_path / "catalog.json",
            bundled_paths=["bundled_sample"],
            external_entry_points=[],
        )
    finally:
        sys.path.remove(str(tmp_path))

    assert result.exit_code == EXIT_CONTRACT_VIOLATION
    assert result.diagnostics[0].code == "FORBIDDEN_CROSS_MOD_IMPORT"


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


def test_active_dependency_versions_are_checked_against_the_installed_catalog(tmp_path):
    base = tmp_path / "base"
    app = tmp_path / "app"
    for package in (base, app):
        package.mkdir()
        (package / "__init__.py").write_text("")
        (package / "mod.py").write_text("")
    (base / "modManifest.json").write_text(json.dumps(_manifest(id="acme.base", version="1.5.0")))
    (app / "modManifest.json").write_text(
        json.dumps(
            _manifest(
                id="acme.app",
                dependsOn=[{"id": "acme.base", "version": "^2.0.0"}],
            )
        )
    )
    entry_points = [
        SimpleNamespace(name="acme.base", value="base", dist=SimpleNamespace(name="base", version="1.5.0")),
        SimpleNamespace(name="acme.app", value="app", dist=SimpleNamespace(name="app", version="1.0.0")),
    ]

    import sys

    sys.path.insert(0, str(tmp_path))
    try:
        result = validate_deployment(
            tmp_path / "catalog.json",
            bundled_paths=[],
            external_entry_points=entry_points,
            active_mods=["acme.app", "acme.base"],
        )
    finally:
        sys.path.remove(str(tmp_path))

    assert result.exit_code == EXIT_CONTRACT_VIOLATION
    assert [diagnostic.code for diagnostic in result.diagnostics] == [
        "DEPENDENCY_INCOMPATIBLE"
    ]


def test_satisfies_uses_npm_caret_and_tilde_bounds():
    assert _satisfies("1.9.9", "^1.2.3")
    assert not _satisfies("2.0.0", "^1.2.3")
    assert _satisfies("0.2.9", "^0.2.3")
    assert not _satisfies("0.3.0", "^0.2.3")
    assert _satisfies("0.0.4", "^0.0.3") is False
    assert _satisfies("1.2.9", "~1.2.3")
    assert not _satisfies("1.3.0", "~1.2.3")


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
