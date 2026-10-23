"""Generic BrowsableItem contracts using the Platform-owned fixture entity."""

from django.test import TestCase

from helix_core.abstracts import AbstractEntity, BrowsableItem
from helix_core.core.models import Folder, Project, User
from helix_core.models import Schema, SchemaType
from helix_core.tests.fixtures.external_mod.models import ConcreteTestEntity


class BrowsableItemDisplayIdTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="abstract_test", password="pass")
        cls.project = Project.objects.create(name="Abstract Project")
        cls.folder = Folder.objects.create(
            name="Root", parent=None, project=cls.project
        )
        cls.schema_type = SchemaType.objects.create(
            display_name="Fixture Entity",
            workspace_id="test.external",
            model="helix_core.tests.fixtures.external_mod.models.ConcreteTestEntity",
        )
        cls.schema = Schema.objects.create(
            name="Fixture", prefix="FX", schema_type=cls.schema_type
        )

    def make_entity(self, **values):
        return ConcreteTestEntity.objects.create(
            name="Fixture Entity",
            author=self.user,
            schema=self.schema,
            source=self.folder,
            **values,
        )

    def test_fixture_entity_uses_schema_prefix_for_display_id(self):
        entity = self.make_entity()

        self.assertEqual(entity.display_id, "FX1")
        self.assertEqual(entity._get_display_id_prefix(), "FX")

    def test_generated_display_ids_increment_per_prefix(self):
        first = self.make_entity()
        second = self.make_entity()
        other_schema = Schema.objects.create(
            name="Other", prefix="ALT", schema_type=self.schema_type
        )
        other = ConcreteTestEntity.objects.create(
            name="Other prefix",
            author=self.user,
            schema=other_schema,
            source=self.folder,
        )

        self.assertEqual(first.display_id, "FX1")
        self.assertEqual(second.display_id, "FX2")
        self.assertEqual(other.display_id, "ALT1")

    def test_gaps_in_existing_ids_do_not_create_collisions(self):
        self.make_entity(display_id="FX1")
        self.make_entity(display_id="FX5")

        next_entity = self.make_entity()

        self.assertEqual(next_entity.display_id, "FX6")

    def test_explicit_display_id_is_preserved(self):
        entity = self.make_entity(display_id="CUSTOM-42")

        self.assertEqual(entity.display_id, "CUSTOM-42")

    def test_browsable_item_remains_abstract(self):
        self.assertTrue(BrowsableItem._meta.abstract)
        self.assertTrue(AbstractEntity._meta.abstract)
        with self.assertRaises(AttributeError):
            BrowsableItem.objects.all()
