"""Platform contract tests for GET /api/mod-registry/."""

from __future__ import annotations

import json
from pathlib import Path
import unittest

from django.test import TestCase
from rest_framework.test import APIClient

from helix_core.core.models import User
from helix_core.models import Schema, SchemaType

SCHEMA_PATH = Path(__file__).parent / "schemas" / "mod-registry-response.json"
MOD_REGISTRY_RESPONSE_SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
TOP_LEVEL_NON_WORKSPACE = {
    "columnTypes", "iconLibrary", "colorPalette", "formulaFunctions",
    "services", "blocks", "slots", "metricProviders", "recordActions",
}


class ModRegistryContractTests(TestCase):
    """Verify the API contract and a registered Platform fixture schema."""

    def setUp(self):
        self.client = APIClient()
        user = User.objects.create_user(username="registry-user", password="pass")
        self.client.force_authenticate(user=user)
        self.schema_type = SchemaType.objects.create(
            display_name="Fixture Entity",
            workspace_id="fixture",
            model=("helix_core.tests.fixtures.external_mod.models."
                   "ConcreteTestEntity"),
            columns=[{"name": "sample_type", "type": "text"}],
            capabilities=["RegistrationTable"],
        )
        Schema.objects.create(
            name="Default", prefix="FIX", schema_type=self.schema_type,
            is_default=True,
            columns=[{"name": "sample_type", "type": "text"}],
        )

    def test_response_matches_json_schema(self):
        from jsonschema import validate
        from unittest.mock import patch
        from helix_core.mod_system.registry import BackendModRegistry
        from helix_core.public import ModRegistrar, load_entry_point_manifest

        backend_registry = BackendModRegistry()
        registrar = ModRegistrar(load_entry_point_manifest(
            "test.external", "helix_core.tests.fixtures.external_mod",
        ), backend_registry)
        action = registrar.register_record_action(
            "edit", label="Edit fixture", action_contract_id="test.external.edit",
            action_contract_version="1.0.0", handler=lambda context, inputs: None,
        )
        with patch("helix_core.mod_system.registry.registry", backend_registry):
            response = self.client.get("/api/mod-registry/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["recordActions"][0]["id"], action.id)
        validate(instance=response.data, schema=MOD_REGISTRY_RESPONSE_SCHEMA)

    def test_formula_catalog_declares_client_implementation(self):
        response = self.client.get("/api/mod-registry/")
        functions = {entry["id"]: entry for entry in response.data["formulaFunctions"]}
        self.assertTrue(functions["IF"]["clientImplemented"])
        self.assertFalse(functions["MOD"]["clientImplemented"])
        self.assertIn("argumentKinds", functions["IF"])
        self.assertIn("resultKind", functions["IF"])

    def test_fixture_schema_type_is_exposed_with_its_default_schema(self):
        response = self.client.get("/api/mod-registry/")
        fixture = response.data["fixture"]
        self.assertEqual(fixture["workspaceId"], "fixture")
        entry = next(
            item for item in fixture["schemaTypes"]
            if item["displayName"] == "Fixture Entity"
        )
        self.assertEqual(entry["id"], "tests.concretetestentity")
        self.assertEqual(entry["prefix"], "FIX")
        self.assertEqual(entry["capabilities"], ["RegistrationTable"])
        self.assertEqual(entry["columns"][0]["name"], "sample_type")

    def test_workspace_entries_have_consistent_identity(self):
        response = self.client.get("/api/mod-registry/")
        for workspace_id, entry in response.data.items():
            if workspace_id in TOP_LEVEL_NON_WORKSPACE:
                continue
            self.assertEqual(entry["workspaceId"], workspace_id)
            self.assertEqual(entry["workspace"], workspace_id)
            self.assertTrue(entry["vendor"])
            self.assertTrue(entry["mod"])


class ModRegistryEmptyTests(TestCase):
    def test_empty_schema_registry_returns_shared_catalogs_only(self):
        Schema.objects.all().delete()
        SchemaType.objects.all().delete()
        response = APIClient().get("/api/mod-registry/")
        self.assertEqual(response.status_code, 200)
        for key in ("columnTypes", "iconLibrary", "colorPalette", "formulaFunctions"):
            self.assertIn(key, response.data)
        workspace_keys = [
            key for key in response.data if key not in TOP_LEVEL_NON_WORKSPACE
        ]
        self.assertEqual(workspace_keys, [])


class ModRegistrySchemaFileTests(unittest.TestCase):
    """The distribution schema is checked without database setup."""

    def test_schema_file_is_valid_json(self):
        parsed = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        self.assertEqual(
            parsed["$id"],
            "https://helix.example.com/schemas/mod-registry-response.json",
        )
        self.assertIn("patternProperties", parsed)
        self.assertEqual(parsed["type"], "object")
