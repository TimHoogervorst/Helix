"""
Tests for the Tags API endpoints.

All tests exercise the API through HTTP calls using DRF's APIClient.
"""
from unittest.mock import patch

from core.tests.base import BaseTestCase
from core.models import User
from mods.access.models import Organization, OrganizationMembership, OrganizationRole
from mods.tags.models import Tag

MIXIN_LOG_ACTION_PATH = "helix_core.actions.mixins.log_action"


def _log_kwargs(mock):
    """Return the keyword-args dict from the *first* call to *mock*."""
    if mock.call_count == 0:
        return {}
    return mock.call_args[1]


class TagsApiTests(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.organization = Organization.objects.create(name="Tags Test Organization")
        OrganizationMembership.objects.update_or_create(
            user=self.user,
            defaults={
                "organization": self.organization,
                "role": OrganizationRole.ADMIN,
            },
        )
        self.non_admin = User.objects.create_user(
            username="tags-ordinary-user", password="testpass123"
        )
        OrganizationMembership.objects.update_or_create(
            user=self.non_admin,
            defaults={
                "organization": self.organization,
                "role": OrganizationRole.USER,
            },
        )
        self.client.force_authenticate(user=self.user)

    # ── List ──────────────────────────────────────────────────────────────

    def test_list_tags_empty(self):
        """GET /api/tags/ returns empty list with 200."""
        response = self.client.get("/api/tags/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_list_tags_populated(self):
        """GET /api/tags/ returns all tags."""
        Tag.objects.create(name="CRISPR", color="enzyme", icon="dna")
        Tag.objects.create(name="PCR", color="flask", icon="circle")
        response = self.client.get("/api/tags/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 2)
        names = [t["name"] for t in response.data["results"]]
        self.assertIn("CRISPR", names)
        self.assertIn("PCR", names)

    # ── Search ─────────────────────────────────────────────────────────────

    def test_search_by_name(self):
        """GET /api/tags/?q=... returns matching tags (case-insensitive)."""
        Tag.objects.create(name="CRISPR", color="enzyme", icon="dna")
        Tag.objects.create(name="PCR", color="flask", icon="circle")
        Tag.objects.create(name="crispr-cas9", color="solvent", icon="leaf")

        response = self.client.get("/api/tags/?q=crispr")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 2)

    def test_search_no_match(self):
        """GET /api/tags/?q=... returns empty when no tags match."""
        Tag.objects.create(name="CRISPR", color="enzyme", icon="dna")
        response = self.client.get("/api/tags/?q=nonexistent")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    # ── Create ─────────────────────────────────────────────────────────────

    def test_create_tag(self):
        """POST /api/tags/ creates a tag and returns it with an id."""
        response = self.client.post(
            "/api/tags/",
            {"name": "NewTag", "color": "enzyme", "icon": "dna"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "NewTag")
        self.assertEqual(response.data["color"], "enzyme")
        self.assertEqual(response.data["icon"], "dna")
        self.assertIsNotNone(response.data["id"])
        self.assertEqual(Tag.objects.count(), 1)

    def test_create_tag_defaults_icon_to_circle(self):
        """POST without icon defaults to 'circle'."""
        response = self.client.post(
            "/api/tags/",
            {"name": "SimpleTag", "color": "muted"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["icon"], "circle")

    def test_create_tag_duplicate_name(self):
        """POST with duplicate name returns 400."""
        Tag.objects.create(name="Unique", color="enzyme", icon="circle")
        response = self.client.post(
            "/api/tags/",
            {"name": "Unique", "color": "flask", "icon": "dna"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    # ── Update ─────────────────────────────────────────────────────────────

    def test_update_tag_color(self):
        """PATCH updates a tag's color."""
        tag = Tag.objects.create(name="Updatable", color="enzyme", icon="circle")
        response = self.client.patch(
            f"/api/tags/{tag.id}/",
            {"color": "flask"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["color"], "flask")
        self.assertEqual(response.data["name"], "Updatable")
        tag.refresh_from_db()
        self.assertEqual(tag.color, "flask")

    def test_admin_can_rename_tag(self):
        tag = Tag.objects.create(name="Before", color="enzyme", icon="circle")
        response = self.client.patch(
            f"/api/tags/{tag.id}/", {"name": "After"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "After")

    def test_update_tag_icon(self):
        """PATCH updates a tag's icon."""
        tag = Tag.objects.create(name="Updatable", color="enzyme", icon="circle")
        response = self.client.patch(
            f"/api/tags/{tag.id}/",
            {"icon": "dna"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["icon"], "dna")
        tag.refresh_from_db()
        self.assertEqual(tag.icon, "dna")

    def test_update_tag_both_fields(self):
        """PATCH updates both color and icon."""
        tag = Tag.objects.create(name="Updatable", color="enzyme", icon="circle")
        response = self.client.patch(
            f"/api/tags/{tag.id}/",
            {"color": "flask", "icon": "dna"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["color"], "flask")
        self.assertEqual(response.data["icon"], "dna")

    # ── Delete ─────────────────────────────────────────────────────────────

    def test_delete_tag(self):
        """DELETE removes the tag and returns 204."""
        tag = Tag.objects.create(name="Deletable", color="enzyme", icon="circle")
        response = self.client.delete(f"/api/tags/{tag.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Tag.objects.count(), 0)

    def test_delete_nonexistent_tag(self):
        """DELETE on nonexistent tag returns 404."""
        response = self.client.delete("/api/tags/99999/")
        self.assertEqual(response.status_code, 404)

    # ── Auth ───────────────────────────────────────────────────────────────

    def test_unauthenticated_rejected(self):
        """Unauthenticated requests return 403."""
        self.client.logout()
        response = self.client.get("/api/tags/")
        self.assertEqual(response.status_code, 403)

    def test_non_admin_cannot_create_tag(self):
        self.client.force_authenticate(user=self.non_admin)
        response = self.client.post(
            "/api/tags/", {"name": "Blocked", "color": "muted"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_non_admin_cannot_rename_or_recolor_tag(self):
        tag = Tag.objects.create(name="Protected", color="enzyme", icon="circle")
        self.client.force_authenticate(user=self.non_admin)
        response = self.client.patch(
            f"/api/tags/{tag.id}/",
            {"name": "Renamed", "color": "flask"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        tag.refresh_from_db()
        self.assertEqual(tag.name, "Protected")
        self.assertEqual(tag.color, "enzyme")

    def test_non_admin_cannot_delete_tag(self):
        tag = Tag.objects.create(name="Protected", color="enzyme", icon="circle")
        self.client.force_authenticate(user=self.non_admin)
        response = self.client.delete(f"/api/tags/{tag.id}/")
        self.assertEqual(response.status_code, 403)
        self.assertTrue(Tag.objects.filter(id=tag.id).exists())


class TagsActionLoggingTests(BaseTestCase):
    """Test that Tag CRUD operations log actions via ActionLoggingMixin."""

    def setUp(self):
        super().setUp()
        organization = Organization.objects.create(name="Tags Logging Organization")
        OrganizationMembership.objects.update_or_create(
            user=self.user,
            defaults={
                "organization": organization,
                "role": OrganizationRole.ADMIN,
            },
        )
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_create_tag_logs_action(self):
        response = self.client.post(
            "/api/tags/",
            {"name": "ActionLogged", "color": "enzyme", "icon": "dna"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "tags.tag.created")
        self.assertEqual(kwargs["target_type"], "tags.tag")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.user)

    def test_update_tag_logs_action(self):
        tag = Tag.objects.create(name="Before", color="enzyme", icon="circle")
        response = self.client.put(
            f"/api/tags/{tag.id}/",
            {"name": "After", "color": "flask", "icon": "dna"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "tags.tag.edited")
        self.assertEqual(kwargs["target_type"], "tags.tag")
        self.assertEqual(kwargs["target_id"], tag.id)

    def test_partial_update_tag_logs_action(self):
        tag = Tag.objects.create(name="PatchMe", color="enzyme", icon="circle")
        response = self.client.patch(
            f"/api/tags/{tag.id}/",
            {"color": "flask"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "tags.tag.edited")

    def test_delete_tag_logs_action(self):
        tag = Tag.objects.create(name="DeleteMe", color="enzyme", icon="circle")
        response = self.client.delete(f"/api/tags/{tag.id}/")
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action"], "tags.tag.deleted")
        self.assertEqual(kwargs["target_type"], "tags.tag")
        self.assertEqual(kwargs["target_id"], tag.id)

    def test_create_tag_captures_request_id(self):
        self.client.post(
            "/api/tags/",
            {"name": "ReqID", "color": "muted"},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertIsNotNone(kwargs["request_id"])
        self.assertEqual(len(str(kwargs["request_id"])), 36)

    def test_create_tag_captures_client_ip(self):
        self.client.post(
            "/api/tags/",
            {"name": "IP", "color": "muted"},
            format="json",
        )
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["client_ip"], "127.0.0.1")

    def test_get_does_not_log(self):
        Tag.objects.create(name="ReadOnly", color="enzyme", icon="circle")
        self.client.get("/api/tags/")
        self.mock_log.assert_not_called()

    def test_unauthenticated_does_not_log(self):
        self.client.logout()
        response = self.client.post(
            "/api/tags/",
            {"name": "Anon", "color": "muted"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.mock_log.assert_not_called()
