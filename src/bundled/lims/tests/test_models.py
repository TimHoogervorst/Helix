"""LIMS-specific guarantees of the shared Entity model."""

from django.db.utils import IntegrityError

from helix_core.core.tests.base import BaseServiceTestCase
from helix_core.models import Schema, SchemaType
from bundled.lims.models import Entity


class EntityDisplayIdTests(BaseServiceTestCase):
    """Entity.save() assigns IDs from its schema prefix."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Test", workspace_id="lims", model="bundled.lims.models.Entity",
        )

    def _make_schema(self, name="DNA", prefix="DNA"):
        return Schema.objects.create(
            name=name, prefix=prefix, schema_type=self.schema_type,
        )

    def test_entity_auto_generates_display_id_on_create(self):
        schema = self._make_schema()
        entity = Entity.objects.create(
            name="Sample A", schema=schema, source=self.folder, author=self.user,
        )

        self.assertEqual(entity.display_id, "DNA1")

    def test_display_id_counter_is_per_prefix(self):
        dna_schema = self._make_schema(name="DNA", prefix="DNA")
        blood_schema = self._make_schema(name="Blood", prefix="BLOOD")

        dna_one = Entity.objects.create(
            name="DNA Sample 1", schema=dna_schema, source=self.folder, author=self.user,
        )
        blood_one = Entity.objects.create(
            name="Blood Sample 1", schema=blood_schema, source=self.folder, author=self.user,
        )
        dna_two = Entity.objects.create(
            name="DNA Sample 2", schema=dna_schema, source=self.folder, author=self.user,
        )

        self.assertEqual((dna_one.display_id, blood_one.display_id, dna_two.display_id),
                         ("DNA1", "BLOOD1", "DNA2"))

    def test_display_id_is_unique(self):
        schema = self._make_schema()
        Entity.objects.create(
            name="Sample A", schema=schema, source=self.folder, author=self.user,
        )
        entity = Entity.objects.create(
            name="Sample B", schema=schema, source=self.folder, author=self.user,
        )
        self.assertEqual(entity.display_id, "DNA2")

        with self.assertRaises(IntegrityError):
            Entity.objects.create(
                name="Duplicate", schema=schema, display_id="DNA1",
                source=self.folder, author=self.user,
            )


class EntitySourceTests(BaseServiceTestCase):
    """Entity placement uses the generic Source reference, without ELN models."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.schema_type = SchemaType.objects.create(
            display_name="Test", workspace_id="lims", model="bundled.lims.models.Entity",
        )

    def setUp(self):
        super().setUp()
        self.schema = Schema.objects.create(
            name="DNA", prefix="DNA", schema_type=self.schema_type,
        )

    def test_entity_can_source_from_folder(self):
        entity = Entity.objects.create(
            name="Sample A", schema=self.schema, source=self.folder, author=self.user,
        )

        self.assertEqual(entity.source, self.folder)
        self.assertEqual(entity.source_id, self.folder.id)

    def test_entity_defaults_to_project_source(self):
        entity = Entity.objects.create(
            name="Standalone Sample", schema=self.schema,
            project=self.project, author=self.user,
        )

        self.assertEqual(entity.source, self.project)
