"""ELN document saves use Platform Revisions as the durable history."""

from .support import BaseTestCase
from helix_core.public import ActionLogEntry, PlatformRecord
from mods.eln.models import ContentVersion, NotebookEntry
from .factories import ALT_DOC, _CreateEntryMixin


class PlatformDocumentHistoryTests(_CreateEntryMixin, BaseTestCase):
    """Verify content history is owned by the Platform revision group."""

    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.user)

    def test_content_update_creates_platform_revision_and_no_duplicate_history(self):
        created = self._create_entry(name="Notebook")
        entry = NotebookEntry.objects.get(pk=created["id"])
        record = PlatformRecord.objects.get(pk=entry.platform_record_id)
        group = record.revision_groups.get(group_key="document")
        self.assertEqual(group.revisions.count(), 1)

        response = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {"name": "Notebook", "content": ALT_DOC},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        group.refresh_from_db()
        self.assertEqual(group.revisions.count(), 2)
        current = group.current_revision
        self.assertEqual(current.snapshot["document"], ALT_DOC)
        self.assertEqual(ContentVersion.objects.filter(entry=entry).count(), 0)

    def test_unchanged_content_is_a_noop_but_title_change_keeps_platform_audit(self):
        created = self._create_entry(name="Notebook")
        entry = NotebookEntry.objects.get(pk=created["id"])
        record = PlatformRecord.objects.get(pk=entry.platform_record_id)
        group = record.revision_groups.get(group_key="document")

        first = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {"name": "Notebook", "content": ALT_DOC},
            format="json",
        )
        self.assertEqual(first.status_code, 200, first.data)
        group.refresh_from_db()
        current_revision_id = group.current_revision_id

        noop = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {"name": "Notebook", "content": ALT_DOC},
            format="json",
        )
        self.assertEqual(noop.status_code, 200, noop.data)
        group.refresh_from_db()
        self.assertEqual(group.current_revision_id, current_revision_id)
        self.assertEqual(group.revisions.count(), 2)

        renamed = self.client.put(
            f"/api/eln/entries/{entry.display_id}/",
            {"name": "Renamed notebook", "content": ALT_DOC},
            format="json",
        )
        self.assertEqual(renamed.status_code, 200, renamed.data)
        group.refresh_from_db()
        self.assertEqual(group.current_revision_id, current_revision_id)
        self.assertTrue(ActionLogEntry.objects.filter(
            target_model_reference="eln.entry",
            target_object_id=str(entry.pk),
            metadata__group_key="document",
            metadata__revision_changed=False,
        ).exists())
        self.assertEqual(ContentVersion.objects.filter(entry=entry).count(), 0)
