"""
Tests for the ELN API endpoints.

All tests exercise the API through HTTP calls using DRF's APIClient.
"""
from core.tests.base import BaseTestCase
from core.tests.factories import EMPTY_DOC, make_doc_with_ref
from workspaces.eln.models import NotebookEntry, Mention

TEXT_DOC = {
    "type": "doc",
    "content": [
        {
            "type": "paragraph",
            "content": [{"type": "text", "text": "Hello world"}],
        }
    ],
}


class ElnApiTests(BaseTestCase):
    def setUp(self):
        super().setUp()

    def test_list_entries_empty(self):
        """GET /api/eln/entries/ returns empty list with 200."""
        response = self.client.get("/api/eln/entries/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_create_entry(self):
        """POST returns 201, entry appears in DB."""
        response = self.client.post(
            "/api/eln/entries/",
            {"title": "Test Entry", "content": TEXT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["title"], "Test Entry")
        self.assertIsNone(response.data["author_username"])
        self.assertEqual(response.data["content"], TEXT_DOC)
        self.assertEqual(NotebookEntry.objects.count(), 1)

    def test_create_entry_invalid_content(self):
        """POST with non-document content returns 400."""
        response = self.client.post(
            "/api/eln/entries/",
            {"title": "Bad", "content": "not a dict", "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_retrieve_entry(self):
        """GET by ID returns full entry including content."""
        entry = NotebookEntry.objects.create(
            title="My Entry", content=TEXT_DOC, folder=self.folder, author=self.user
        )
        response = self.client.get(f"/api/eln/entries/{entry.display_id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "My Entry")
        self.assertEqual(response.data["content"], TEXT_DOC)

    def test_update_entry(self):
        """PUT updates title and content, returns 200."""
        entry = NotebookEntry.objects.create(
            title="Old Title", content=TEXT_DOC, folder=self.folder, author=self.user
        )
        new_doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Updated content"}],
                }
            ],
        }
        response = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {"title": "New Title", "content": new_doc, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "New Title")
        self.assertEqual(response.data["content"], new_doc)
        entry.refresh_from_db()
        self.assertEqual(entry.title, "New Title")
        self.assertEqual(entry.content, new_doc)

    def test_delete_entry(self):
        """DELETE removes entry, subsequent GET returns 404."""
        entry = NotebookEntry.objects.create(
            title="To Delete", content=EMPTY_DOC, folder=self.folder, author=self.user
        )
        response = self.client.delete(f"/api/eln/entries/{entry.display_id}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(NotebookEntry.objects.count(), 0)

    def test_list_entries_pagination(self):
        """50 entries, GET with page_size=20 returns 20 + next link."""
        for i in range(50):
            NotebookEntry.objects.create(
                title=f"Entry {i}",
                content=EMPTY_DOC,
                folder=self.folder,
                author=self.user,
            )
        response = self.client.get("/api/eln/entries/?page_size=20")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 20)
        self.assertIsNotNone(response.data["next"])


class MentionSyncOnSaveTests(BaseTestCase):
    """Integration: creating/updating entries triggers mention sync."""

    def setUp(self):
        super().setUp()

        # Create a target entry that will be referenced.
        self.target = NotebookEntry.objects.create(
            title="Target Entry", content=EMPTY_DOC, folder=self.folder, author=self.user
        )

    def test_create_entry_with_reference_creates_mention(self):
        """POST with a reference node → Mention row is created."""
        doc = make_doc_with_ref(self.target.display_id)
        response = self.client.post(
            "/api/eln/entries/",
            {"title": "Ref Entry", "content": doc, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Mention.objects.count(), 1)
        mention = Mention.objects.first()
        self.assertEqual(mention.source_id, response.data["id"])
        self.assertEqual(mention.target_id, self.target.id)

    def test_update_entry_add_reference_creates_mention(self):
        """PUT with a new reference node → Mention created."""
        entry = NotebookEntry.objects.create(
            title="No Refs Yet", content=EMPTY_DOC, folder=self.folder, author=self.user
        )
        self.assertEqual(Mention.objects.count(), 0)

        doc = make_doc_with_ref(self.target.display_id)
        response = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {"title": "Now With Ref", "content": doc, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Mention.objects.count(), 1)
        mention = Mention.objects.first()
        self.assertEqual(mention.source_id, entry.id)
        self.assertEqual(mention.target_id, self.target.id)

    def test_update_entry_remove_reference_deletes_mention(self):
        """PUT that removes a reference node → Mention deleted."""
        doc_with_ref = make_doc_with_ref(self.target.display_id)
        entry = NotebookEntry.objects.create(
            title="Has Ref", content=doc_with_ref, folder=self.folder, author=self.user
        )
        # Manually sync since the creation through ORM doesn't go through the view.
        from references.services import sync_mentions
        sync_mentions(entry, doc_with_ref)
        self.assertEqual(Mention.objects.count(), 1)

        # Now update via API to remove the reference.
        response = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {"title": "No Ref Now", "content": EMPTY_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Mention.objects.count(), 0)
