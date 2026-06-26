"""
Tests for LIMS model behavior.

Tracer bullet: Entity auto-generates display_id from its EntityType prefix.
"""
from django.test import TestCase
from django.db.utils import IntegrityError

from core.models import Folder, User
from eln.models import NotebookEntry
from lims.models import EntityType, Entity


class EntityDisplayIdTests(TestCase):
    """Entity.save() auto-generates display_id = {prefix}{number}."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.folder = Folder.objects.create(name="Default")

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


class EntitySourceEntryTests(TestCase):
    """Entity.source_entry links to the owning NotebookEntry."""

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")
        self.folder = Folder.objects.create(name="Default")

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
