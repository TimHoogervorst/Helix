"""
Tests for LIMS model behavior.

Tracer bullet: Entity auto-generates display_id from its Schema prefix.
"""
from django.test import TestCase
from django.db.utils import IntegrityError

from core.tests.base import BaseServiceTestCase
from helix_core.models import SchemaType, Schema
from mods.eln.models import NotebookEntry
from mods.lims.models import Entity


class EntityDisplayIdTests(BaseServiceTestCase):
    """Entity.save() auto-generates display_id = {prefix}{number}."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Test", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()

    def _make_schema(self, name="DNA", prefix="DNA", **kwargs):
        return Schema.objects.create(
            name=name, prefix=prefix, schema_type=self.schema_type, **kwargs,
        )

    def test_entity_auto_generates_display_id_on_create(self):
        """Creating an entity with a prefixed Schema generates display_id."""
        dna_schema = self._make_schema()
        entity = Entity.objects.create(
            name="Sample A",
            schema=dna_schema,
            folder=self.folder,
            author=self.user,
        )
        self.assertEqual(entity.display_id, "DNA1")

    def test_display_id_counter_is_per_prefix(self):
        """Each prefix has an independent auto-increment counter."""
        dna_schema = self._make_schema(name="DNA", prefix="DNA")
        blood_schema = self._make_schema(name="Blood", prefix="BLOOD")

        e1 = Entity.objects.create(
            name="DNA Sample 1", schema=dna_schema,
            folder=self.folder, author=self.user,
        )
        e2 = Entity.objects.create(
            name="Blood Sample 1", schema=blood_schema,
            folder=self.folder, author=self.user,
        )
        e3 = Entity.objects.create(
            name="DNA Sample 2", schema=dna_schema,
            folder=self.folder, author=self.user,
        )

        self.assertEqual(e1.display_id, "DNA1")
        self.assertEqual(e2.display_id, "BLOOD1")
        self.assertEqual(e3.display_id, "DNA2")

    def test_display_id_is_unique(self):
        """display_id is unique across all entities."""
        dna_schema = self._make_schema()
        Entity.objects.create(
            name="Sample A", schema=dna_schema,
            folder=self.folder, author=self.user,
        )
        # Creating a second entity with same prefix should get next number
        e2 = Entity.objects.create(
            name="Sample B", schema=dna_schema,
            folder=self.folder, author=self.user,
        )
        self.assertEqual(e2.display_id, "DNA2")

        # Directly setting a duplicate display_id should raise IntegrityError
        with self.assertRaises(IntegrityError):
            Entity.objects.create(
                name="Duplicate",
                schema=dna_schema,
                display_id="DNA1",  # already taken
                folder=self.folder,
                author=self.user,
            )


class EntityStatusCascadeFromEntryTests(BaseServiceTestCase):
    """When a NotebookEntry status changes, linked Entity rows update via post_save signal."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Test", workspace_id="lims", model="mods.lims.models.Entity",
        )
        cls.eln_schema_type = SchemaType.objects.create(
            display_name="ELN Entry", workspace_id="eln", model="mods.eln.models.NotebookEntry",
        )

    def setUp(self):
        super().setUp()
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )
        self.eln_schema = Schema.objects.create(
            name="Default", prefix="E", schema_type=self.eln_schema_type,
        )

    def test_entry_status_update_cascades_to_linked_entities(self):
        """Saving an existing entry with a new status updates linked Entity status."""
        entry = NotebookEntry.objects.create(
            name="Test Entry",
            properties={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            schema=self.eln_schema,
            status="in_progress",
        )
        entity = Entity.objects.create(
            name="Sample A",
            schema=self.dna_schema,
            source_entry=entry,
            folder=self.folder,
            author=self.user,
            status="in_progress",
        )
        # Change entry status and save
        entry.status = "finished"
        entry.save()
        entity.refresh_from_db()
        self.assertEqual(entity.status, "finished")

    def test_new_entry_creation_does_not_trigger_status_update(self):
        """Creating a new NotebookEntry does not modify linked Entity rows."""
        entry = NotebookEntry.objects.create(
            name="Test Entry",
            properties={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            schema=self.eln_schema,
            status="in_progress",
        )
        entity = Entity.objects.create(
            name="Sample A",
            schema=self.dna_schema,
            source_entry=entry,
            folder=self.folder,
            author=self.user,
            status="in_progress",
        )
        # Creating a new entry should not affect existing entities
        NotebookEntry.objects.create(
            name="Another Entry",
            properties={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            schema=self.eln_schema,
            status="finished",
        )
        entity.refresh_from_db()
        self.assertEqual(entity.status, "in_progress")  # unchanged

    def test_status_update_only_affects_entities_linked_to_that_entry(self):
        """Only entities linked to the saved entry get their status updated."""
        entry1 = NotebookEntry.objects.create(
            name="Entry 1",
            properties={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            schema=self.eln_schema,
            status="in_progress",
        )
        entry2 = NotebookEntry.objects.create(
            name="Entry 2",
            properties={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            schema=self.eln_schema,
            status="in_progress",
        )
        entity1 = Entity.objects.create(
            name="Linked to Entry 1",
            schema=self.dna_schema,
            source_entry=entry1,
            folder=self.folder,
            author=self.user,
            status="in_progress",
        )
        entity2 = Entity.objects.create(
            name="Linked to Entry 2",
            schema=self.dna_schema,
            source_entry=entry2,
            folder=self.folder,
            author=self.user,
            status="in_progress",
        )
        # Update only entry1
        entry1.status = "finished"
        entry1.save()
        entity1.refresh_from_db()
        entity2.refresh_from_db()
        self.assertEqual(entity1.status, "finished")
        self.assertEqual(entity2.status, "in_progress")  # unchanged


class EntitySourceEntryTests(BaseServiceTestCase):
    """Entity.source_entry links to the owning NotebookEntry."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Test", workspace_id="lims", model="mods.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )

    def test_entity_can_have_source_entry(self):
        """Entity.source_entry FK points to the ELN entry that owns it."""
        entry = NotebookEntry.objects.create(
            name="My Entry",
            properties={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            schema=Schema.objects.create(
                name="ELN Default", prefix="E",
                schema_type=SchemaType.objects.create(
                    display_name="ELN Entry", workspace_id="eln",
                    model="mods.eln.models.NotebookEntry",
                ),
            ),
        )
        entity = Entity.objects.create(
            name="Sample A",
            schema=self.dna_schema,
            source_entry=entry,
            folder=self.folder,
            author=self.user,
        )
        self.assertEqual(entity.source_entry, entry)
        self.assertEqual(entity.source_entry_id, entry.id)

    def test_entity_source_entry_nullable(self):
        """source_entry can be null for entities not tied to an ELN entry."""
        entity = Entity.objects.create(
            name="Standalone Sample",
            schema=self.dna_schema,
            folder=self.folder,
            author=self.user,
        )
        self.assertIsNone(entity.source_entry)


# ═══════════════════════════════════════════════════════════════════════
# Column IDs and content hash — issue #252
# ═══════════════════════════════════════════════════════════════════════


