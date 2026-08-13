"""
Tests for the content sync pipeline: sync_entry_content.

These tests verify the sync pipeline — mention sync and conditional
save — using real database-backed entries.
"""
from unittest.mock import patch

from core.tests.base import BaseServiceTestCase
from core.tests.factories import EMPTY_DOC, make_doc_with_ref
from core.mentions.models import Mention
from mods.eln.models import NotebookEntry
from mods.eln.sync import sync_entry_content
from mods.eln.tests.factories import get_or_create_default_eln_schema


class SyncEntryContentTests(BaseServiceTestCase):
    """Tests for sync_entry_content pipeline."""

    def setUp(self):
        super().setUp()
        self.schema = get_or_create_default_eln_schema()
        self.entry = NotebookEntry.objects.create(
            name="Test Entry", content=EMPTY_DOC,
            folder=self.folder, author=self.user, schema=self.schema,
        )
        self.target = NotebookEntry.objects.create(
            name="Target Entry", content=EMPTY_DOC,
            folder=self.folder, author=self.user, schema=self.schema,
        )

    # ── No-op ──────────────────────────────────────────────────────────

    def test_noop_empty_entry(self):
        """Entry with no reference nodes → no changes, no save."""

        with patch.object(NotebookEntry, "save") as mock_save:
            result = sync_entry_content(self.entry)

        self.assertIs(result, self.entry)
        mock_save.assert_not_called()
        self.assertEqual(Mention.objects.count(), 0)

    # ── Mention sync ───────────────────────────────────────────────────

    def test_syncs_mentions_from_refs(self):
        """Reference nodes create Mention rows."""

        self.entry.content = make_doc_with_ref(self.target.display_id)
        self.entry.save()

        sync_entry_content(self.entry)

        self.assertEqual(Mention.objects.count(), 1)
        mention = Mention.objects.first()
        self.assertEqual(mention.source_id, self.entry.id)
        self.assertEqual(mention.target_id, self.target.id)

    def test_removed_refs_delete_mentions(self):
        """Reference node removed → Mention deleted."""

        # Create mention
        self.entry.content = make_doc_with_ref(self.target.display_id)
        self.entry.save()
        sync_entry_content(self.entry)
        self.assertEqual(Mention.objects.count(), 1)

        # Remove reference
        self.entry.content = EMPTY_DOC
        self.entry.save()
        sync_entry_content(self.entry)
        self.assertEqual(Mention.objects.count(), 0)

    def test_unresolvable_refs_skipped(self):
        """Reference to nonexistent display_id → silently skipped."""

        self.entry.content = make_doc_with_ref("E99999")
        self.entry.save()

        sync_entry_content(self.entry)

        self.assertEqual(Mention.objects.count(), 0)

    # ── Signal-based sync (extension point) ────────────────────────────

    def test_custom_receiver_modifies_content(self):
        """A receiver connected to entry_content_sync can modify content.

        This verifies that the signal dispatch is the extension point for
        future mods that want to hook into the sync pipeline.
        """
        from core.signals import entry_content_sync

        def adding_receiver(sender, entry, content, **kwargs):
            """Receiver that adds 'EXTENSION_RAN' marker to the content."""
            return {"type": "doc", "content": [{"text": "EXTENSION_RAN"}]}

        entry_content_sync.connect(
            adding_receiver, sender=NotebookEntry, dispatch_uid="test_receiver"
        )
        try:
            self.entry.content = EMPTY_DOC
            self.entry.save()

            result = sync_entry_content(self.entry)

            # The content was modified by the receiver (last non-None wins)
            self.assertEqual(
                result.content["content"][0]["text"], "EXTENSION_RAN"
            )
        finally:
            entry_content_sync.disconnect(dispatch_uid="test_receiver")


# ── Fingerprint pre-check integration tests ──────────────────────────────────


class FingerprintPreCheckTests(BaseServiceTestCase):
    """Tests for the fingerprint pre-check in sync_entry_content.

    When old_content is provided, expensive pipeline steps (signal dispatch,
    mention sync) are skipped if the reference fingerprint didn't change.
    When old_content is absent the full pipeline always runs.
    """

    def setUp(self):
        super().setUp()
        self.schema = get_or_create_default_eln_schema()
        self.entry = NotebookEntry.objects.create(
            name="Test Entry", content=EMPTY_DOC,
            folder=self.folder, author=self.user, schema=self.schema,
        )
        self.target = NotebookEntry.objects.create(
            name="Target Entry", content=EMPTY_DOC,
            folder=self.folder, author=self.user, schema=self.schema,
        )

    # ── Text-only edit → pipeline skipped ────────────────────────────────

    def test_text_only_edit_skips_sync_pipeline(self):
        """When only text changes, signal and mentions are skipped."""

        old_doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Hello"}]}],
        }
        new_doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "World"}]}],
        }

        self.entry.content = new_doc
        self.entry.save()

        with patch(
            "mods.eln.sync.entry_content_sync.send"
        ) as mock_signal, patch(
            "mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            result = sync_entry_content(self.entry, old_content=old_doc)

        self.assertIs(result, self.entry)
        mock_signal.assert_not_called()
        mock_mentions.assert_not_called()

    def test_text_only_edit_noop_when_fingerprints_match(self):
        """Fingerprints match → entry returned unchanged, no save."""

        old_doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "A"}]}],
        }
        new_doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "B"}]}],
        }

        self.entry.content = new_doc
        self.entry.save()

        with patch.object(NotebookEntry, "save") as mock_save:
            result = sync_entry_content(self.entry, old_content=old_doc)

        mock_save.assert_not_called()
        self.assertEqual(result, self.entry)

    # ── Reference change → full pipeline ─────────────────────────────────

    def test_reference_change_runs_full_pipeline(self):
        """When a reference node is added, full pipeline runs."""

        old_doc = EMPTY_DOC
        new_doc = make_doc_with_ref(self.target.display_id)

        self.entry.content = new_doc
        self.entry.save()

        with patch(
            "mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal, patch(
            "mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            sync_entry_content(self.entry, old_content=old_doc)

        mock_signal.assert_called()
        mock_mentions.assert_called()

    def test_reference_removed_runs_full_pipeline(self):
        """When a reference node is removed, full pipeline runs."""

        old_doc = make_doc_with_ref(self.target.display_id)
        new_doc = EMPTY_DOC

        self.entry.content = new_doc
        self.entry.save()

        with patch(
            "mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal, patch(
            "mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            sync_entry_content(self.entry, old_content=old_doc)

        mock_signal.assert_called()
        mock_mentions.assert_called()

    # ── Backward compatibility ───────────────────────────────────────────

    def test_no_old_content_runs_full_pipeline(self):
        """When old_content is None (create, or backward compat), full pipeline runs."""

        self.entry.content = make_doc_with_ref(self.target.display_id)
        self.entry.save()

        with patch(
            "mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal, patch(
            "mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            sync_entry_content(self.entry)  # no old_content

        mock_signal.assert_called()
        mock_mentions.assert_called()

    def test_old_content_none_still_syncs_refs(self):
        """Caller that passes old_content=None gets the existing behaviour."""

        self.entry.content = make_doc_with_ref(self.target.display_id)
        self.entry.save()

        with patch(
            "mods.eln.sync.entry_content_sync.send",
            wraps=lambda **kwargs: [(None, None)],
        ) as mock_signal:
            sync_entry_content(self.entry, old_content=None)

        mock_signal.assert_called()

    # ── Same-content no-op ───────────────────────────────────────────────

    def test_identical_content_skips_pipeline(self):
        """When content hasn't changed at all, pipeline is skipped."""

        doc = make_doc_with_ref(self.target.display_id)
        self.entry.content = doc
        self.entry.save()

        with patch(
            "mods.eln.sync.entry_content_sync.send"
        ) as mock_signal, patch(
            "mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            result = sync_entry_content(self.entry, old_content=doc)

        mock_signal.assert_not_called()
        mock_mentions.assert_not_called()
        self.assertIs(result, self.entry)

    # ── End-to-end via API ───────────────────────────────────────────────

    def test_text_only_edit_via_api_skips_sync_pipeline(self):
        """End-to-end: text-only PUT passes old_content through the view."""
        from rest_framework.test import APIClient

        from mods.access.models import Grant, ProjectRole

        Grant.objects.create(
            project=self.project, user=self.user, role=ProjectRole.EDIT,
        )

        client = APIClient()
        client.force_authenticate(user=self.user)

        # Create entry
        resp = client.post(
            "/api/eln/entries/",
            {"name": "E2E Test", "content": EMPTY_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        display_id = resp.data["display_id"]

        # First PUT with content — establishes ContentVersion #1.
        text_doc = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "First"}]}],
        }
        resp = client.put(
            f"/api/eln/entries/{display_id}/",
            {"name": "E2E Test", "content": text_doc, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        # Second PUT — text-only change, same reference fingerprint.
        # The view captures old_content before save and passes to sync_entry_content.
        text_doc2 = {
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Second"}]}],
        }
        with patch(
            "mods.eln.sync.entry_content_sync.send"
        ) as mock_signal, patch(
            "mods.eln.sync.sync_mentions"
        ) as mock_mentions:
            resp = client.put(
                f"/api/eln/entries/{display_id}/",
                {"name": "E2E Test", "content": text_doc2, "folder": self.folder.id},
                format="json",
            )
            self.assertEqual(resp.status_code, 200)
            # The signal and mentions should be skipped because fingerprints
            # match — both docs are plain text with no references.
            mock_signal.assert_not_called()
            mock_mentions.assert_not_called()
