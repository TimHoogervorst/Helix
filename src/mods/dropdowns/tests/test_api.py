"""
Tests for the Dropdowns API endpoints.

All tests exercise the API through HTTP calls using DRF's APIClient.
"""
from unittest.mock import patch

from core.tests.base import BaseTestCase
from mods.dropdowns.models import Dropdown
from mods.access.models import Organization, OrganizationMembership, OrganizationRole

MIXIN_LOG_ACTION_PATH = "helix_core.actions.mixins.log_action"


def _log_kwargs(mock):
    """Return the keyword-args dict from the *first* call to *mock*."""
    if mock.call_count == 0:
        return {}
    return mock.call_args[1]


def _make_admin(user):
    """Make *user* an organization admin and return it."""
    user.is_staff = True
    user.save(update_fields=["is_staff"])
    org = Organization.objects.create(name="Test Lab")
    OrganizationMembership.objects.update_or_create(
        user=user,
        defaults={"organization": org, "role": OrganizationRole.ADMIN},
    )
    return user


class DropdownsApiTests(BaseTestCase):
    """Tests for the Dropdown CRUD endpoints."""

    def setUp(self):
        super().setUp()
        _make_admin(self.user)
        self.client.force_authenticate(user=self.user)

    # ── List ────────────────────────────────────────────────────────────

    def test_list_dropdowns_empty(self):
        """GET /api/dropdowns/ returns empty list with 200."""
        response = self.client.get("/api/dropdowns/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_list_dropdowns_populated(self):
        """GET /api/dropdowns/ returns all dropdowns."""
        Dropdown.objects.create(name="Priority", options=["High", "Medium", "Low"])
        Dropdown.objects.create(name="Department", options=["Biology", "Chemistry"])
        response = self.client.get("/api/dropdowns/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 2)
        names = [d["name"] for d in response.data["results"]]
        self.assertIn("Priority", names)
        self.assertIn("Department", names)

    # ── Create ──────────────────────────────────────────────────────────

    def test_create_dropdown(self):
        """POST /api/dropdowns/ creates a dropdown and returns it."""
        response = self.client.post(
            "/api/dropdowns/",
            {"name": "NewDropdown", "options": ["A", "B", "C"]},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "NewDropdown")
        self.assertEqual(response.data["options"], ["A", "B", "C"])
        self.assertIsNotNone(response.data["id"])
        self.assertEqual(Dropdown.objects.count(), 1)

    def test_create_dropdown_empty_options(self):
        """POST with empty options is valid."""
        response = self.client.post(
            "/api/dropdowns/",
            {"name": "EmptyOptions", "options": []},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["options"], [])

    def test_create_dropdown_duplicate_name(self):
        """POST with duplicate name returns 400."""
        Dropdown.objects.create(name="Unique", options=["One"])
        response = self.client.post(
            "/api/dropdowns/",
            {"name": "Unique", "options": ["Two"]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    # ── Retrieve ────────────────────────────────────────────────────────

    def test_retrieve_dropdown(self):
        """GET /api/dropdowns/{id}/ returns a single dropdown."""
        dd = Dropdown.objects.create(name="Single", options=["X", "Y"])
        response = self.client.get(f"/api/dropdowns/{dd.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Single")
        self.assertEqual(response.data["options"], ["X", "Y"])

    # ── Update ──────────────────────────────────────────────────────────

    def test_update_dropdown(self):
        """PUT replaces name and options."""
        dd = Dropdown.objects.create(name="Before", options=["Old"])
        response = self.client.put(
            f"/api/dropdowns/{dd.id}/",
            {"name": "After", "options": ["New", "Options"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "After")
        self.assertEqual(response.data["options"], ["New", "Options"])
        dd.refresh_from_db()
        self.assertEqual(dd.name, "After")
        self.assertEqual(dd.options, ["New", "Options"])

    def test_partial_update_dropdown_name(self):
        """PATCH updates only the name."""
        dd = Dropdown.objects.create(name="OldName", options=["A", "B"])
        response = self.client.patch(
            f"/api/dropdowns/{dd.id}/",
            {"name": "NewName"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "NewName")
        self.assertEqual(response.data["options"], ["A", "B"])
        dd.refresh_from_db()
        self.assertEqual(dd.name, "NewName")

    def test_partial_update_dropdown_options(self):
        """PATCH updates only options."""
        dd = Dropdown.objects.create(name="Keep", options=["A"])
        response = self.client.patch(
            f"/api/dropdowns/{dd.id}/",
            {"options": ["A", "B", "C"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Keep")
        self.assertEqual(response.data["options"], ["A", "B", "C"])

    # ── Delete ──────────────────────────────────────────────────────────

    def test_delete_dropdown(self):
        """DELETE removes the dropdown and returns 204."""
        dd = Dropdown.objects.create(name="Deletable", options=["One"])
        response = self.client.delete(f"/api/dropdowns/{dd.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Dropdown.objects.count(), 0)

    def test_delete_nonexistent_dropdown(self):
        """DELETE on nonexistent dropdown returns 404."""
        response = self.client.delete("/api/dropdowns/99999/")
        self.assertEqual(response.status_code, 404)


class DropdownsAuthTests(BaseTestCase):
    """Tests for authentication and permission gating."""

    def test_unauthenticated_rejected(self):
        """Unauthenticated requests return 403."""
        response = self.client.get("/api/dropdowns/")
        self.assertEqual(response.status_code, 403)

    def test_non_admin_can_read(self):
        """Authenticated non-admin users can list and retrieve."""
        self.client.force_authenticate(user=self.user)
        Dropdown.objects.create(name="Visible", options=["One"])
        response = self.client.get("/api/dropdowns/")
        self.assertEqual(response.status_code, 200)

    def test_non_admin_cannot_create(self):
        """Authenticated non-admin users cannot create dropdowns."""
        self.client.force_authenticate(user=self.user)
        response = self.client.post(
            "/api/dropdowns/",
            {"name": "Nope", "options": ["A"]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_non_admin_cannot_update(self):
        """Authenticated non-admin users cannot update dropdowns."""
        self.client.force_authenticate(user=self.user)
        dd = Dropdown.objects.create(name="Protected", options=["A"])
        response = self.client.put(
            f"/api/dropdowns/{dd.id}/",
            {"name": "Hacked", "options": ["B"]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_non_admin_cannot_delete(self):
        """Authenticated non-admin users cannot delete dropdowns."""
        self.client.force_authenticate(user=self.user)
        dd = Dropdown.objects.create(name="Protected", options=["A"])
        response = self.client.delete(f"/api/dropdowns/{dd.id}/")
        self.assertEqual(response.status_code, 403)


class DropdownsActionLoggingTests(BaseTestCase):
    """Test that dropdown CRUD operations log actions."""

    def setUp(self):
        super().setUp()
        _make_admin(self.user)
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_create_dropdown_logs_action(self):
        response = self.client.post(
            "/api/dropdowns/",
            {"name": "LoggedCreate", "options": ["A"]},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "dropdowns.dropdown.created")
        self.assertEqual(kwargs["target_type"], "dropdowns.dropdown")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.user)

    def test_update_dropdown_logs_action(self):
        dd = Dropdown.objects.create(name="Before", options=["Old"])
        response = self.client.put(
            f"/api/dropdowns/{dd.id}/",
            {"name": "After", "options": ["New"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "dropdowns.dropdown.edited")

    def test_partial_update_dropdown_logs_action(self):
        dd = Dropdown.objects.create(name="PatchMe", options=["A"])
        response = self.client.patch(
            f"/api/dropdowns/{dd.id}/",
            {"options": ["A", "B"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "dropdowns.dropdown.edited")

    def test_delete_dropdown_logs_action(self):
        dd = Dropdown.objects.create(name="DeleteMe", options=["A"])
        response = self.client.delete(f"/api/dropdowns/{dd.id}/")
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "dropdowns.dropdown.deleted")
        self.assertEqual(kwargs["target_type"], "dropdowns.dropdown")
        self.assertEqual(kwargs["target_id"], dd.id)

    def test_get_does_not_log(self):
        Dropdown.objects.create(name="ReadOnly", options=["A"])
        self.client.get("/api/dropdowns/")
        self.mock_log.assert_not_called()
