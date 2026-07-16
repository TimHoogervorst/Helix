"""
Tests for ContentVersion model and the reworked save pipeline.

Exercises the full perform_update flow: hash-based no-op short-circuit,
ContentVersion creation, save_mode via X-Save-Mode header, version-number
sequencing, and action-log metadata enrichment.
"""
from core.tests.base import BaseTestCase
from core_mods.eln.models import NotebookEntry, ContentVersion, ElnAction

from .factories import TEXT_DOC, ALT_DOC, _CreateEntryMixin


# ── Tests ────────────────────────────────────────────────────────────────────


class ContentVersionCreationTests(_CreateEntryMixin, BaseTestCase):
    """ContentVersion row creation on content updates."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_first_update_with_content_creates_version_1(self):
        """First PUT that includes content creates ContentVersion #1."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        self.assertEqual(ContentVersion.objects.count(), 0)

        response = self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Updated", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(ContentVersion.objects.count(), 1)

        cv = ContentVersion.objects.first()
        self.assertEqual(cv.entry.display_id, display_id)
        self.assertEqual(cv.version_number, 1)
        self.assertEqual(cv.content, ALT_DOC)
        self.assertEqual(cv.content_hash, ContentVersion.hash_content(ALT_DOC))
        self.assertEqual(cv.created_by, self.user)
        self.assertEqual(cv.save_mode, "manual")

    def test_sequential_version_numbers(self):
        """Version numbers increment sequentially per entry: 1, 2, 3, …"""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        docs = [
            {
                "type": "doc",
                "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": f"v{i}"}]}
                ],
            }
            for i in range(1, 4)
        ]

        for i, doc in enumerate(docs, start=1):
            response = self.client.put(
                f"/api/eln/entries/{display_id}/",
                {"title": f"Edit {i}", "content": doc, "folder": self.folder.id},
                format="json",
            )
            self.assertEqual(response.status_code, 200)

        versions = ContentVersion.objects.order_by("version_number")
        self.assertEqual(versions.count(), 3)
        self.assertEqual(
            [v.version_number for v in versions], [1, 2, 3]
        )

    def test_version_numbers_independent_per_entry(self):
        """Each entry has its own version number sequence."""
        e1 = self._create_entry(title="Entry 1")
        e2 = self._create_entry(title="Entry 2")

        # Edit entry 1
        self.client.put(
            f"/api/eln/entries/{e1['display_id']}/",
            {"title": "E1 v1", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )
        # Edit entry 2 twice
        self.client.put(
            f"/api/eln/entries/{e2['display_id']}/",
            {"title": "E2 v1", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.client.put(
            f"/api/eln/entries/{e2['display_id']}/",
            {
                "title": "E2 v2",
                "content": TEXT_DOC,
                "folder": self.folder.id,
            },
            format="json",
        )

        # Entry 1 has 1 version, Entry 2 has 2
        self.assertEqual(
            ContentVersion.objects.filter(entry__display_id=e1["display_id"]).count(),
            1,
        )
        self.assertEqual(
            ContentVersion.objects.filter(entry__display_id=e2["display_id"]).count(),
            2,
        )

    def test_post_sync_content_hash_is_stored(self):
        """ContentVersion stores the *post-sync* content hash.

        When sync_entry_content modifies content (e.g. patches entity IDs),
        the stored hash reflects the post-sync content, not the incoming.
        """
        entry_data = self._create_entry(content=TEXT_DOC)
        display_id = entry_data["display_id"]

        response = self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Synced", "content": TEXT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        cv = ContentVersion.objects.first()
        # The stored hash should match the db content (post-sync).
        entry = NotebookEntry.objects.get(display_id=display_id)
        self.assertEqual(cv.content_hash, ContentVersion.hash_content(entry.content))


class HashBasedNoOpTests(_CreateEntryMixin, BaseTestCase):
    """Hash-based no-op short-circuit in perform_update."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_unchanged_content_is_noop(self):
        """PUT with same content as latest ContentVersion → no DB writes."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        # First update creates ContentVersion #1.
        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Test", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(ContentVersion.objects.count(), 1)

        # Second update with same content → no-op.
        action_count_before = ElnAction.objects.count()
        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Test", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )
        # Still only 1 ContentVersion — second was a no-op.
        self.assertEqual(ContentVersion.objects.count(), 1)
        # No action logged for the no-op.
        self.assertEqual(ElnAction.objects.count(), action_count_before)

    def test_unchanged_content_with_title_change_still_saves(self):
        """Hash match on content BUT title changed → save proceeds, no new CV."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        # First update creates ContentVersion #1.
        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "V1", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(ContentVersion.objects.count(), 1)

        # Same content, different title → saves but no new ContentVersion.
        response = self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "V1 renamed", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "V1 renamed")
        # ContentVersion count unchanged — content didn't change.
        self.assertEqual(ContentVersion.objects.count(), 1)
        # Action was still logged (title change).
        self.assertEqual(ElnAction.objects.filter(action_type="eln.entry.edited").count(), 2)

    def test_noop_before_any_content_version(self):
        """When no ContentVersion exists yet, update always proceeds.

        This is the first-update-after-create case — ContentVersion #1
        must be created.
        """
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        # First-ever update → creates ContentVersion #1 regardless.
        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "First Edit", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(ContentVersion.objects.count(), 1)
        cv = ContentVersion.objects.first()
        self.assertEqual(cv.version_number, 1)


class TitleOnlyStatusOnlyTests(_CreateEntryMixin, BaseTestCase):
    """Title/status-only updates do NOT create a ContentVersion."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_title_only_update_no_content_version(self):
        """PUT with only title change → no ContentVersion created."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        response = self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Renamed", "content": TEXT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        # ContentVersion created because this is the first update with content
        # (even though unchanged from create).  First update ALWAYS creates
        # ContentVersion #1 — the no-op short-circuit only fires when a
        # ContentVersion already exists to compare against.
        self.assertEqual(ContentVersion.objects.count(), 1)

        # Now do another title-only PUT — same content, different title.
        # Content hasn't changed since CV #1 → no new CV.
        response = self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Renamed Again", "content": TEXT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        # Still only 1 ContentVersion — content unchanged from CV #1.
        self.assertEqual(ContentVersion.objects.count(), 1)
        # Action was logged for the title change.
        self.assertGreaterEqual(
            ElnAction.objects.filter(action_type="eln.entry.edited").count(), 2
        )

    def test_status_only_update_no_content_version(self):
        """PUT with only status change → no ContentVersion created."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        # First give it a content update so we have CV #1.
        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Test", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )
        self.assertEqual(ContentVersion.objects.count(), 1)

        # Status-only change — content same as CV #1.
        response = self.client.put(
            f"/api/eln/entries/{display_id}/",
            {
                "title": "Test",
                "content": ALT_DOC,
                "status": "finished",
                "folder": self.folder.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "finished")
        # Content unchanged → no new ContentVersion.
        self.assertEqual(ContentVersion.objects.count(), 1)
        # Action logged (status changed).
        self.assertGreaterEqual(
            ElnAction.objects.filter(action_type="eln.entry.edited").count(), 2
        )


class SaveModeHeaderTests(_CreateEntryMixin, BaseTestCase):
    """X-Save-Mode header maps to ContentVersion.save_mode."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_default_save_mode_is_manual(self):
        """Without X-Save-Mode header, save_mode defaults to 'manual'."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Test", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )
        cv = ContentVersion.objects.first()
        self.assertEqual(cv.save_mode, "manual")

    def test_autosave_header_maps_correctly(self):
        """X-Save-Mode: autosave → save_mode='autosave'."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Test", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
            HTTP_X_SAVE_MODE="autosave",
        )
        cv = ContentVersion.objects.first()
        self.assertEqual(cv.save_mode, "autosave")

    def test_manual_header_maps_correctly(self):
        """X-Save-Mode: manual → save_mode='manual'."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Test", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
            HTTP_X_SAVE_MODE="manual",
        )
        cv = ContentVersion.objects.first()
        self.assertEqual(cv.save_mode, "manual")

    def test_unknown_save_mode_defaults_to_manual(self):
        """An unrecognised X-Save-Mode value falls back to 'manual'."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Test", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
            HTTP_X_SAVE_MODE="garbage",
        )
        cv = ContentVersion.objects.first()
        self.assertEqual(cv.save_mode, "manual")


class ActionLoggingEnrichmentTests(_CreateEntryMixin, BaseTestCase):
    """Action logging carries version metadata on content updates."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_edited_action_includes_version_metadata(self):
        """'edited' action metadata has version_id, version_number, save_mode."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "Updated", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )

        action = ElnAction.objects.filter(action_type="eln.entry.edited").first()
        self.assertIsNotNone(action)
        self.assertEqual(action.metadata["version_number"], 1)
        self.assertEqual(action.metadata["save_mode"], "manual")
        self.assertIsNotNone(action.metadata["version_id"])

    def test_title_only_edited_action_has_empty_metadata(self):
        """'edited' action from title-only change has no version metadata."""
        entry_data = self._create_entry()
        display_id = entry_data["display_id"]

        # First update with content to create CV #1.
        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "V1", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )

        # Title-only update (content unchanged from CV #1 → no-op for content).
        self.client.put(
            f"/api/eln/entries/{display_id}/",
            {"title": "V1 Renamed", "content": ALT_DOC, "folder": self.folder.id},
            format="json",
        )

        # The second "edited" action should have empty metadata (no new CV).
        actions = list(ElnAction.objects.filter(action_type="eln.entry.edited").order_by("created_at"))
        self.assertEqual(len(actions), 2)
        # First action has version metadata.
        self.assertIn("version_number", actions[0].metadata)
        # Second action has empty metadata — no content change.
        self.assertEqual(actions[1].metadata, {})


class CascadeDeleteTests(_CreateEntryMixin, BaseTestCase):
    """Deleting an entry cascades to its ContentVersions."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_delete_entry_removes_content_versions(self):
        """DELETE on entry removes all ContentVersions via CASCADE."""
        entry_data = self._create_entry(title="To Delete")
        display_id = entry_data["display_id"]

        # Create several ContentVersions via updates
        docs = [ALT_DOC, TEXT_DOC, ALT_DOC]
        for i, doc in enumerate(docs):
            self.client.put(
                f"/api/eln/entries/{display_id}/",
                {"title": f"Edit {i}", "content": doc, "folder": self.folder.id},
                format="json",
            )

        self.assertGreater(ContentVersion.objects.count(), 0)

        # Delete the entry
        response = self.client.delete(f"/api/eln/entries/{display_id}/")
        self.assertEqual(response.status_code, 204)

        # All ContentVersions are gone
        self.assertEqual(ContentVersion.objects.count(), 0)
        # Entry is gone
        self.assertEqual(NotebookEntry.objects.count(), 0)
