"""
Tests for the PinnedWorkspace API endpoints.

GET    /api/core/pins/       — list current user's pins
POST   /api/core/pins/       — create a pin
DELETE /api/core/pins/{id}/  — delete a pin
"""
from core.tests.base import BaseTestCase


class PinnedWorkspaceApiTests(BaseTestCase):
    """CRUD tests for the pins API, scoped to the authenticated user."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    # ── GET (list) ───────────────────────────────────────────────────────

    def test_list_empty(self):
        """GET /api/core/pins/ returns empty list for a user with no pins."""
        response = self.client.get("/api/core/pins/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_list_only_own_pins(self):
        """GET /api/core/pins/ returns only the authenticated user's pins."""
        from core.models import User

        # Create a pin for the current user
        self.client.post(
            "/api/core/pins/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )

        # Create a pin for another user
        other_user = User.objects.create_user(username="other", password="testpass123")
        from core.models import PinnedWorkspace

        PinnedWorkspace.objects.create(
            user=other_user,
            display_id="E12",
            label="Other Entry",
            url="/eln/E12",
        )

        response = self.client.get("/api/core/pins/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["display_id"], "BLOOD1")
        self.assertEqual(response.data[0]["url"], "/lims/BLOOD1")

    # ── POST (create) ────────────────────────────────────────────────────

    def test_create_pin(self):
        """POST /api/core/pins/ creates a pin and returns it with id, created_at."""
        response = self.client.post(
            "/api/core/pins/",
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
        """POST /api/core/pins/ with duplicate (user, url) returns 400."""
        self.client.post(
            "/api/core/pins/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        response = self.client.post(
            "/api/core/pins/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_create_different_url_same_user(self):
        """A user can pin two different URLs without conflict."""
        self.client.post(
            "/api/core/pins/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        response = self.client.post(
            "/api/core/pins/",
            {"display_id": "E12", "label": "Entry 12", "url": "/eln/E12"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)

    # ── DELETE ───────────────────────────────────────────────────────────

    def test_delete_own_pin(self):
        """DELETE /api/core/pins/{id}/ removes the pin."""
        create_response = self.client.post(
            "/api/core/pins/",
            {"display_id": "BLOOD1", "label": "Blood Sample #1", "url": "/lims/BLOOD1"},
            format="json",
        )
        pin_id = create_response.data["id"]

        response = self.client.delete(f"/api/core/pins/{pin_id}/")
        self.assertEqual(response.status_code, 204)

        # Verify it's gone
        list_response = self.client.get("/api/core/pins/")
        self.assertEqual(list_response.data, [])

    def test_delete_other_user_pin_returns_404(self):
        """DELETE /api/core/pins/{id}/ for another user's pin returns 404."""
        from core.models import User, PinnedWorkspace

        other_user = User.objects.create_user(username="other", password="testpass123")
        other_pin = PinnedWorkspace.objects.create(
            user=other_user,
            display_id="E12",
            label="Other Entry",
            url="/eln/E12",
        )

        response = self.client.delete(f"/api/core/pins/{other_pin.id}/")
        self.assertEqual(response.status_code, 404)
