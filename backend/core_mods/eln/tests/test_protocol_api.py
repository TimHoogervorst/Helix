"""
Tests for the Protocol API endpoints.

Exercises full CRUD, validation, soft-delete, and is_active filtering.
"""
from unittest.mock import patch

from core.tests.base import BaseTestCase
from core_mods.eln.models import Protocol


VALID_ITEMS = [
    {"type": "step", "text": "Prepare the reaction mix."},
    {"type": "note", "text": "Use fresh reagents."},
    {"type": "step", "text": "Incubate at 37°C for 30 min."},
]

MIXIN_LOG_ACTION_PATH = "core.actions.mixins.log_action"


def _log_kwargs(mock):
    """Return the keyword-args dict from the *first* call to *mock*."""
    if mock.call_count == 0:
        return {}
    return mock.call_args[1]


class ProtocolApiTests(BaseTestCase):
    """CRUD and filtering tests for /api/eln/protocols/."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    # ── Create ──────────────────────────────────────────────────────────

    def test_create_protocol(self):
        """POST returns 201, protocol appears in DB."""
        response = self.client.post(
            "/api/eln/protocols/",
            {"name": "CRISPR RNP Transfection", "items": VALID_ITEMS},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "CRISPR RNP Transfection")
        self.assertEqual(response.data["items"], VALID_ITEMS)
        self.assertTrue(response.data["is_active"])
        self.assertIsNotNone(response.data["created_at"])
        self.assertIsNotNone(response.data["updated_at"])

        self.assertEqual(Protocol.objects.count(), 1)
        protocol = Protocol.objects.first()
        self.assertEqual(protocol.name, "CRISPR RNP Transfection")
        self.assertEqual(protocol.items, VALID_ITEMS)

    def test_create_protocol_empty_items(self):
        """POST with empty items list succeeds."""
        response = self.client.post(
            "/api/eln/protocols/",
            {"name": "Empty Protocol", "items": []},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["items"], [])

    # ── Create — validation ─────────────────────────────────────────────

    def test_create_protocol_empty_name(self):
        """POST with empty name returns 400."""
        response = self.client.post(
            "/api/eln/protocols/",
            {"name": "", "items": VALID_ITEMS},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

    def test_create_protocol_missing_name(self):
        """POST without name returns 400."""
        response = self.client.post(
            "/api/eln/protocols/",
            {"items": VALID_ITEMS},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

    def test_create_protocol_whitespace_name(self):
        """POST with whitespace-only name returns 400."""
        response = self.client.post(
            "/api/eln/protocols/",
            {"name": "   ", "items": VALID_ITEMS},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

    def test_create_protocol_bad_item_type(self):
        """POST with an invalid item type returns 400."""
        response = self.client.post(
            "/api/eln/protocols/",
            {
                "name": "Bad Items",
                "items": [{"type": "invalid", "text": "Nope"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("items", response.data)

    def test_create_protocol_item_missing_text(self):
        """POST with an item missing text returns 400."""
        response = self.client.post(
            "/api/eln/protocols/",
            {
                "name": "Missing Text",
                "items": [{"type": "step"}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("items", response.data)

    def test_create_protocol_item_empty_text(self):
        """POST with an item with empty text returns 400."""
        response = self.client.post(
            "/api/eln/protocols/",
            {
                "name": "Empty Text",
                "items": [{"type": "step", "text": ""}],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("items", response.data)

    def test_create_protocol_items_not_a_list(self):
        """POST with items as a string returns 400."""
        response = self.client.post(
            "/api/eln/protocols/",
            {"name": "Not a List", "items": "not-a-list"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("items", response.data)

    # ── List ────────────────────────────────────────────────────────────

    def test_list_protocols_empty(self):
        """GET returns empty list when no protocols exist."""
        response = self.client.get("/api/eln/protocols/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_list_protocols(self):
        """GET returns all active protocols."""
        Protocol.objects.create(name="Protocol A", items=VALID_ITEMS)
        Protocol.objects.create(name="Protocol B", items=[])

        response = self.client.get("/api/eln/protocols/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        names = {p["name"] for p in response.data["results"]}
        self.assertEqual(names, {"Protocol A", "Protocol B"})

    # ── Retrieve ────────────────────────────────────────────────────────

    def test_retrieve_protocol(self):
        """GET by ID returns full protocol."""
        protocol = Protocol.objects.create(name="My Protocol", items=VALID_ITEMS)
        response = self.client.get(f"/api/eln/protocols/{protocol.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "My Protocol")
        self.assertEqual(response.data["items"], VALID_ITEMS)
        self.assertTrue(response.data["is_active"])

    def test_retrieve_nonexistent_returns_404(self):
        """GET with a non-existent ID returns 404."""
        response = self.client.get("/api/eln/protocols/99999/")
        self.assertEqual(response.status_code, 404)

    # ── Full update (PUT) ───────────────────────────────────────────────

    def test_full_update_protocol(self):
        """PUT replaces name and items."""
        protocol = Protocol.objects.create(name="Old Name", items=VALID_ITEMS)
        new_items = [{"type": "step", "text": "Updated step."}]

        response = self.client.put(
            f"/api/eln/protocols/{protocol.id}/",
            {"name": "New Name", "items": new_items},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "New Name")
        self.assertEqual(response.data["items"], new_items)

        protocol.refresh_from_db()
        self.assertEqual(protocol.name, "New Name")
        self.assertEqual(protocol.items, new_items)

    # ── Partial update (PATCH) ──────────────────────────────────────────

    def test_partial_update_name_only(self):
        """PATCH updates only the name, items unchanged."""
        protocol = Protocol.objects.create(name="Original", items=VALID_ITEMS)

        response = self.client.patch(
            f"/api/eln/protocols/{protocol.id}/",
            {"name": "Renamed"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Renamed")
        self.assertEqual(response.data["items"], VALID_ITEMS)

        protocol.refresh_from_db()
        self.assertEqual(protocol.name, "Renamed")
        self.assertEqual(protocol.items, VALID_ITEMS)

    def test_partial_update_items_only(self):
        """PATCH updates only the items, name unchanged."""
        protocol = Protocol.objects.create(name="Keep Name", items=VALID_ITEMS)
        new_items = [{"type": "note", "text": "Only a note now."}]

        response = self.client.patch(
            f"/api/eln/protocols/{protocol.id}/",
            {"items": new_items},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Keep Name")
        self.assertEqual(response.data["items"], new_items)

    # ── Soft-delete ─────────────────────────────────────────────────────

    def test_soft_delete(self):
        """DELETE sets is_active=False, row still exists."""
        protocol = Protocol.objects.create(name="To Delete", items=VALID_ITEMS)
        self.assertTrue(protocol.is_active)

        response = self.client.delete(f"/api/eln/protocols/{protocol.id}/")
        self.assertEqual(response.status_code, 204)

        protocol.refresh_from_db()
        self.assertFalse(protocol.is_active)
        self.assertTrue(Protocol.objects.filter(pk=protocol.id).exists())

    # ── is_active filtering ─────────────────────────────────────────────

    def test_list_excludes_soft_deleted_by_default(self):
        """GET /protocols/ returns only active protocols."""
        Protocol.objects.create(name="Active", items=VALID_ITEMS, is_active=True)
        Protocol.objects.create(name="Inactive", items=VALID_ITEMS, is_active=False)

        response = self.client.get("/api/eln/protocols/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "Active")

    def test_list_is_active_false(self):
        """GET ?is_active=false returns only inactive protocols."""
        Protocol.objects.create(name="Active", items=VALID_ITEMS, is_active=True)
        Protocol.objects.create(name="Inactive", items=VALID_ITEMS, is_active=False)

        response = self.client.get("/api/eln/protocols/?is_active=false")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["name"], "Inactive")

    def test_list_is_active_all(self):
        """GET ?is_active=all returns all protocols (active + inactive)."""
        Protocol.objects.create(name="Active", items=VALID_ITEMS, is_active=True)
        Protocol.objects.create(name="Inactive", items=VALID_ITEMS, is_active=False)

        response = self.client.get("/api/eln/protocols/?is_active=all")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)

    # ── is_active is read-only ──────────────────────────────────────────

    def test_cannot_set_is_active_on_create(self):
        """POST with is_active=False is ignored (always created active)."""
        response = self.client.post(
            "/api/eln/protocols/",
            {"name": "Try Inactive", "items": VALID_ITEMS, "is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["is_active"])

    def test_cannot_set_is_active_on_update(self):
        """PUT with is_active=False is ignored (field is read-only)."""
        protocol = Protocol.objects.create(name="Test", items=VALID_ITEMS)

        response = self.client.put(
            f"/api/eln/protocols/{protocol.id}/",
            {"name": "Test", "items": VALID_ITEMS, "is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_active"])


class ProtocolActionLoggingTests(BaseTestCase):
    """Test that Protocol CRUD operations log actions via ActionLoggingMixin."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_create_protocol_logs_action(self):
        response = self.client.post(
            "/api/eln/protocols/",
            {"name": "Logged Protocol", "items": VALID_ITEMS},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "eln.protocol.created")
        self.assertEqual(kwargs["target_type"], "eln.protocol")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.user)

    def test_update_protocol_logs_action(self):
        protocol = Protocol.objects.create(name="Old", items=VALID_ITEMS)
        response = self.client.put(
            f"/api/eln/protocols/{protocol.id}/",
            {"name": "New", "items": VALID_ITEMS},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "eln.protocol.edited")
        self.assertEqual(kwargs["target_type"], "eln.protocol")
        self.assertEqual(kwargs["target_id"], protocol.id)

    def test_partial_update_protocol_logs_action(self):
        protocol = Protocol.objects.create(name="PatchMe", items=VALID_ITEMS)
        response = self.client.patch(
            f"/api/eln/protocols/{protocol.id}/",
            {"name": "Renamed"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "eln.protocol.edited")

    def test_soft_delete_protocol_logs_action(self):
        protocol = Protocol.objects.create(name="Temporary", items=VALID_ITEMS)
        response = self.client.delete(f"/api/eln/protocols/{protocol.id}/")
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "eln.protocol.deleted")
        self.assertEqual(kwargs["target_type"], "eln.protocol")
        self.assertEqual(kwargs["target_id"], protocol.id)

    def test_create_protocol_captures_client_ip(self):
        self.client.post(
            "/api/eln/protocols/",
            {"name": "IP Test", "items": VALID_ITEMS},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")

    def test_get_does_not_log(self):
        Protocol.objects.create(name="ReadOnly", items=VALID_ITEMS)
        self.client.get("/api/eln/protocols/")
        self.mock_log.assert_not_called()
