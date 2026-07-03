"""
Tests for the NotebookEntry → Entity status cascade signal handler.

The signal (in ``eln/cascade.py``) fires on ``post_save`` for
NotebookEntry and updates the status of all linked Entities to match.
"""
from core.tests.base import BaseServiceTestCase
from core_mods.eln.models import NotebookEntry
from core_mods.lims.models import EntityType, Entity


class CascadeEntryStatusToEntitiesTests(BaseServiceTestCase):
    """Tests for cascade_entry_status_to_entities signal handler."""

    def setUp(self):
        super().setUp()
        self.entry = NotebookEntry.objects.create(
            title="Test Entry",
            folder=self.folder,
            author=self.user,
        )
        self.entity_type = EntityType.objects.create(
            name="Blood", prefix="BLOOD",
        )
        self.entity = Entity.objects.create(
            name="Sample A",
            entity_type=self.entity_type,
            source_entry=self.entry,
            folder=self.folder,
            created_by=self.user,
        )

    # ── Cascade on status change ───────────────────────────────────────

    def test_status_change_cascades_to_linked_entities(self):
        """Updating an entry's status cascades to all linked entities."""
        self.entry.status = "finished"
        self.entry.save()

        self.entity.refresh_from_db()
        self.assertEqual(self.entity.status, "finished")

    def test_multiple_entities_all_updated(self):
        """All entities linked to the same entry get their status updated."""
        entity2 = Entity.objects.create(
            name="Sample B",
            entity_type=self.entity_type,
            source_entry=self.entry,
            folder=self.folder,
            created_by=self.user,
        )

        self.entry.status = "finished"
        self.entry.save()

        self.entity.refresh_from_db()
        entity2.refresh_from_db()
        self.assertEqual(self.entity.status, "finished")
        self.assertEqual(entity2.status, "finished")

    # ── No cascade on create ───────────────────────────────────────────

    def test_creating_new_entry_does_not_cascade(self):
        """Entities created alongside a new entry keep their own default status.

        The cascade is a ``post_save`` signal that fires during
        ``NotebookEntry.objects.create()``, but at that point no entities
        are linked yet (FK constraint requires the entry to exist first).
        Entities created afterwards get their own default status — the
        entry's status at creation time does not force entity status.
        """
        entry2 = NotebookEntry.objects.create(
            title="Another Entry",
            folder=self.folder,
            author=self.user,
            status="finished",
        )
        entity2 = Entity.objects.create(
            name="Sample B",
            entity_type=self.entity_type,
            source_entry=entry2,
            folder=self.folder,
            created_by=self.user,
        )
        self.assertEqual(entity2.status, "in_progress")

    # ── Unaffected entities ────────────────────────────────────────────

    def test_entities_without_source_entry_unaffected(self):
        """Entities without source_entry are not updated."""
        orphan = Entity.objects.create(
            name="Orphan",
            entity_type=self.entity_type,
            source_entry=None,
            folder=self.folder,
            created_by=self.user,
        )

        self.entry.status = "finished"
        self.entry.save()

        orphan.refresh_from_db()
        self.assertEqual(orphan.status, "in_progress")

    def test_entities_linked_to_other_entries_unaffected(self):
        """Entities linked to a different entry keep their status."""
        other_entry = NotebookEntry.objects.create(
            title="Other Entry",
            folder=self.folder,
            author=self.user,
        )
        other_entity = Entity.objects.create(
            name="Other Sample",
            entity_type=self.entity_type,
            source_entry=other_entry,
            folder=self.folder,
            created_by=self.user,
        )

        self.entry.status = "finished"
        self.entry.save()

        other_entity.refresh_from_db()
        self.assertEqual(other_entity.status, "in_progress")

    # ── Cascade on any update ──────────────────────────────────────────

    def test_any_update_cascades_status(self):
        """Even a non-status save cascades the entry status to linked entities.

        The cascade is a cheap SQL UPDATE that is harmless when the status
        hasn't changed — no need for an update_fields guard.
        """
        self.entry.status = "finished"
        self.entry.save()
        self.entity.refresh_from_db()
        self.assertEqual(self.entity.status, "finished")

        # Manually set entity status back — it diverges from the entry.
        self.entity.status = "in_progress"
        self.entity.save()

        # Save the entry with only a title change.  The cascade syncs
        # entity status back to match the entry.
        self.entry.title = "Updated Title"
        self.entry.save(update_fields=["title"])

        self.entity.refresh_from_db()
        self.assertEqual(self.entity.status, "finished")

    # ── Signal is connected ────────────────────────────────────────────

    def test_signal_is_connected(self):
        """The cascade receiver is connected to post_save for NotebookEntry."""
        from django.db.models.signals import post_save

        receivers = post_save._live_receivers(sender=NotebookEntry)
        self.assertTrue(
            any(r[0] for r in receivers),
            "No receiver connected to post_save for NotebookEntry",
        )
