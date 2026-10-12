from __future__ import annotations

import json
from pathlib import Path

from helix_core.mod_system.catalog import build_catalog
from helix_core.mod_system.validator import validate_author, validate_deployment


FIXTURE = Path(__file__).parents[3] / "src" / "mods" / "hello_world"


def test_hello_world_mod_is_a_valid_dual_artifact_source_repository():
    result = validate_author(FIXTURE)

    assert result.exit_code == 0, [
        diagnostic.to_dict() for diagnostic in result.diagnostics
    ]
    assert json.loads((FIXTURE / "modManifest.json").read_text()) == {
        "id": "example.helloworld",
        "displayName": "Hello World",
        "version": "1.0.0",
        "requiresHelix": ">=1.0.0",
        "artifacts": ["frontend", "backend"],
        "dependsOn": [],
        "description": "A small dual-artifact Mod template.",
    }


def test_hello_world_mod_catalog_is_discovered_from_its_backend_entry_point(
    monkeypatch, tmp_path
):
    class Distribution:
        name = "hello-world-mod"
        version = "1.0.0"

    entry_point = type(
        "EntryPoint",
        (),
        {
            "name": "example.helloworld",
            "value": "mods.hello_world",
            "dist": Distribution(),
        },
    )()
    monkeypatch.syspath_prepend(str(FIXTURE.parents[1]))

    catalog = build_catalog(bundled_paths=[], external_entry_points=[entry_point])

    record = catalog["mods"][0]
    assert record["tier"] == "External"
    assert record["manifest"]["id"] == "example.helloworld"
    assert record["artifacts"]["backend"]["locator"] == "mods.hello_world"
    assert (
        record["artifacts"]["frontend"]["frontendImportSpecifier"]
        == "@example/hello-world-mod"
    )

    output = tmp_path / "catalog.json"
    result = validate_deployment(
        output,
        bundled_paths=[],
        external_entry_points=[entry_point],
        active_mods=["example.helloworld"],
    )
    assert result.exit_code == 0, [
        diagnostic.to_dict() for diagnostic in result.diagnostics
    ]
    assert output.is_file()


def test_hello_world_mod_contains_the_copyable_contract_seams():
    frontend = (FIXTURE / "index.ts").read_text()
    backend = (FIXTURE / "mod.py").read_text()

    for declaration in (
        "registerWorkspace",
        "declareSlot",
        "registerBlock",
        "registerIntoSlot",
        "registerExternalRoute",
        "example.helloworld.entity.created",
        "/api/actions/",
    ):
        assert declaration in frontend

    for declaration in (
        "register_model",
        "register_schema_type",
        "register_custom_action",
        "register_service",
        "mod.call(greeting_service)",
        "api/mods/example/helloworld/",
    ):
        assert declaration in backend

    assert (FIXTURE / "migrations" / "0001_initial.py").is_file()
    assert (FIXTURE / "apps.py").read_text().count("ModAppConfig = make_app_config") == 1
