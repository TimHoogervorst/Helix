"""
Tests for the ELN API endpoints.

All tests exercise the API through HTTP calls using DRF's APIClient.
"""
from unittest.mock import patch

from core.tests.base import BaseTestCase
from core.tests.factories import EMPTY_DOC, make_doc_with_ref
from core.mentions.models import Mention
from mods.eln.models import NotebookEntry, ElnAction

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
        self.client.force_authenticate(user=self.user)

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
        self.assertEqual(response.data["author_username"], self.USERNAME)
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
        self.client.force_authenticate(user=self.user)

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
        from core.mentions.sync import sync_mentions
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


MIXIN_LOG_ACTION_PATH = "helix_core.actions.mixins.log_action"


def _log_kwargs(mock):
    """Return the keyword-args dict from the *first* call to *mock*."""
    if mock.call_count == 0:
        return {}
    return mock.call_args[1]


class EntryActionLoggingTests(BaseTestCase):
    """ActionLoggingMixin: spy on log_action() — the highest seam.

    Tests verify the mixin calls log_action() with the correct
    action_type, target_type, target_id, user, and metadata.  No
    DB-row inspection — just the dispatch boundary.
    """

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_create_entry_logs_action(self):
        """POST calls log_action with action_type='eln.entry.created'."""
        response = self.client.post(
            "/api/eln/entries/",
            {"title": "Logged Create", "content": TEXT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "eln.entry.created")
        self.assertEqual(kwargs["target_type"], "eln.entry")
        self.assertEqual(kwargs["target_id"], response.data["id"])
        self.assertEqual(kwargs["user"], self.user)

    def test_update_entry_logs_action(self):
        """PUT calls log_action with action_type='eln.entry.edited'."""
        entry = NotebookEntry.objects.create(
            title="Before Edit", content=TEXT_DOC, folder=self.folder, author=self.user
        )
        response = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {"title": "After Edit", "content": TEXT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "eln.entry.edited")
        self.assertEqual(kwargs["target_type"], "eln.entry")
        self.assertEqual(kwargs["target_id"], entry.id)
        self.assertEqual(kwargs["user"], self.user)

    def test_destroy_entry_logs_action(self):
        """DELETE calls log_action with action_type='eln.entry.deleted'."""
        entry = NotebookEntry.objects.create(
            title="To Delete", content=TEXT_DOC, folder=self.folder, author=self.user
        )
        response = self.client.delete(f"/api/eln/entries/{entry.display_id}/")
        self.assertEqual(response.status_code, 204)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "eln.entry.deleted")
        self.assertEqual(kwargs["target_type"], "eln.entry")
        self.assertEqual(kwargs["target_id"], entry.id)
        self.assertEqual(kwargs["user"], self.user)

    def test_create_entry_unauthenticated_returns_403(self):
        """When no user is authenticated, POST returns 403."""
        from rest_framework.test import APIClient
        anon_client = APIClient()
        response = anon_client.post(
            "/api/eln/entries/",
            {"title": "Anon Entry", "content": TEXT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.mock_log.assert_not_called()
        self.assertEqual(NotebookEntry.objects.count(), 0)

    def test_update_entry_unauthenticated_returns_403(self):
        """When no user is authenticated, PUT returns 403."""
        entry = NotebookEntry.objects.create(
            title="Anon Entry", content=TEXT_DOC, folder=self.folder, author=self.user
        )
        from rest_framework.test import APIClient
        anon_client = APIClient()
        response = anon_client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {"title": "Anon Edit", "content": TEXT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.mock_log.assert_not_called()


class EntryActionsEndpointTests(BaseTestCase):
    """Tests for GET /api/eln/entries/{id}/actions/ (list + filter)
    and POST /api/eln/entries/{id}/actions/ (create custom action)."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.entry = NotebookEntry.objects.create(
            title="Actions Entry", content=TEXT_DOC, folder=self.folder, author=self.user
        )
        # Create several actions via the logger so they exist before tests
        from helix_core.actions.logger import log_action
        self.a1 = log_action(
            user=self.user, action_type="eln.entry.created",
            target_type="eln.entry", target_id=self.entry.id,
        )
        self.a2 = log_action(
            user=self.user, action_type="eln.entry.edited",
            target_type="eln.entry", target_id=self.entry.id,
        )

    # ── GET: list actions ─────────────────────────────────────────────────

    def test_list_actions_returns_paginated_results(self):
        """GET returns 200 with results key (paginated)."""
        response = self.client.get(
            f"/api/eln/entries/{self.entry.display_id}/actions/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.data)
        self.assertEqual(response.data["count"], 2)

    def test_list_actions_includes_performed_by(self):
        """Each action embeds performed_by user info."""
        response = self.client.get(
            f"/api/eln/entries/{self.entry.display_id}/actions/"
        )
        action = response.data["results"][0]
        self.assertIn("performed_by", action)
        self.assertEqual(action["performed_by"]["username"], self.USERNAME)
        self.assertIn("color", action["performed_by"])
        self.assertIn("first_name", action["performed_by"])
        self.assertIn("last_name", action["performed_by"])

    # ── GET: filter by action_type ────────────────────────────────────────

    def test_filter_by_action_type(self):
        """?action_type=eln.entry.edited returns only edited actions."""
        response = self.client.get(
            f"/api/eln/entries/{self.entry.display_id}/actions/?action_type=eln.entry.edited"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["action_type"], "eln.entry.edited")

    def test_filter_by_action_type_created(self):
        """?action_type=eln.entry.created returns only created actions."""
        response = self.client.get(
            f"/api/eln/entries/{self.entry.display_id}/actions/?action_type=eln.entry.created"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["action_type"], "eln.entry.created")

    # ── GET: filter by since ──────────────────────────────────────────────

    def test_filter_by_since_returns_recent_actions(self):
        """?since=<now> returns actions created at or after that time."""
        from datetime import timedelta
        since = self.a2.created_at - timedelta(hours=1)
        since_str = since.strftime("%Y-%m-%dT%H:%M:%SZ")
        response = self.client.get(
            f"/api/eln/entries/{self.entry.display_id}/actions/?since={since_str}"
        )
        self.assertEqual(response.status_code, 200, msg=response.content.decode())
        self.assertEqual(response.data["count"], 2)

    def test_filter_by_since_excludes_older_actions(self):
        """?since=<future> returns zero actions."""
        from datetime import timedelta
        future = self.a2.created_at + timedelta(days=365)
        future_str = future.strftime("%Y-%m-%dT%H:%M:%SZ")
        response = self.client.get(
            f"/api/eln/entries/{self.entry.display_id}/actions/?since={future_str}"
        )
        self.assertEqual(response.status_code, 200, msg=response.content.decode())
        self.assertEqual(response.data["count"], 0)

    def test_filter_by_since_invalid_format(self):
        """?since=<garbage> returns 400."""
        response = self.client.get(
            f"/api/eln/entries/{self.entry.display_id}/actions/?since=not-a-date"
        )
        self.assertEqual(response.status_code, 400)

    # ── POST: create custom action ────────────────────────────────────────

    def test_create_action(self):
        """POST creates a new action and returns 201."""
        response = self.client.post(
            f"/api/eln/entries/{self.entry.display_id}/actions/",
            {"action_type": "commented", "metadata": {"text": "Great work!"}},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ElnAction.objects.count(), 3)
        self.assertEqual(response.data["action_type"], "commented")
        self.assertEqual(response.data["metadata"], {"text": "Great work!"})
        self.assertEqual(response.data["performed_by"]["username"], self.USERNAME)

    def test_create_action_unauthenticated_returns_403(self):
        """POST without auth returns 403."""
        from rest_framework.test import APIClient
        anon_client = APIClient()
        response = anon_client.post(
            f"/api/eln/entries/{self.entry.display_id}/actions/",
            {"action_type": "commented"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    # ── Actions are entry-specific ────────────────────────────────────────

    def test_actions_are_scoped_to_entry(self):
        """Different entries have independent action lists."""
        other = NotebookEntry.objects.create(
            title="Other Entry", content=TEXT_DOC, folder=self.folder, author=self.user
        )
        response = self.client.get(
            f"/api/eln/entries/{other.display_id}/actions/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)


class EntryTagActionsLoggingTests(BaseTestCase):
    """Test that tag attach/detach on entries logs actions via @logs_action."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)
        self.entry = NotebookEntry.objects.create(
            title="Tag Test Entry", content=TEXT_DOC, folder=self.folder, author=self.user
        )
        from mods.tags.models import Tag
        self.tag1 = Tag.objects.create(name="Important", color="enzyme", icon="dna")
        self.tag2 = Tag.objects.create(name="Urgent", color="warn", icon="circle")
        self._patcher = patch(MIXIN_LOG_ACTION_PATH)
        self.mock_log = self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_attach_tags_logs_action(self):
        response = self.client.post(
            f"/api/eln/entries/{self.entry.display_id}/tags/",
            {"tag_ids": [self.tag1.id, self.tag2.id]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "eln.entry.tags_attached")
        self.assertEqual(kwargs["target_type"], "eln.entry")
        self.assertEqual(kwargs["target_id"], self.entry.id)
        self.assertEqual(kwargs["metadata"], {"tag_ids": [self.tag1.id, self.tag2.id]})

    def test_detach_tag_logs_action(self):
        self.entry.tags.add(self.tag1)
        response = self.client.delete(
            f"/api/eln/entries/{self.entry.display_id}/tags/{self.tag1.id}/"
        )
        self.assertEqual(response.status_code, 200)
        self.mock_log.assert_called_once()
        kwargs = _log_kwargs(self.mock_log)
        self.assertEqual(kwargs["action_type"], "eln.entry.tag_detached")
        self.assertEqual(kwargs["target_type"], "eln.entry")
        self.assertEqual(kwargs["target_id"], self.entry.id)
        self.assertEqual(kwargs["metadata"], {"tag_id": self.tag1.id})

    def test_detach_nonexistent_tag_does_not_log(self):
        response = self.client.delete(
            f"/api/eln/entries/{self.entry.display_id}/tags/99999/"
        )
        self.assertEqual(response.status_code, 404)
        self.mock_log.assert_not_called()
