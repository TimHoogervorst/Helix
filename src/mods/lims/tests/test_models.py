"""
Tests for LIMS model behavior.

Tracer bullet: Entity auto-generates display_id from its EntityType prefix.
"""
from django.test import TestCase
from django.db.utils import IntegrityError

from core.tests.base import BaseServiceTestCase
from mods.eln.models import NotebookEntry
from mods.lims.models import EntityType, Entity


class EntityDisplayIdTests(BaseServiceTestCase):
    """Entity.save() auto-generates display_id = {prefix}{number}."""

    def setUp(self):
        super().setUp()

    def test_entity_auto_generates_display_id_on_create(self):
        """Creating an entity with a prefixed EntityType generates display_id."""
        dna_type = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])
        entity = Entity.objects.create(
            name="Sample A",
            entity_type=dna_type,
            folder=self.folder,
            created_by=self.user,
        )
        self.assertEqual(entity.display_id, "DNA1")

    def test_display_id_counter_is_per_prefix(self):
        """Each prefix has an independent auto-increment counter."""
        dna_type = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])
        blood_type = EntityType.objects.create(name="Blood", prefix="BLOOD", columns=[])

        e1 = Entity.objects.create(
            name="DNA Sample 1", entity_type=dna_type,
            folder=self.folder, created_by=self.user,
        )
        e2 = Entity.objects.create(
            name="Blood Sample 1", entity_type=blood_type,
            folder=self.folder, created_by=self.user,
        )
        e3 = Entity.objects.create(
            name="DNA Sample 2", entity_type=dna_type,
            folder=self.folder, created_by=self.user,
        )

        self.assertEqual(e1.display_id, "DNA1")
        self.assertEqual(e2.display_id, "BLOOD1")
        self.assertEqual(e3.display_id, "DNA2")

    def test_display_id_is_unique(self):
        """display_id is unique across all entities."""
        dna_type = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])
        Entity.objects.create(
            name="Sample A", entity_type=dna_type,
            folder=self.folder, created_by=self.user,
        )
        # Creating a second entity with same prefix should get next number
        e2 = Entity.objects.create(
            name="Sample B", entity_type=dna_type,
            folder=self.folder, created_by=self.user,
        )
        self.assertEqual(e2.display_id, "DNA2")

        # Directly setting a duplicate display_id should raise IntegrityError
        with self.assertRaises(IntegrityError):
            Entity.objects.create(
                name="Duplicate",
                entity_type=dna_type,
                display_id="DNA1",  # already taken
                folder=self.folder,
                created_by=self.user,
            )


class EntityTypeSchemaTests(TestCase):
    """EntityType supports prefix, columns, and is_active."""

    def test_entity_type_has_prefix_columns_and_is_active(self):
        """EntityType fields: prefix (uppercase, unique), columns (JSON), is_active (bool)."""
        et = EntityType.objects.create(
            name="Blood Sample",
            prefix="BLOOD",
            columns=[
                {"name": "volume", "type": "Number", "required": True},
                {"name": "patient", "type": "Text", "required": False},
            ],
        )
        self.assertEqual(et.prefix, "BLOOD")
        self.assertEqual(len(et.columns), 2)
        self.assertEqual(et.columns[0]["name"], "volume")
        self.assertTrue(et.is_active)

    def test_prefix_must_be_unique(self):
        """Two entity types cannot share the same prefix."""
        EntityType.objects.create(name="DNA", prefix="DNA", columns=[])
        with self.assertRaises(IntegrityError):
            EntityType.objects.create(name="DNA V2", prefix="DNA", columns=[])


class EntityStatusCascadeFromEntryTests(BaseServiceTestCase):
    """When a NotebookEntry status changes, linked Entity rows update via post_save signal."""

    def setUp(self):
        super().setUp()
        self.dna_type = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])

    def test_entry_status_update_cascades_to_linked_entities(self):
        """Saving an existing entry with a new status updates linked Entity status."""
        entry = NotebookEntry.objects.create(
            title="Test Entry",
            content={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            status="in_progress",
        )
        entity = Entity.objects.create(
            name="Sample A",
            entity_type=self.dna_type,
            source_entry=entry,
            folder=self.folder,
            created_by=self.user,
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
            title="Test Entry",
            content={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            status="in_progress",
        )
        entity = Entity.objects.create(
            name="Sample A",
            entity_type=self.dna_type,
            source_entry=entry,
            folder=self.folder,
            created_by=self.user,
            status="in_progress",
        )
        # Creating a new entry should not affect existing entities
        NotebookEntry.objects.create(
            title="Another Entry",
            content={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            status="finished",
        )
        entity.refresh_from_db()
        self.assertEqual(entity.status, "in_progress")  # unchanged

    def test_status_update_only_affects_entities_linked_to_that_entry(self):
        """Only entities linked to the saved entry get their status updated."""
        entry1 = NotebookEntry.objects.create(
            title="Entry 1",
            content={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            status="in_progress",
        )
        entry2 = NotebookEntry.objects.create(
            title="Entry 2",
            content={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
            status="in_progress",
        )
        entity1 = Entity.objects.create(
            name="Linked to Entry 1",
            entity_type=self.dna_type,
            source_entry=entry1,
            folder=self.folder,
            created_by=self.user,
            status="in_progress",
        )
        entity2 = Entity.objects.create(
            name="Linked to Entry 2",
            entity_type=self.dna_type,
            source_entry=entry2,
            folder=self.folder,
            created_by=self.user,
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

    def setUp(self):
        super().setUp()

    def test_entity_can_have_source_entry(self):
        """Entity.source_entry FK points to the ELN entry that owns it."""
        entry = NotebookEntry.objects.create(
            title="My Entry",
            content={"type": "doc", "content": [{"type": "paragraph"}]},
            folder=self.folder,
            author=self.user,
        )
        dna_type = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])
        entity = Entity.objects.create(
            name="Sample A",
            entity_type=dna_type,
            source_entry=entry,
            folder=self.folder,
            created_by=self.user,
        )
        self.assertEqual(entity.source_entry, entry)
        self.assertEqual(entity.source_entry_id, entry.id)

    def test_entity_source_entry_nullable(self):
        """source_entry can be null for entities not tied to an ELN entry."""
        dna_type = EntityType.objects.create(name="DNA", prefix="DNA", columns=[])
        entity = Entity.objects.create(
            name="Standalone Sample",
            entity_type=dna_type,
            folder=self.folder,
            created_by=self.user,
        )
        self.assertIsNone(entity.source_entry)


# ═══════════════════════════════════════════════════════════════════════
# Column IDs and content hash — issue #252
# ═══════════════════════════════════════════════════════════════════════


class EntityTypeColumnIdTests(TestCase):
    """Column UUID ids are generated and preserved across saves."""

    def test_columns_receive_ids_on_create(self):
        """Each column gets a UUID id upon creation."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[
                {"name": "volume", "type": "Number"},
                {"name": "colour", "type": "Text"},
            ],
        )
        self.assertEqual(len(et.columns), 2)
        for col in et.columns:
            self.assertIn("id", col)
            self.assertEqual(len(col["id"]), 36)  # UUID string length

    def test_existing_column_ids_preserved_on_update(self):
        """Columns that already have an id keep it across saves."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number"}],
        )
        original_id = et.columns[0]["id"]

        # Update the entity type — same columns
        et.name = "Test Type Updated"
        et.save()

        et.refresh_from_db()
        self.assertEqual(et.columns[0]["id"], original_id)

    def test_new_columns_receive_new_ids_on_update(self):
        """Columns added during an update get fresh UUIDs."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number"}],
        )
        original_id = et.columns[0]["id"]

        # Add a new column
        et.columns.append({"name": "colour", "type": "Text"})
        et.save()

        et.refresh_from_db()
        self.assertEqual(len(et.columns), 2)
        # Original column keeps its ID
        self.assertEqual(et.columns[0]["id"], original_id)
        # New column gets an ID
        self.assertIn("id", et.columns[1])
        self.assertEqual(len(et.columns[1]["id"]), 36)
        self.assertNotEqual(et.columns[1]["id"], original_id)

    def test_column_ids_are_unique(self):
        """Every column gets a distinct UUID."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[
                {"name": "a", "type": "Text"},
                {"name": "b", "type": "Text"},
                {"name": "c", "type": "Text"},
            ],
        )
        ids = [col["id"] for col in et.columns]
        self.assertEqual(len(ids), len(set(ids)))  # all unique


class EntityTypeContentHashTests(TestCase):
    """content_hash is computed from column definitions on every save."""

    def test_content_hash_is_set_on_create(self):
        """content_hash is non-empty after creation."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number"}],
        )
        self.assertTrue(et.content_hash)
        self.assertEqual(len(et.content_hash), 64)  # SHA-256 hex digest

    def test_content_hash_empty_for_no_columns(self):
        """An entity type with no columns still gets a content_hash."""
        et = EntityType.objects.create(name="Test Type", prefix="TEST", columns=[])
        self.assertTrue(et.content_hash)
        self.assertEqual(len(et.content_hash), 64)

    def test_content_hash_changes_when_columns_change(self):
        """Modifying columns produces a different hash."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number"}],
        )
        hash1 = et.content_hash

        et.columns = [{"name": "volume", "type": "Number"}, {"name": "colour", "type": "Text"}]
        et.save()
        et.refresh_from_db()

        self.assertNotEqual(et.content_hash, hash1)

    def test_content_hash_changes_when_column_order_changes(self):
        """Reordering columns produces a different hash."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[
                {"name": "volume", "type": "Number"},
                {"name": "colour", "type": "Text"},
            ],
        )
        hash1 = et.content_hash

        # Reverse order
        et.columns = [
            {"name": "colour", "type": "Text"},
            {"name": "volume", "type": "Number"},
        ]
        et.save()
        et.refresh_from_db()

        self.assertNotEqual(et.content_hash, hash1)

    def test_content_hash_ignores_description_field(self):
        """Changing only description does not change the content hash."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number", "description": "The volume in mL"}],
        )
        hash1 = et.content_hash

        et.columns[0]["description"] = "Updated description"
        et.save()
        et.refresh_from_db()

        self.assertEqual(et.content_hash, hash1)

    def test_content_hash_same_for_identical_columns(self):
        """Two entity types with identical column definitions have the same hash."""
        columns = [{"name": "volume", "type": "Number", "required": True, "units": "mL"}]
        et1 = EntityType.objects.create(name="Type A", prefix="TYPEA", columns=columns)
        et2 = EntityType.objects.create(name="Type B", prefix="TYPEB", columns=columns)

        self.assertEqual(et1.content_hash, et2.content_hash)

    def test_content_hash_stable_across_saves(self):
        """Saving without changes produces the same hash."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number"}],
        )
        hash1 = et.content_hash

        # Save again without any changes
        et.save()
        et.refresh_from_db()

        self.assertEqual(et.content_hash, hash1)

    def test_content_hash_includes_column_ids(self):
        """The hash covers column IDs so regenerated IDs change the hash."""
        et = EntityType.objects.create(
            name="Test Type",
            prefix="TEST",
            columns=[{"name": "volume", "type": "Number"}],
        )
        hash1 = et.content_hash

        # Manually change the column ID and re-save (simulates a new column)
        import uuid
        et.columns[0]["id"] = str(uuid.uuid4())
        et.save()
        et.refresh_from_db()

        self.assertNotEqual(et.content_hash, hash1)
