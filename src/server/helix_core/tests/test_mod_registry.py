"""Contract tests for GET /api/mod-registry/.

Validates the response shape against a JSON schema that serves as the
shared contract between backend and frontend.  Also verifies expected
per-mod data: LIMS schema type with ``prefix: "BLOOD"`` and
``workspace_id: "lims"``, ELN schema type with ``prefix: "E"`` and
``workspace_id: "eln"``.

The authoritative JSON schema lives in ``schemas/mod-registry-response.json``.
Tests load it from there so the file is both the test contract and the
distribution artifact for the frontend.
"""

from __future__ import annotations

import json
from pathlib import Path

from django.test import TestCase
from rest_framework.test import APIClient

from core.models import User
from helix_core.models import Schema, SchemaType

# ── Load the shared JSON schema contract ─────────────────────────────────

SCHEMA_DIR = Path(__file__).resolve().parent / "schemas"
SCHEMA_PATH = SCHEMA_DIR / "mod-registry-response.json"


def _load_schema():
    """Load the JSON schema from disk (single source of truth)."""
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


MOD_REGISTRY_RESPONSE_SCHEMA = _load_schema()

# ── tests ────────────────────────────────────────────────────────────────


class ModRegistryContractTests(TestCase):
    """Validate the response shape against the shared JSON schema."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="pass")
        self.client.force_authenticate(user=self.user)

        # Store the original registry state to restore after each test.
        from helix_core.mod_system.registry import registry

        self._original_action_models = dict(registry._action_models)
        self._original_core_actions = dict(registry._core_actions)
        self._original_custom_actions = {
            k: dict(v) for k, v in registry._custom_actions.items()
        }

        # Clear registry state for isolated test.
        registry._action_models.clear()
        registry._core_actions.clear()
        registry._custom_actions.clear()

        # Create LIMS schema type + default schema.
        self.lims_st = SchemaType.objects.create(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
            columns=[{"name": "volume", "type": "number"}],
            tags=["RegistrationTable"],
        )
        Schema.objects.create(
            name="Default",
            prefix="BLOOD",
            schema_type=self.lims_st,
            is_default=True,
            columns=[{"name": "volume", "type": "number"}],
        )

        # Create ELN schema type + default schema.
        self.eln_st = SchemaType.objects.create(
            display_name="ELN Entry",
            workspace_id="eln",
            model="mods.eln.models.NotebookEntry",
            columns=[],
            tags=[],
        )
        Schema.objects.create(
            name="Default",
            prefix="E",
            schema_type=self.eln_st,
            is_default=True,
            columns=[],
        )

        # Register LIMS-style action model (has ACTION_CHOICES).
        # Use register_action_model so core actions are auto-derived.
        class LimsAction:
            ACTION_CHOICES = [
                ("created", "Created"),
                ("used", "Used"),
                ("measured", "Measured"),
            ]

        # Register ELN-style action model (no ACTION_CHOICES).
        class ElnAction:
            pass

        registry.register_action_model("lims", LimsAction)
        registry.register_action_model("eln", ElnAction)

    def tearDown(self):
        from helix_core.mod_system.registry import registry

        registry._action_models.clear()
        registry._action_models.update(self._original_action_models)
        registry._core_actions.clear()
        registry._core_actions.update(self._original_core_actions)
        registry._custom_actions.clear()
        registry._custom_actions.update(self._original_custom_actions)

    # ── JSON Schema validation ───────────────────────────────────────────

    def test_response_matches_json_schema(self):
        """The endpoint response validates against the JSON Schema contract."""
        from jsonschema import validate, ValidationError

        response = self.client.get("/api/mod-registry/")
        self.assertEqual(response.status_code, 200)

        try:
            validate(instance=response.data, schema=MOD_REGISTRY_RESPONSE_SCHEMA)
        except ValidationError as exc:
            self.fail(f"Response does not match JSON schema: {exc.message}")

    # ── Content assertions ───────────────────────────────────────────────

    def test_lims_schema_type(self):
        """LIMS schema type is present with prefix BLOOD."""
        response = self.client.get("/api/mod-registry/")
        payload = response.data

        self.assertIn("lims", payload)
        lims_sts = payload["lims"]["schemaTypes"]
        self.assertEqual(len(lims_sts), 1)
        self.assertEqual(lims_sts[0]["id"], "lims.entity")
        self.assertEqual(lims_sts[0]["displayName"], "Entity")
        self.assertEqual(lims_sts[0]["prefix"], "BLOOD")
        self.assertEqual(lims_sts[0]["tags"], ["RegistrationTable"])

    def test_eln_schema_type(self):
        """ELN schema type is present with prefix E."""
        response = self.client.get("/api/mod-registry/")
        payload = response.data

        self.assertIn("eln", payload)
        eln_sts = payload["eln"]["schemaTypes"]
        self.assertEqual(len(eln_sts), 1)
        self.assertEqual(eln_sts[0]["id"], "eln.notebookentry")
        self.assertEqual(eln_sts[0]["displayName"], "ELN Entry")
        self.assertEqual(eln_sts[0]["prefix"], "E")
        self.assertEqual(eln_sts[0]["tags"], [])

    # ── Action catalog ───────────────────────────────────────────────────

    def test_lims_actions_from_choices(self):
        """LIMS actions merge core actions with ACTION_CHOICES."""
        response = self.client.get("/api/mod-registry/")
        actions = response.data["lims"]["actions"]
        action_ids = {a["id"] for a in actions}
        # Core actions are always present.
        self.assertIn("created", action_ids)
        self.assertIn("edited", action_ids)
        self.assertIn("deleted", action_ids)
        # ACTION_CHOICES entries are included (backward compat).
        self.assertIn("used", action_ids)
        self.assertIn("measured", action_ids)
        # All legacy actions should have a valid action_type.
        for a in actions:
            self.assertIn("action_type", a)

    def test_eln_actions_default_set(self):
        """ELN actions use the auto-derived core set (no ACTION_CHOICES)."""
        response = self.client.get("/api/mod-registry/")
        actions = response.data["eln"]["actions"]
        action_ids = {a["id"] for a in actions}
        self.assertIn("created", action_ids)
        self.assertIn("edited", action_ids)
        self.assertIn("deleted", action_ids)
        for a in actions:
            self.assertIn(a["action_type"], ("read", "created", "edited", "deleted"))

    # ── Edge cases ───────────────────────────────────────────────────────

    def test_workspace_id_field(self):
        """Each mod entry includes its workspaceId."""
        response = self.client.get("/api/mod-registry/")
        TOP_LEVEL_NON_WORKSPACE = {"columnTypes", "iconLibrary", "colorPalette", "formulaFunctions"}
        for ws_id, entry in response.data.items():
            if ws_id in TOP_LEVEL_NON_WORKSPACE:
                continue
            self.assertEqual(entry["workspaceId"], ws_id)


class ModRegistryEmptyTests(TestCase):
    """Tests for the endpoint when no schema types are registered."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="pass")
        self.client.force_authenticate(user=self.user)
        from helix_core.mod_system.registry import registry

        self._original_action_models = dict(registry._action_models)

    def tearDown(self):
        from helix_core.mod_system.registry import registry

        registry._action_models.clear()
        registry._action_models.update(self._original_action_models)

    def test_empty_registry_returns_column_types_only(self):
        """When no SchemaTypes exist, the endpoint returns shared catalogs."""
        response = self.client.get("/api/mod-registry/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("columnTypes", response.data)
        self.assertIn("iconLibrary", response.data)
        self.assertIn("colorPalette", response.data)
        self.assertIn("formulaFunctions", response.data)
        # No workspace entries should be present.
        TOP_LEVEL_NON_WORKSPACE = {"columnTypes", "iconLibrary", "colorPalette", "formulaFunctions"}
        workspace_keys = [k for k in response.data if k not in TOP_LEVEL_NON_WORKSPACE]
        self.assertEqual(workspace_keys, [])


class ModRegistrySchemaFileTests(TestCase):
    """Tests that the on-disk JSON schema file is valid and self-consistent."""

    def test_schema_file_is_valid_json(self):
        """The shared JSON schema file on disk is valid JSON and has expected
        top-level keys."""
        with open(SCHEMA_PATH, encoding="utf-8") as f:
            parsed = json.load(f)

        self.assertEqual(
            parsed["$id"],
            "https://helix.example.com/schemas/mod-registry-response.json",
        )
        self.assertIn("patternProperties", parsed)
        self.assertEqual(parsed["type"], "object")
