"""Tests for the unified POST /api/actions/ endpoint.

Exercises all acceptance criteria from issue #325:
- 201 for valid action types (core and custom)
- 400 for unregistered action types
- Dual-row creation for custom actions
- Correct table routing per mod
- Deterministic response shape
"""

from __future__ import annotations

from typing import Any

from django.test import override_settings
from rest_framework import status

from helix_core.actions.registry import register_action_model, register_custom_action
from core.models import User
from core.tests.base import BaseTestCase


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════


def _assert_action_shape(testcase, item: dict[str, Any]) -> None:
    """Assert that an action response item has the deterministic shape."""
    testcase.assertIn("id", item)
    testcase.assertIsInstance(item["id"], int)
    testcase.assertIn("action", item)
    testcase.assertIsInstance(item["action"], str)
    testcase.assertIn("action_type", item)
    testcase.assertIsInstance(item["action_type"], str)
    testcase.assertIn("target_type", item)
    testcase.assertIsInstance(item["target_type"], str)
    testcase.assertIn("target_id", item)
    testcase.assertIsInstance(item["target_id"], int)
    testcase.assertIn("metadata", item)
    testcase.assertIsInstance(item["metadata"], dict)
    testcase.assertIn("created_at", item)
    testcase.assertIsInstance(item["created_at"], str)
    testcase.assertIn("performed_by", item)
    testcase.assertIsInstance(item["performed_by"], dict)
    testcase.assertIn("id", item["performed_by"])
    testcase.assertIn("username", item["performed_by"])


def _save_registry_state() -> dict[str, Any]:
    """Snapshot the registry's mutable collections."""
    from helix_core.mod_system.registry import registry

    return {
        "action_models": dict(registry._action_models),
        "core_actions": dict(registry._core_actions),
        "custom_actions": {
            mod: dict(actions)
            for mod, actions in registry._custom_actions.items()
        },
    }


def _restore_registry_state(saved: dict[str, Any]) -> None:
    """Restore the registry from a snapshot."""
    from helix_core.mod_system.registry import registry

    registry._action_models.clear()
    registry._action_models.update(saved["action_models"])
    registry._core_actions.clear()
    registry._core_actions.update(saved["core_actions"])
    registry._custom_actions.clear()
    for mod, actions in saved["custom_actions"].items():
        registry._custom_actions[mod] = dict(actions)


# ═══════════════════════════════════════════════════════════════════════════
# Test cases
# ═══════════════════════════════════════════════════════════════════════════


class TestUnifiedActionEndpoint(BaseTestCase):
    """Tests for POST /api/actions/ — the unified action logging endpoint."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._saved_registry = _save_registry_state()

    @classmethod
    def tearDownClass(cls):
        _restore_registry_state(cls._saved_registry)
        super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        # Ensure a clean per-test registry state.
        self._per_test_saved = _save_registry_state()

    def tearDown(self):
        _restore_registry_state(self._per_test_saved)
        super().tearDown()

    # ── helpers ──────────────────────────────────────────────────────────

    def _setup_action_models(self) -> None:
        """Register ELN and Tags action models with their core actions."""
        from mods.eln.models import ElnAction
        from mods.tags.models import TagsAction

        register_action_model("eln", ElnAction)
        register_action_model("tags", TagsAction)

    # ── valid action types (core) ────────────────────────────────────────

    def test_core_action_created_returns_201(self):
        """POST with action_type='created' returns 201 and the created row."""
        self._setup_action_models()

        response = self.client.post(
            "/api/actions/",
            {
                "action": "created",
                "action_type": "created",
                "target_type": "eln.entry",
                "target_id": 42,
                "workspace_id": "eln",
                "metadata": {"name": "Test Entry"},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.data
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 1)
        item = data[0]
        _assert_action_shape(self, item)
        self.assertEqual(item["action_type"], "created")
        self.assertEqual(item["target_type"], "eln.entry")
        self.assertEqual(item["target_id"], 42)
        self.assertEqual(item["metadata"], {"name": "Test Entry"})

        # Row actually landed in the database.
        from mods.eln.models import ElnAction

        self.assertEqual(ElnAction.objects.count(), 1)
        row = ElnAction.objects.first()
        self.assertEqual(row.action_type, "created")
        self.assertEqual(row.performed_by, self.user)

    def test_core_action_edited_returns_201(self):
        """POST with action_type='edited' returns 201."""
        self._setup_action_models()

        response = self.client.post(
            "/api/actions/",
            {
                "action": "edited",
                "action_type": "edited",
                "target_type": "eln.entry",
                "target_id": 7,
                "workspace_id": "eln",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data[0]["action_type"], "edited")

    def test_core_action_deleted_returns_201(self):
        """POST with action_type='deleted' returns 201."""
        self._setup_action_models()

        response = self.client.post(
            "/api/actions/",
            {
                "action": "deleted",
                "action_type": "deleted",
                "target_type": "eln.entry",
                "target_id": 99,
                "workspace_id": "eln",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data[0]["action_type"], "deleted")

    def test_metadata_defaults_to_empty_dict(self):
        """When metadata is omitted, it defaults to {}."""
        self._setup_action_models()

        response = self.client.post(
            "/api/actions/",
            {
                "action": "created",
                "action_type": "created",
                "target_type": "eln.entry",
                "target_id": 1,
                "workspace_id": "eln",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data[0]["metadata"], {})

    def test_client_ip_is_populated(self):
        """The client_ip field is captured from REMOTE_ADDR (#342)."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        response = self.client.post(
            "/api/actions/",
            {
                "action": "created",
                "action_type": "created",
                "target_type": "eln.entry",
                "target_id": 42,
                "workspace_id": "eln",
            },
            format="json",
            REMOTE_ADDR="10.0.0.42",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ElnAction.objects.count(), 1)

        row = ElnAction.objects.first()
        self.assertEqual(row.client_ip, "10.0.0.42")

    # ── valid action types (custom → dual-row) ───────────────────────────

    def test_custom_action_creates_single_row(self):
        """A custom action logs a single row (the custom action_type only).

        Previously custom actions logged both a core row and the custom
        row.  After #342 the doubling was removed — only the custom
        action_type row is created.  Consumers that need the core verb
        can derive it from the catalog mapping.
        """
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)
        register_custom_action(
            mod_id="eln",
            action_id="eln.entry.registered",
            label="Entry Registered",
            core="edited",
            target_model="mods.eln.models.NotebookEntry",
        )

        response = self.client.post(
            "/api/actions/",
            {
                "action": "eln.entry.registered",
                "action_type": "edited",
                "target_type": "eln.entry",
                "target_id": 42,
                "workspace_id": "eln",
                "metadata": {"reg_id": "REG-001"},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Response should be a list with a single row.
        data = response.data
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 1)

        # The single row should have the custom action identifier.
        self.assertEqual(data[0]["action"], "eln.entry.registered")

        # Exactly one row in the database.
        self.assertEqual(ElnAction.objects.count(), 1)

        row = ElnAction.objects.first()
        self.assertEqual(row.action, "eln.entry.registered")
        self.assertEqual(row.performed_by, self.user)
        self.assertEqual(row.target_type, "eln.entry")
        self.assertEqual(row.target_id, 42)
        self.assertEqual(row.metadata, {"reg_id": "REG-001"})

    def test_custom_action_with_different_core_mapping(self):
        """Custom actions can map to different core verbs; only custom row stored."""
        from mods.tags.models import TagsAction

        register_action_model("tags", TagsAction)
        register_custom_action(
            mod_id="tags",
            action_id="tags.tag.attached",
            label="Tag Attached",
            core="created",
            target_model="mods.tags.models.Tag",
        )

        response = self.client.post(
            "/api/actions/",
            {
                "action": "tags.tag.attached",
                "action_type": "created",
                "target_type": "tags.tag",
                "target_id": 10,
                "workspace_id": "tags",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data), 1)

        self.assertEqual(response.data[0]["action"], "tags.tag.attached")

        self.assertEqual(TagsAction.objects.count(), 1)
        self.assertEqual(TagsAction.objects.first().action, "tags.tag.attached")

    # ── unregistered action types → 400 ─────────────────────────────────

    def test_unregistered_action_type_returns_400(self):
        """An action_type not in the catalog returns 400 Bad Request."""
        self._setup_action_models()

        response = self.client.post(
            "/api/actions/",
            {
                "action": "eln.entry.nonexistent_action",
                "action_type": "edited",
                "target_type": "eln.entry",
                "target_id": 1,
                "workspace_id": "eln",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("action", str(response.data).lower())

    def test_action_type_for_unregistered_mod_returns_400(self):
        """An action_type for a mod that has no action model returns 400."""
        response = self.client.post(
            "/api/actions/",
            {
                "action": "created",
                "action_type": "created",
                "target_type": "nonexistent.thing",
                "target_id": 1,
                "workspace_id": "nonexistent",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── correct table routing per mod ────────────────────────────────────

    def test_actions_route_to_correct_mod_table(self):
        """Actions for different mods land in the correct concrete tables."""
        from mods.eln.models import ElnAction
        from mods.tags.models import TagsAction

        register_action_model("eln", ElnAction)
        register_action_model("tags", TagsAction)

        # Log an ELN action.
        resp_eln = self.client.post(
            "/api/actions/",
            {
                "action": "created",
                "action_type": "created",
                "target_type": "eln.entry",
                "target_id": 1,
                "workspace_id": "eln",
            },
            format="json",
        )
        self.assertEqual(resp_eln.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ElnAction.objects.count(), 1)
        self.assertEqual(TagsAction.objects.count(), 0)

        # Log a Tags action.
        resp_tags = self.client.post(
            "/api/actions/",
            {
                "action": "created",
                "action_type": "created",
                "target_type": "tags.tag",
                "target_id": 1,
                "workspace_id": "tags",
            },
            format="json",
        )
        self.assertEqual(resp_tags.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ElnAction.objects.count(), 1)
        self.assertEqual(TagsAction.objects.count(), 1)

    # ── deterministic response shape ─────────────────────────────────────

    def test_response_shape_is_deterministic(self):
        """Same input yields the same response shape (contract test)."""
        self._setup_action_models()

        payload = {
            "action": "created",
            "action_type": "created",
            "target_type": "eln.entry",
            "target_id": 42,
            "workspace_id": "eln",
            "metadata": {"key": "value"},
        }

        response1 = self.client.post(
            "/api/actions/", payload, format="json"
        )
        response2 = self.client.post(
            "/api/actions/", payload, format="json"
        )

        self.assertEqual(response1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response2.status_code, status.HTTP_201_CREATED)

        # Both responses are lists with the same shape.
        self.assertIsInstance(response1.data, list)
        self.assertIsInstance(response2.data, list)
        self.assertEqual(len(response1.data), 1)
        self.assertEqual(len(response2.data), 1)

        keys1 = set(response1.data[0].keys())
        keys2 = set(response2.data[0].keys())
        self.assertEqual(keys1, keys2)

    def test_custom_action_response_shape_is_deterministic(self):
        """Custom action single-row response has a deterministic shape."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)
        register_custom_action(
            mod_id="eln",
            action_id="eln.entry.registered",
            label="Entry Registered",
            core="edited",
            target_model="mods.eln.models.NotebookEntry",
        )

        payload = {
            "action": "eln.entry.registered",
            "action_type": "edited",
            "target_type": "eln.entry",
            "target_id": 42,
            "workspace_id": "eln",
        }

        response1 = self.client.post(
            "/api/actions/", payload, format="json"
        )
        response2 = self.client.post(
            "/api/actions/", payload, format="json"
        )

        self.assertEqual(response1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response1.data), 1)
        self.assertEqual(len(response2.data), 1)

        _assert_action_shape(self, response1.data[0])
        _assert_action_shape(self, response2.data[0])

    # ── authentication ───────────────────────────────────────────────────

    def test_unauthenticated_request_returns_403(self):
        """Requests without authentication are rejected."""
        self.client.force_authenticate(user=None)

        response = self.client.post(
            "/api/actions/",
            {
                "action": "created",
                "action_type": "created",
                "target_type": "eln.entry",
                "target_id": 1,
                "workspace_id": "eln",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # ── validation ──────────────────────────────────────────────────────

    def test_missing_required_fields_returns_400(self):
        """Missing required fields returns 400 with validation errors."""
        self._setup_action_models()

        response = self.client.post(
            "/api/actions/",
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data
        self.assertIn("action", errors)
        self.assertIn("action_type", errors)
        self.assertIn("target_type", errors)
        self.assertIn("target_id", errors)
        self.assertIn("workspace_id", errors)

    def test_invalid_target_id_returns_400(self):
        """A non-integer target_id returns 400."""
        self._setup_action_models()

        response = self.client.post(
            "/api/actions/",
            {
                "action": "created",
                "action_type": "created",
                "target_type": "eln.entry",
                "target_id": "not-an-integer",
                "workspace_id": "eln",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ── request_id ────────────────────────────────────────────────────────

    def test_request_id_is_populated_on_created_row(self):
        """The request_id field is populated even when the client doesn't supply one."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        response = self.client.post(
            "/api/actions/",
            {
                "action": "created",
                "action_type": "created",
                "target_type": "eln.entry",
                "target_id": 42,
                "workspace_id": "eln",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ElnAction.objects.count(), 1)

        row = ElnAction.objects.first()
        self.assertIsNotNone(row.request_id)
        self.assertEqual(len(str(row.request_id)), 36)  # UUID format

    def test_request_id_uses_client_provided_value(self):
        """When the client provides a request_id, the server stores it as-is."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        response = self.client.post(
            "/api/actions/",
            {
                "action": "created",
                "action_type": "created",
                "target_type": "eln.entry",
                "target_id": 42,
                "workspace_id": "eln",
                "request_id": "550e8400-e29b-41d4-a716-446655440000",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ElnAction.objects.count(), 1)

        row = ElnAction.objects.first()
        self.assertEqual(
            str(row.request_id),
            "550e8400-e29b-41d4-a716-446655440000",
        )
