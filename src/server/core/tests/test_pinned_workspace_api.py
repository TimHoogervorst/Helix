"""
Tests for the PinnedWorkspace API endpoints.

GET    /api/core/tabs/       — list current user's pins
POST   /api/core/tabs/       — create a pin
DELETE /api/core/tabs/{id}/  — delete a pin
"""
from unittest.mock import patch

from core.tests.base import BaseTestCase

MIXIN_LOG_ACTION_PATH = "helix_core.actions.mixins.log_action"


def _log_kwargs(mock):
    """Return the keyword-args dict from the *first* call to *mock*."""
    if mock.call_count == 0:
        return {}
    return mock.call_args[1]


class PinnedWorkspaceApiTests(BaseTestCase):
    """CRUD tests for the tabs API, scoped to the authenticated user."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    # ── GET (list) ───────────────────────────────────────────────────────

    def test_list_empty(self):
        """GET /api/core/tabs/ returns empty list for a user with no tabs."""
        response = self.client.get("/api/core/tabs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_list_only_own_pins(self):
        """GET /api/core/tabs/ returns only the authenticated user's tabs."""
        from core.models import User

        # Create a pin for the current user
        self.client.post(
            "/api/core/tabs/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )

        # Create a pin for another user
        other_user = User.objects.create_user(username="other", password="testpass123")
        from mods.tabs.models import PinnedWorkspace

        PinnedWorkspace.objects.create(
            user=other_user,
            display_id="E12",
            label="Other Entry",
            url="/eln/E12",
        )

        response = self.client.get("/api/core/tabs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["display_id"], "BLOOD1")
        self.assertEqual(response.data[0]["url"], "/lims/BLOOD1")

    # ── POST (create) ────────────────────────────────────────────────────

    def test_create_pin(self):
        """POST /api/core/tabs/ creates a tab and returns it with id, created_at."""
        response = self.client.post(
            "/api/core/tabs/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIn("id", response.data)
        self.assertIn("created_at", response.data)
        self.assertEqual(response.data["display_id"], "BLOOD1")
        self.assertEqual(response.data["label"], "Blood Sample #1")
        self.assertEqual(response.data["url"], "/lims/BLOOD1")

    def test_create_duplicate_url(self):
        """POST /api/core/tabs/ with duplicate (user, url) returns 400."""
        self.client.post(
            "/api/core/tabs/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        response = self.client.post(
            "/api/core/tabs/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_create_different_url_same_user(self):
        """A user can pin two different URLs without conflict."""
        self.client.post(
            "/api/core/tabs/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        response = self.client.post(
            "/api/core/tabs/",
            {"display_id": "E12", "label": "Entry 12", "url": "/eln/E12"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)

    # ── DELETE ───────────────────────────────────────────────────────────

    def test_delete_own_pin(self):
        """DELETE /api/core/tabs/{id}/ removes the tab."""
        create_response = self.client.post(
            "/api/core/tabs/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        pin_id = create_response.data["id"]

        response = self.client.delete(f"/api/core/tabs/{pin_id}/")
        self.assertEqual(response.status_code, 204)

        # Verify it's gone
        list_response = self.client.get("/api/core/tabs/")
        self.assertEqual(list_response.data, [])

    def test_delete_other_user_pin_returns_404(self):
        """DELETE /api/core/tabs/{id}/ for another user's tab returns 404."""
        from core.models import User
        from mods.tabs.models import PinnedWorkspace

        other_user = User.objects.create_user(username="other", password="testpass123")
        other_pin = PinnedWorkspace.objects.create(
            user=other_user,
            display_id="E12",
            label="Other Entry",
            url="/eln/E12",
        )

        response = self.client.delete(f"/api/core/tabs/{other_pin.id}/")
        self.assertEqual(response.status_code, 404)


class TabsActionLoggingTests(BaseTestCase):
    """Test that tab/untab operations log actions via ActionLoggingMixin."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_create_pin_logs_action(self):
        response = self.client.post(
            "/api/core/tabs/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.tab.created")
        self.assertEqual(kwargs["target_type"], "core.tab")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.user)

    def test_delete_pin_logs_action(self):
        create_response = self.client.post(
            "/api/core/tabs/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        pin_id = create_response.data["id"]
        # Reset mock to ignore the create call
        self.mock_log.reset_mock()

        response = self.client.delete(f"/api/core/tabs/{pin_id}/")
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "core.tab.deleted")
        self.assertEqual(kwargs["target_type"], "core.tab")
        self.assertEqual(kwargs["target_id"], pin_id)

    def test_create_pin_captures_client_ip(self):
        self.client.post(
            "/api/core/tabs/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")

    def test_get_does_not_log(self):
        self.client.get("/api/core/tabs/")
        self.mock_log.assert_not_called()


class TabFoldersAndLayoutApiTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def _create_tab(self, display_id):
        response = self.client.post(
            "/api/core/tabs/",
            {
                "display_id": display_id,
                "label": display_id,
                "url": f"/lims/{display_id}",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        return response.data

    def test_new_pins_are_inserted_at_root_top(self):
        first = self._create_tab("A1")
        second = self._create_tab("B2")

        response = self.client.get("/api/core/tabs/")

        self.assertEqual([item["id"] for item in response.data], [second["id"], first["id"]])
        self.assertEqual([item["order"] for item in response.data], [0, 1])

    def test_folder_crud_and_cascade_delete(self):
        folder_response = self.client.post(
            "/api/core/tabs/folders/", {"name": "Samples"}, format="json"
        )
        self.assertEqual(folder_response.status_code, 201)
        folder_id = folder_response.data["id"]
        tab = self._create_tab("A1")

        from mods.tabs.models import PinnedWorkspace

        PinnedWorkspace.objects.filter(pk=tab["id"]).update(folder_id=folder_id)
        response = self.client.delete(f"/api/core/tabs/folders/{folder_id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(PinnedWorkspace.objects.filter(pk=tab["id"]).exists())

    def test_folder_isolation(self):
        from core.models import User
        from mods.tabs.models import TabFolder

        other_user = User.objects.create_user(username="other", password="testpass123")
        folder = TabFolder.objects.create(user=other_user, name="Other")

        response = self.client.get("/api/core/tabs/folders/")
        self.assertEqual(response.data, [])
        response = self.client.delete(f"/api/core/tabs/folders/{folder.id}/")
        self.assertEqual(response.status_code, 404)

    def test_layout_save_orders_and_moves_tabs_idempotently(self):
        first = self._create_tab("A1")
        second = self._create_tab("B2")
        folder_response = self.client.post(
            "/api/core/tabs/folders/", {"name": "Samples"}, format="json"
        )
        folder_id = folder_response.data["id"]
        layout = {
            "folders": [{"id": folder_id, "order": 0, "expanded": False, "tab_ids": [first["id"]]}],
            "tabs": [
                {"id": first["id"], "order": 0, "folder": folder_id},
                {"id": second["id"], "order": 0, "folder": None},
            ],
        }

        response = self.client.put("/api/core/tabs/layout/", layout, format="json")
        self.assertEqual(response.status_code, 200)
        response = self.client.put("/api/core/tabs/layout/", layout, format="json")
        self.assertEqual(response.status_code, 200)

        tabs = {item["id"]: item for item in self.client.get("/api/core/tabs/").data}
        self.assertEqual(tabs[first["id"]]["folder"], folder_id)
        self.assertFalse(tabs[first["id"]]["folder_expanded"])
        self.assertIsNone(tabs[second["id"]]["folder"])


class TabFolderActionLoggingTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_folder_lifecycle_is_logged_and_layout_is_not(self):
        response = self.client.post(
            "/api/core/tabs/folders/", {"name": "Samples"}, format="json"
        )
        self.assertEqual(_log_kwargs(self.mock_log)["action"], "core.tab_folder.created")
        folder_id = response.data["id"]

        self.mock_log.reset_mock()
        response = self.client.patch(
            f"/api/core/tabs/folders/{folder_id}/", {"name": "Renamed"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(_log_kwargs(self.mock_log)["action"], "core.tab_folder.edited")

        self.mock_log.reset_mock()
        response = self.client.put(
            "/api/core/tabs/layout/",
            {"folders": [{"id": folder_id, "order": 0, "expanded": True, "tab_ids": []}], "tabs": []},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_not_called()

        self.mock_log.reset_mock()
        response = self.client.delete(f"/api/core/tabs/folders/{folder_id}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(_log_kwargs(self.mock_log)["action"], "core.tab_folder.deleted")
