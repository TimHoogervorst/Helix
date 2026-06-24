"""
Tests for the references API endpoints.

POST /api/references/resolve/   — batch-resolve display IDs
GET  /api/references/search/    — search by display_id prefix
"""
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Folder, User
from eln.models import NotebookEntry


EMPTY_DOC = {"type": "doc", "content": [{"type": "paragraph"}]}


class ResolveApiTests(TestCase):
    """POST /api/references/resolve/"""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.folder = Folder.objects.create(name="Default")

    def test_resolve_valid_ids(self):
        """Valid display IDs resolve to target details."""
        e1 = NotebookEntry.objects.create(
            title="PCR Protocol", content=EMPTY_DOC, folder=self.folder, author=self.user
        )
        e2 = NotebookEntry.objects.create(
            title="Gel Results", content=EMPTY_DOC, folder=self.folder, author=self.user
        )

        response = self.client.post(
            "/api/references/resolve/",
            {"ids": [e1.display_id, e2.display_id]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(e1.display_id, response.data)
        self.assertEqual(response.data[e1.display_id]["id"], e1.id)
        self.assertEqual(response.data[e1.display_id]["display_id"], e1.display_id)
        self.assertEqual(response.data[e1.display_id]["title"], "PCR Protocol")
        self.assertEqual(response.data[e1.display_id]["type"], "entry")

        self.assertIn(e2.display_id, response.data)
        self.assertEqual(response.data[e2.display_id]["title"], "Gel Results")

    def test_resolve_invalid_id_returns_null(self):
        """An ID that doesn't match any entry returns null."""
        response = self.client.post(
            "/api/references/resolve/",
            {"ids": ["E99999"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"E99999": None})

    def test_resolve_mixed_ids(self):
        """Mix of valid and invalid IDs — each gets its own result."""
        e1 = NotebookEntry.objects.create(
            title="PCR Protocol", content=EMPTY_DOC, folder=self.folder, author=self.user
        )

        response = self.client.post(
            "/api/references/resolve/",
            {"ids": [e1.display_id, "E99999"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data[e1.display_id])
        self.assertIsNone(response.data["E99999"])

    def test_resolve_empty_ids(self):
        """Empty list returns empty object."""
        response = self.client.post(
            "/api/references/resolve/",
            {"ids": []},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {})

    def test_resolve_unknown_prefix(self):
        """IDs with unknown prefixes (like X1) resolve to null."""
        response = self.client.post(
            "/api/references/resolve/",
            {"ids": ["X1"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"X1": None})


class SearchApiTests(TestCase):
    """GET /api/references/search/?q=..."""

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.folder = Folder.objects.create(name="Default")

        self.e1 = NotebookEntry.objects.create(
            title="PCR Protocol", content=EMPTY_DOC, folder=self.folder, author=self.user
        )
        self.e2 = NotebookEntry.objects.create(
            title="Gel Results", content=EMPTY_DOC, folder=self.folder, author=self.user
        )

    def test_search_returns_matching_entries(self):
        """Search by display_id prefix returns matching entries."""
        response = self.client.get(f"/api/references/search/?q={self.e1.display_id}")

        self.assertEqual(response.status_code, 200)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["display_id"], self.e1.display_id)
        self.assertEqual(results[0]["title"], "PCR Protocol")
        self.assertEqual(results[0]["type"], "entry")

    def test_search_no_matches(self):
        """A query matching nothing returns empty results."""
        response = self.client.get("/api/references/search/?q=Z999")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_search_empty_query(self):
        """Empty query returns empty results (not an error)."""
        response = self.client.get("/api/references/search/?q=")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_search_case_insensitive(self):
        """Prefix matching is case-insensitive ('e1' matches 'E1')."""
        response = self.client.get(f"/api/references/search/?q=e1")

        self.assertEqual(response.status_code, 200)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["display_id"], self.e1.display_id)
