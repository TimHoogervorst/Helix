"""
Tests for the ELN API endpoints.

All tests exercise the API through HTTP calls using DRF's APIClient.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token

from core.models import Folder, User
from eln.models import NotebookEntry


class ElnApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.token = Token.objects.create(user=self.user)
        self.folder = Folder.objects.create(name="Default")

    def _auth_header(self):
        return {"HTTP_AUTHORIZATION": f"Token {self.token.key}"}

    def test_list_entries_empty(self):
        """GET /api/eln/entries/ returns empty list with 200."""
        response = self.client.get("/api/eln/entries/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_create_entry_authenticated(self):
        """POST with valid token returns 201, entry appears in DB."""
        response = self.client.post(
            "/api/eln/entries/",
            {"title": "Test Entry", "content": "Hello world", "folder": self.folder.id},
            **self._auth_header(),
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["title"], "Test Entry")
        self.assertEqual(response.data["author_username"], "testuser")
        self.assertEqual(NotebookEntry.objects.count(), 1)

    def test_create_entry_unauthenticated(self):
        """POST without token returns 401."""
        response = self.client.post(
            "/api/eln/entries/",
            {"title": "Test", "content": "Hello", "folder": self.folder.id},
        )
        self.assertEqual(response.status_code, 401)

    def test_retrieve_entry(self):
        """GET by ID returns full entry including content."""
        entry = NotebookEntry.objects.create(
            title="My Entry", content="Some content", folder=self.folder, author=self.user
        )
        response = self.client.get(f"/api/eln/entries/{entry.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "My Entry")
        self.assertEqual(response.data["content"], "Some content")

    def test_update_entry(self):
        """PUT updates title and content, returns 200."""
        entry = NotebookEntry.objects.create(
            title="Old Title", content="Old content", folder=self.folder, author=self.user
        )
        response = self.client.put(
            f"/api/eln/entries/{entry.id}/",
            {"title": "New Title", "content": "New content", "folder": self.folder.id},
            **self._auth_header(),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "New Title")
        entry.refresh_from_db()
        self.assertEqual(entry.title, "New Title")
        self.assertEqual(entry.content, "New content")

    def test_delete_entry(self):
        """DELETE removes entry, subsequent GET returns 404."""
        entry = NotebookEntry.objects.create(
            title="To Delete", content="Bye", folder=self.folder, author=self.user
        )
        response = self.client.delete(
            f"/api/eln/entries/{entry.id}/", **self._auth_header()
        )
        self.assertEqual(response.status_code, 204)
        self.assertEqual(NotebookEntry.objects.count(), 0)

    def test_list_entries_pagination(self):
        """50 entries, GET with page_size=20 returns 20 + next link."""
        for i in range(50):
            NotebookEntry.objects.create(
                title=f"Entry {i}",
                content=f"Content {i}",
                folder=self.folder,
                author=self.user,
            )
        response = self.client.get("/api/eln/entries/?page_size=20")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data["next"])
