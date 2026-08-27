"""
Tests for the NotebookEntry → Entity status cascade signal handler.

The signal (in ``eln/cascade.py``) fires on ``post_save`` for
NotebookEntry and updates the status of all linked Entities to match.
"""
from core.tests.base import BaseServiceTestCase
from core.models import Folder
from helix_core.models import SchemaType, Schema
from core.mentions.models import Mention
from mods.eln.models import NotebookEntry
from mods.lims.models import Entity
from helix_core.source_deletion import delete_source_descendants


class CascadeEntryStatusToEntitiesTests(BaseServiceTestCase):
    """Tests for cascade_entry_status_to_entities signal handler."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.lims_schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )
        cls.eln_schema_type = SchemaType.objects.create(
            display_name="ELN Entry", workspace_id="eln", model="mods.eln.models.NotebookEntry",
        )

    def setUp(self):
        super().setUp()
        self.eln_schema = Schema.objects.create(
            name="Default", prefix="E", schema_type=self.eln_schema_type,
        )
        self.entry = NotebookEntry.objects.create(
            name="Test Entry",
            folder=self.folder,
            author=self.user,
            schema=self.eln_schema,
        )
        self.schema = Schema.objects.create(
            name="Blood", prefix="BLOOD", schema_type=self.lims_schema_type,
        )
        self.entity = Entity.objects.create(
            name="Sample A",
            schema=self.schema,
            source_entry=self.entry,
            folder=self.folder,
            author=self.user,
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
            schema=self.schema,
            source_entry=self.entry,
            folder=self.folder,
            author=self.user,
        )

        self.entry.status = "finished"
        self.entry.save()

        self.entity.refresh_from_db()
        entity2.refresh_from_db()
        self.assertEqual(self.entity.status, "finished")
        self.assertEqual(entity2.status, "finished")

    def test_status_change_cascades_transitively_over_source(self):
        """Entry status updates reach entities sourced by descendant entities."""
        result = Entity.objects.create(
            name="Result",
            schema=self.schema,
            source=self.entity,
            folder=self.folder,
            author=self.user,
        )

        self.entry.status = "finished"
        self.entry.save()

        result.refresh_from_db()
        self.assertEqual(result.status, "finished")

    def test_entity_status_change_cascades_to_source_descendants(self):
        """Entity status updates propagate to its descendants."""
        result = Entity.objects.create(
            name="Result",
            schema=self.schema,
            source=self.entity,
            folder=self.folder,
            author=self.user,
        )

        self.entity.status = "finished"
        self.entity.save()

        result.refresh_from_db()
        self.assertEqual(result.status, "finished")

    def test_upstream_status_change_overwrites_descendant_override(self):
        """A later upstream save overwrites a manually changed descendant."""
        result = Entity.objects.create(
            name="Result",
            schema=self.schema,
            source=self.entity,
            folder=self.folder,
            author=self.user,
        )
        self.entry.status = "finished"
        self.entry.save()
        result.status = "in_progress"
        result.save()

        self.entry.name = "Updated Title"
        self.entry.save(update_fields=["name"])

        result.refresh_from_db()
        self.assertEqual(result.status, "finished")

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
            name="Another Entry",
            folder=self.folder,
            author=self.user,
            schema=self.eln_schema,
            status="finished",
        )
        entity2 = Entity.objects.create(
            name="Sample B",
            schema=self.schema,
            source_entry=entry2,
            folder=self.folder,
            author=self.user,
        )
        self.assertEqual(entity2.status, "in_progress")

    # ── Unaffected entities ────────────────────────────────────────────

    def test_entities_without_source_entry_unaffected(self):
        """Entities without source_entry are not updated."""
        orphan = Entity.objects.create(
            name="Orphan",
            schema=self.schema,
            source_entry=None,
            folder=self.folder,
            author=self.user,
        )

        self.entry.status = "finished"
        self.entry.save()

        orphan.refresh_from_db()
        self.assertEqual(orphan.status, "in_progress")

    def test_entities_linked_to_other_entries_unaffected(self):
        """Entities linked to a different entry keep their status."""
        other_entry = NotebookEntry.objects.create(
            name="Other Entry",
            folder=self.folder,
            author=self.user,
            schema=self.eln_schema,
        )
        other_entity = Entity.objects.create(
            name="Other Sample",
            schema=self.schema,
            source_entry=other_entry,
            folder=self.folder,
            author=self.user,
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
        self.entry.name = "Updated Title"
        self.entry.save(update_fields=["name"])

        self.entity.refresh_from_db()
        self.assertEqual(self.entity.status, "finished")

    # ── Signal is connected ────────────────────────────────────────────

    def test_signal_is_connected(self):
        """The cascade receiver is connected to post_save for NotebookEntry."""
        from django.db.models.signals import post_save

        sync_receivers, async_receivers = post_save._live_receivers(
            sender=NotebookEntry
        )
        self.assertTrue(
            sync_receivers or async_receivers,
            "No receiver connected to post_save for NotebookEntry",
        )

    def test_entity_signal_is_connected(self):
        """The cascade receiver is connected to post_save for Entity."""
        from django.db.models.signals import post_save

        sync_receivers, async_receivers = post_save._live_receivers(sender=Entity)
        self.assertTrue(
            sync_receivers or async_receivers,
            "No receiver connected to post_save for Entity",
        )


class SourceDeletionTests(BaseServiceTestCase):
    """Source deletion removes descendants without following references."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.eln_schema_type = SchemaType.objects.create(
            display_name="ELN Entry", workspace_id="eln",
            model="mods.eln.models.NotebookEntry",
        )
        cls.lims_schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims",
            model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.eln_schema = Schema.objects.create(
            name="Entry", prefix="E", schema_type=self.eln_schema_type,
        )
        self.lims_schema = Schema.objects.create(
            name="Entity", prefix="S", schema_type=self.lims_schema_type,
        )
        self.entry = NotebookEntry.objects.create(
            name="Entry", folder=self.folder, author=self.user,
            schema=self.eln_schema,
        )
        self.entity = Entity.objects.create(
            name="Entity", schema=self.lims_schema, source=self.entry,
            folder=self.folder, author=self.user,
        )
        self.result = Entity.objects.create(
            name="Result", schema=self.lims_schema, source=self.entity,
            folder=self.folder, author=self.user,
        )

    def test_entry_delete_cascades_transitive_source_descendants(self):
        other_entry = NotebookEntry.objects.create(
            name="Other", folder=self.folder, author=self.user,
            schema=self.eln_schema,
        )
        unrelated = Entity.objects.create(
            name="Unrelated", schema=self.lims_schema, source=other_entry,
            folder=self.folder, author=self.user,
        )

        delete_source_descendants(self.entry)
        self.entry.delete()

        self.assertFalse(Entity.objects.filter(pk=self.entity.pk).exists())
        self.assertFalse(Entity.objects.filter(pk=self.result.pk).exists())
        self.assertTrue(Entity.objects.filter(pk=unrelated.pk).exists())
        self.assertTrue(NotebookEntry.objects.filter(pk=other_entry.pk).exists())

    def test_folder_delete_does_not_follow_legacy_folder_reference(self):
        other_folder = Folder.objects.create(
            name="Other", project=self.project,
        )
        unrelated = Entity.objects.create(
            name="Unrelated", schema=self.lims_schema, source=other_folder,
            folder=self.folder, author=self.user,
        )

        delete_source_descendants(self.folder)
        self.folder.delete()

        self.assertTrue(Entity.objects.filter(pk=unrelated.pk).exists())
        unrelated.refresh_from_db()
        self.assertIsNone(unrelated.folder_id)

    def test_folder_delete_cascades_source_subtree(self):
        source_folder = Folder.objects.create(
            name="Source Folder", project=self.project,
        )
        child_folder = Folder.objects.create(
            name="Child Folder", project=self.project, parent=source_folder,
        )
        child_entry = NotebookEntry.objects.create(
            name="Child Entry", source=child_folder, folder=child_folder,
            author=self.user, schema=self.eln_schema,
        )
        child_entity = Entity.objects.create(
            name="Child Entity", schema=self.lims_schema, source=child_entry,
            folder=child_folder, author=self.user,
        )
        child_result = Entity.objects.create(
            name="Child Result", schema=self.lims_schema, source=child_entity,
            folder=child_folder, author=self.user,
        )
        child_result_result = Entity.objects.create(
            name="Nested Child Result", schema=self.lims_schema,
            source=child_result, folder=child_folder, author=self.user,
        )
        self.lims_schema.columns = [{"name": "linked_entity", "type": "reference"}]
        self.lims_schema.save(update_fields=["columns"])
        survivor = Entity.objects.create(
            name="Referenced Survivor", schema=self.lims_schema,
            source=self.entry, folder=self.folder, author=self.user,
            properties={"linked_entity": child_entity.display_id},
        )
        mention = Mention.objects.create(source=survivor, target=child_entity)

        delete_source_descendants(source_folder)
        source_folder.delete()

        self.assertFalse(Folder.objects.filter(pk=source_folder.pk).exists())
        self.assertFalse(Folder.objects.filter(pk=child_folder.pk).exists())
        self.assertFalse(NotebookEntry.objects.filter(pk=child_entry.pk).exists())
        self.assertFalse(Entity.objects.filter(pk=child_entity.pk).exists())
        self.assertFalse(Entity.objects.filter(pk=child_result.pk).exists())
        self.assertFalse(Entity.objects.filter(pk=child_result_result.pk).exists())
        self.assertTrue(Entity.objects.filter(pk=survivor.pk).exists())
        self.assertTrue(
            Mention.objects.filter(pk=mention.pk, target_id=child_entity.pk).exists()
        )

    def test_entity_delete_cascades_results_but_not_soft_references(self):
        self.lims_schema.columns = [{"name": "linked_entity", "type": "reference"}]
        self.lims_schema.save(update_fields=["columns"])
        result = Entity.objects.create(
            name="Nested Result", schema=self.lims_schema, source=self.entity,
            folder=self.folder, author=self.user,
        )
        nested_result = Entity.objects.create(
            name="Nested Result Result", schema=self.lims_schema, source=result,
            folder=self.folder, author=self.user,
        )
        survivor = Entity.objects.create(
            name="Referencing Entity", schema=self.lims_schema,
            source=self.entry, folder=self.folder, author=self.user,
            properties={"linked_entity": self.entity.display_id},
        )

        delete_source_descendants(self.entity)
        self.entity.delete()

        self.assertFalse(Entity.objects.filter(pk=self.entity.pk).exists())
        self.assertFalse(Entity.objects.filter(pk=result.pk).exists())
        self.assertFalse(Entity.objects.filter(pk=nested_result.pk).exists())
        self.assertTrue(Entity.objects.filter(pk=survivor.pk).exists())
