"""Tests for helix_core SchemaType and Schema models.

Covers CRUD via Django ORM, column IDs, content hash, prefix uniqueness,
and the relationship between SchemaType and Schema.
"""

from django.db.utils import IntegrityError
from django.test import TestCase

from helix_core.models import Schema, SchemaType


# ── SchemaType CRUD ─────────────────────────────────────────────────────────


class SchemaTypeCRUDTests(TestCase):
    """Basic CRUD operations on SchemaType."""

    def test_create_schema_type(self):
        """SchemaType can be created with all fields."""
        st = SchemaType.objects.create(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
            columns=[
                {"name": "volume", "type": "number", "required": True},
            ],
        )
        self.assertEqual(st.display_name, "Entity")
        self.assertEqual(st.workspace_id, "lims")
        self.assertEqual(st.model, "mods.lims.models.Entity")
        self.assertEqual(len(st.columns), 1)
        self.assertTrue(st.is_active)
        self.assertTrue(st.content_hash)

    def test_schema_type_str(self):
        """SchemaType __str__ includes display_name and workspace_id."""
        st = SchemaType.objects.create(
            display_name="Sample",
            workspace_id="eln",
            model="mods.eln.models.Entry",
        )
        self.assertIn("Sample", str(st))
        self.assertIn("eln", str(st))

    def test_schema_type_ordering(self):
        """SchemaTypes are ordered by display_name."""
        SchemaType.objects.create(
            display_name="Beta", workspace_id="ws", model="m.B"
        )
        SchemaType.objects.create(
            display_name="Alpha", workspace_id="ws", model="m.A"
        )
        names = list(
            SchemaType.objects.values_list("display_name", flat=True)
        )
        self.assertEqual(names, ["Alpha", "Beta"])

    def test_schema_type_is_active_defaults_true(self):
        """New SchemaTypes are active by default."""
        st = SchemaType.objects.create(
            display_name="Test", workspace_id="ws", model="m.T"
        )
        self.assertTrue(st.is_active)

    def test_schema_type_can_be_deactivated(self):
        """is_active can be set to False for soft-delete."""
        st = SchemaType.objects.create(
            display_name="Test", workspace_id="ws", model="m.T", is_active=False
        )
        self.assertFalse(st.is_active)


# ── Schema CRUD ─────────────────────────────────────────────────────────────


class SchemaCRUDTests(TestCase):
    """Basic CRUD operations on Schema."""

    def setUp(self):
        self.schema_type = SchemaType.objects.create(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
        )

    def test_create_schema(self):
        """Schema can be created linked to a SchemaType."""
        schema = Schema.objects.create(
            name="Default",
            prefix="E",
            schema_type=self.schema_type,
            is_default=True,
        )
        self.assertEqual(schema.name, "Default")
        self.assertEqual(schema.prefix, "E")
        self.assertEqual(schema.schema_type, self.schema_type)
        self.assertTrue(schema.is_default)
        self.assertTrue(schema.is_active)

    def test_schema_str(self):
        """Schema __str__ includes name and prefix."""
        schema = Schema.objects.create(
            name="DNA Schema",
            prefix="DNA",
            schema_type=self.schema_type,
        )
        self.assertIn("DNA Schema", str(schema))
        self.assertIn("DNA", str(schema))

    def test_schema_ordering(self):
        """Schemas are ordered by schema_type then name."""
        st2 = SchemaType.objects.create(
            display_name="Other", workspace_id="ws", model="m.O"
        )
        Schema.objects.create(
            name="Beta", prefix="B", schema_type=self.schema_type
        )
        Schema.objects.create(
            name="Alpha", prefix="A", schema_type=self.schema_type
        )
        Schema.objects.create(
            name="Gamma", prefix="G", schema_type=st2
        )
        names = list(Schema.objects.values_list("name", flat=True))
        # Within the same schema_type, Alpha then Beta; then st2's Gamma
        self.assertEqual(names, ["Alpha", "Beta", "Gamma"])

    def test_prefix_must_be_unique(self):
        """Two schemas cannot share the same prefix."""
        Schema.objects.create(
            name="Schema A", prefix="UNIQ", schema_type=self.schema_type
        )
        with self.assertRaises(IntegrityError):
            Schema.objects.create(
                name="Schema B", prefix="UNIQ", schema_type=self.schema_type
            )

    def test_schema_default_flag(self):
        """is_default is False by default and can be set to True."""
        schema = Schema.objects.create(
            name="Non-Default", prefix="ND", schema_type=self.schema_type
        )
        self.assertFalse(schema.is_default)

        schema.is_default = True
        schema.save()
        schema.refresh_from_db()
        self.assertTrue(schema.is_default)

    def test_schema_type_related_name(self):
        """SchemaType.schemas returns related Schema rows."""
        s1 = Schema.objects.create(
            name="First", prefix="FST", schema_type=self.schema_type
        )
        s2 = Schema.objects.create(
            name="Second", prefix="SND", schema_type=self.schema_type
        )
        schemas = list(self.schema_type.schemas.all())
        self.assertIn(s1, schemas)
        self.assertIn(s2, schemas)
        self.assertEqual(len(schemas), 2)


# ── Column IDs ──────────────────────────────────────────────────────────────


class SchemaTypeColumnIdTests(TestCase):
    """Column UUID ids are generated and preserved across saves."""

    def test_columns_receive_ids_on_create(self):
        """Each column gets a UUID id upon creation."""
        st = SchemaType.objects.create(
            display_name="Test",
            workspace_id="ws",
            model="m.T",
            columns=[
                {"name": "volume", "type": "number"},
                {"name": "colour", "type": "text"},
            ],
        )
        self.assertEqual(len(st.columns), 2)
        for col in st.columns:
            self.assertIn("id", col)
            self.assertEqual(len(col["id"]), 36)  # UUID string length

    def test_existing_column_ids_preserved_on_update(self):
        """Columns that already have an id keep it across saves."""
        st = SchemaType.objects.create(
            display_name="Test",
            workspace_id="ws",
            model="m.T",
            columns=[{"name": "volume", "type": "number"}],
        )
        original_id = st.columns[0]["id"]

        st.display_name = "Updated"
        st.save()
        st.refresh_from_db()

        self.assertEqual(st.columns[0]["id"], original_id)

    def test_new_columns_receive_new_ids_on_update(self):
        """Columns added during an update get fresh UUIDs."""
        st = SchemaType.objects.create(
            display_name="Test",
            workspace_id="ws",
            model="m.T",
            columns=[{"name": "volume", "type": "number"}],
        )
        original_id = st.columns[0]["id"]

        st.columns.append({"name": "colour", "type": "text"})
        st.save()
        st.refresh_from_db()

        self.assertEqual(len(st.columns), 2)
        self.assertEqual(st.columns[0]["id"], original_id)
        self.assertIn("id", st.columns[1])
        self.assertEqual(len(st.columns[1]["id"]), 36)
        self.assertNotEqual(st.columns[1]["id"], original_id)

    def test_column_ids_are_unique(self):
        """Every column gets a distinct UUID."""
        st = SchemaType.objects.create(
            display_name="Test",
            workspace_id="ws",
            model="m.T",
            columns=[
                {"name": "a", "type": "text"},
                {"name": "b", "type": "text"},
                {"name": "c", "type": "text"},
            ],
        )
        ids = [col["id"] for col in st.columns]
        self.assertEqual(len(ids), len(set(ids)))


class SchemaColumnIdTests(TestCase):
    """Schema models also get column ID handling via the save hook."""

    def setUp(self):
        self.schema_type = SchemaType.objects.create(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
        )

    def test_schema_columns_receive_ids_on_create(self):
        """Schema columns also get UUID ids."""
        schema = Schema.objects.create(
            name="Default",
            prefix="E",
            schema_type=self.schema_type,
            columns=[
                {"name": "volume", "type": "number"},
            ],
        )
        self.assertIn("id", schema.columns[0])
        self.assertEqual(len(schema.columns[0]["id"]), 36)


# ── Content Hash ────────────────────────────────────────────────────────────


class SchemaTypeContentHashTests(TestCase):
    """content_hash is computed from column definitions on every save."""

    def test_content_hash_is_set_on_create(self):
        """content_hash is non-empty after creation."""
        st = SchemaType.objects.create(
            display_name="Test",
            workspace_id="ws",
            model="m.T",
            columns=[{"name": "volume", "type": "number"}],
        )
        self.assertTrue(st.content_hash)
        self.assertEqual(len(st.content_hash), 64)  # SHA-256 hex digest

    def test_content_hash_empty_for_no_columns(self):
        """A schema type with no columns still gets a content_hash."""
        st = SchemaType.objects.create(
            display_name="Test", workspace_id="ws", model="m.T", columns=[]
        )
        self.assertTrue(st.content_hash)
        self.assertEqual(len(st.content_hash), 64)

    def test_content_hash_changes_when_columns_change(self):
        """Modifying columns produces a different hash."""
        st = SchemaType.objects.create(
            display_name="Test",
            workspace_id="ws",
            model="m.T",
            columns=[{"name": "volume", "type": "number"}],
        )
        hash1 = st.content_hash

        st.columns = [
            {"name": "volume", "type": "number"},
            {"name": "colour", "type": "text"},
        ]
        st.save()
        st.refresh_from_db()

        self.assertNotEqual(st.content_hash, hash1)

    def test_content_hash_ignores_description_field(self):
        """Changing only description does not change the content hash."""
        st = SchemaType.objects.create(
            display_name="Test",
            workspace_id="ws",
            model="m.T",
            columns=[
                {
                    "name": "volume",
                    "type": "number",
                    "description": "The volume in mL",
                }
            ],
        )
        hash1 = st.content_hash

        st.columns[0]["description"] = "Updated description"
        st.save()
        st.refresh_from_db()

        self.assertEqual(st.content_hash, hash1)

    def test_content_hash_stable_across_saves(self):
        """Saving without changes produces the same hash."""
        st = SchemaType.objects.create(
            display_name="Test",
            workspace_id="ws",
            model="m.T",
            columns=[{"name": "volume", "type": "number"}],
        )
        hash1 = st.content_hash

        st.save()
        st.refresh_from_db()

        self.assertEqual(st.content_hash, hash1)


class SchemaContentHashTests(TestCase):
    """Schema content_hash works identically to SchemaType."""

    def setUp(self):
        self.schema_type = SchemaType.objects.create(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
        )

    def test_schema_content_hash_is_set(self):
        """Schema gets a content_hash on create."""
        schema = Schema.objects.create(
            name="Default",
            prefix="E",
            schema_type=self.schema_type,
            columns=[{"name": "volume", "type": "number"}],
        )
        self.assertTrue(schema.content_hash)
        self.assertEqual(len(schema.content_hash), 64)

    def test_schema_content_hash_changes_when_columns_change(self):
        """Modifying Schema columns produces a different hash."""
        schema = Schema.objects.create(
            name="Default",
            prefix="E",
            schema_type=self.schema_type,
            columns=[{"name": "volume", "type": "number"}],
        )
        hash1 = schema.content_hash

        schema.columns.append({"name": "colour", "type": "text"})
        schema.save()
        schema.refresh_from_db()

        self.assertNotEqual(schema.content_hash, hash1)
