"""Tests for BrowsableItem abstract model and display_id generation."""

from django.test import TestCase

from helix_core.abstracts import BrowsableItem
from helix_core.models import SchemaType, Schema
from core.models import User
from mods.eln.models import NotebookEntry
from mods.lims.models import Entity


class BrowsableItemDisplayIdTests(TestCase):
    """Display ID generation — ported from EntityDisplayIdTests."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="testuser", password="testpass")
        cls.schema_type = SchemaType.objects.create(
            display_name="Entity", workspace_id="lims", model="mods.lims.models.Entity",
        )
        cls.dna_schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=cls.schema_type,
        )
        cls.rna_schema = Schema.objects.create(
            name="RNA", prefix="RNA", schema_type=cls.schema_type,
        )

    def test_generate_display_id_on_empty_table(self):
        """First item gets prefix + 1."""
        e = Entity.objects.create(
            name="Sample A", schema=self.dna_schema, author=self.user,
        )
        self.assertEqual(e.display_id, "DNA1")

    def test_second_item_increments(self):
        """Second entity with same prefix gets DNA2."""
        Entity.objects.create(
            name="Sample A", schema=self.dna_schema, author=self.user,
        )
        e2 = Entity.objects.create(
            name="Sample B", schema=self.dna_schema, author=self.user,
        )
        self.assertEqual(e2.display_id, "DNA2")

    def test_per_prefix_independence(self):
        """Different prefixes have independent counters."""
        Entity.objects.create(
            name="Sample A", schema=self.dna_schema, author=self.user,
        )
        e2 = Entity.objects.create(
            name="Sample B", schema=self.rna_schema, author=self.user,
        )
        self.assertEqual(e2.display_id, "RNA1")

    def test_gap_tolerance(self):
        """Gaps in the sequence don't cause collisions."""
        Entity.objects.create(
            display_id="E1",
            name="Gap test 1",
            schema=self.dna_schema,
            author=self.user,
        )
        Entity.objects.create(
            display_id="E2",
            name="Gap test 2",
            schema=self.dna_schema,
            author=self.user,
        )
        Entity.objects.create(
            display_id="E9",
            name="Gap test 3",
            schema=self.dna_schema,
            author=self.user,
        )
        # Next auto-generated E-series ID should be E10, not E3.
        e4 = Entity.objects.create(
            name="Next in series", schema=self.dna_schema, author=self.user,
        )
        # The prefix for this entity_type is "DNA", so the E-series test
        # doesn't directly apply — let's test the generate_display_id method.
        next_id = Entity.generate_display_id("E")
        self.assertEqual(next_id, "E10")

    def test_display_id_already_set(self):
        """If display_id is set manually, it is not overwritten."""
        e = Entity.objects.create(
            display_id="CUSTOM1",
            name="Custom ID entity",
            schema=self.dna_schema,
            author=self.user,
        )
        self.assertEqual(e.display_id, "CUSTOM1")


class NotebookEntryDisplayIdTests(TestCase):
    """NotebookEntry display_id generation using the same BrowsableItem base."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="testuser", password="testpass")
        cls.schema_type = SchemaType.objects.create(
            display_name="ELN Entry", workspace_id="eln", model="mods.eln.models.NotebookEntry",
        )
        cls.eln_schema = Schema.objects.create(
            name="Default", prefix="E", schema_type=cls.schema_type,
        )

    def test_entry_gets_e1(self):
        """First notebook entry gets E1."""
        entry = NotebookEntry.objects.create(
            name="First entry", properties={}, author=self.user, schema=self.eln_schema,
        )
        self.assertEqual(entry.display_id, "E1")

    def test_entry_increments(self):
        """Second entry gets E2."""
        NotebookEntry.objects.create(
            name="First", properties={}, author=self.user, schema=self.eln_schema,
        )
        entry2 = NotebookEntry.objects.create(
            name="Second", properties={}, author=self.user, schema=self.eln_schema,
        )
        self.assertEqual(entry2.display_id, "E2")

    def test_entry_gap_tolerance(self):
        """Gapped entry IDs still produce the correct next ID."""
        NotebookEntry.objects.create(
            display_id="E1", name="One", properties={}, author=self.user, schema=self.eln_schema,
        )
        NotebookEntry.objects.create(
            display_id="E5", name="Five", properties={}, author=self.user, schema=self.eln_schema,
        )
        entry3 = NotebookEntry.objects.create(
            name="Should be E6", properties={}, author=self.user, schema=self.eln_schema,
        )
        self.assertEqual(entry3.display_id, "E6")


class BrowsableItemAbstractTests(TestCase):
    """Verify that BrowsableItem is truly abstract and doesn't create a table."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="testuser", password="testpass")
        cls.schema_type = SchemaType.objects.create(
            display_name="ELN Entry", workspace_id="eln", model="mods.eln.models.NotebookEntry",
        )
        cls.eln_schema = Schema.objects.create(
            name="Default", prefix="E", schema_type=cls.schema_type,
        )

    def test_cannot_instantiate_abstract_directly(self):
        """BrowsableItem has no concrete table."""
        with self.assertRaises(AttributeError):
            BrowsableItem.objects.all()

    def test_subclass_has_display_id(self):
        """Concrete subclasses get display_id from the abstract base."""
        entry = NotebookEntry.objects.create(
            name="Test", properties={}, author=self.user, schema=self.eln_schema,
        )
        self.assertTrue(hasattr(entry, "display_id"))
        self.assertTrue(hasattr(entry, "created_at"))
