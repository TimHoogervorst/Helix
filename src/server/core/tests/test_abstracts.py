"""Tests for BrowsableItem abstract model and display_id generation."""

from django.test import TestCase

from helix_core.abstracts import BrowsableItem
from core_mods.eln.models import NotebookEntry
from core_mods.lims.models import Entity, EntityType


class BrowsableItemDisplayIdTests(TestCase):
    """Display ID generation — ported from EntityDisplayIdTests."""

    @classmethod
    def setUpTestData(cls):
        cls.dna_type = EntityType.objects.create(
            name="DNA", prefix="DNA"
        )
        cls.rna_type = EntityType.objects.create(
            name="RNA", prefix="RNA"
        )

    def test_generate_display_id_on_empty_table(self):
        """First item gets prefix + 1."""
        e = Entity.objects.create(
            name="Sample A", entity_type=self.dna_type
        )
        self.assertEqual(e.display_id, "DNA1")

    def test_second_item_increments(self):
        """Second entity with same prefix gets DNA2."""
        Entity.objects.create(name="Sample A", entity_type=self.dna_type)
        e2 = Entity.objects.create(
            name="Sample B", entity_type=self.dna_type
        )
        self.assertEqual(e2.display_id, "DNA2")

    def test_per_prefix_independence(self):
        """Different prefixes have independent counters."""
        Entity.objects.create(name="Sample A", entity_type=self.dna_type)
        e2 = Entity.objects.create(
            name="Sample B", entity_type=self.rna_type
        )
        self.assertEqual(e2.display_id, "RNA1")

    def test_gap_tolerance(self):
        """Gaps in the sequence don't cause collisions."""
        Entity.objects.create(
            display_id="E1",
            name="Gap test 1",
            entity_type=self.dna_type,
        )
        Entity.objects.create(
            display_id="E2",
            name="Gap test 2",
            entity_type=self.dna_type,
        )
        Entity.objects.create(
            display_id="E9",
            name="Gap test 3",
            entity_type=self.dna_type,
        )
        # Next auto-generated E-series ID should be E10, not E3.
        e4 = Entity.objects.create(
            name="Next in series", entity_type=self.dna_type
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
            entity_type=self.dna_type,
        )
        self.assertEqual(e.display_id, "CUSTOM1")


class NotebookEntryDisplayIdTests(TestCase):
    """NotebookEntry display_id generation using the same BrowsableItem base."""

    def test_entry_gets_e1(self):
        """First notebook entry gets E1."""
        entry = NotebookEntry.objects.create(
            title="First entry", content={}
        )
        self.assertEqual(entry.display_id, "E1")

    def test_entry_increments(self):
        """Second entry gets E2."""
        NotebookEntry.objects.create(title="First", content={})
        entry2 = NotebookEntry.objects.create(title="Second", content={})
        self.assertEqual(entry2.display_id, "E2")

    def test_entry_gap_tolerance(self):
        """Gapped entry IDs still produce the correct next ID."""
        NotebookEntry.objects.create(
            display_id="E1", title="One", content={}
        )
        NotebookEntry.objects.create(
            display_id="E5", title="Five", content={}
        )
        entry3 = NotebookEntry.objects.create(
            title="Should be E6", content={}
        )
        self.assertEqual(entry3.display_id, "E6")


class BrowsableItemAbstractTests(TestCase):
    """Verify that BrowsableItem is truly abstract and doesn't create a table."""

    def test_cannot_instantiate_abstract_directly(self):
        """BrowsableItem has no concrete table."""
        with self.assertRaises(AttributeError):
            BrowsableItem.objects.all()

    def test_subclass_has_display_id(self):
        """Concrete subclasses get display_id from the abstract base."""
        entry = NotebookEntry.objects.create(title="Test", content={})
        self.assertTrue(hasattr(entry, "display_id"))
        self.assertTrue(hasattr(entry, "created_at"))
