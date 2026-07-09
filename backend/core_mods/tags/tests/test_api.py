"""
Tests for the Tags API endpoints.

All tests exercise the API through HTTP calls using DRF's APIClient.
"""
from core.tests.base import BaseTestCase
from core_mods.tags.models import Tag


class TagsApiTests(BaseTestCase):
    def setUp(self):
        super().setUp()
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
