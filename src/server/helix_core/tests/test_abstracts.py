"""Tests for AbstractEntity — the shared abstract base for entity-like models.

Uses a concrete test model defined in this file to exercise the
AbstractEntity fields, _get_display_id_prefix(), and save behaviour.
"""

from django.db import connection, models
from django.test import TransactionTestCase

from core.models import Folder, User
from helix_core.abstracts import AbstractEntity
from helix_core.models import Schema, SchemaType


# ── Concrete test model ───────────────────────────────────────────────────


class ConcreteTestEntity(AbstractEntity):
    """A concrete model for testing AbstractEntity behaviour."""

    class Meta:
        app_label = "helix_core"
        db_table = "helix_test_concrete_entity"


# ── Tests ──────────────────────────────────────────────────────────────────


class AbstractEntityFieldTests(TransactionTestCase):
    """AbstractEntity provides the declared fields on concrete subclasses."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # The conftest.py session fixture may have already created this
        # table.  Only create it if it doesn't exist yet.
        from django.db.utils import OperationalError, ProgrammingError
        try:
            with connection.schema_editor() as schema_editor:
                schema_editor.create_model(ConcreteTestEntity)
        except (OperationalError, ProgrammingError):
            pass  # table already exists

    @classmethod
    def tearDownClass(cls):
        # Don't drop the table: leaving it in place avoids cascade-
        # collector failures in later tests that discover this model
        # through Django's app registry.
        super().tearDownClass()

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="pass")
        self.schema_type = SchemaType.objects.create(
            display_name="Test Type",
            workspace_id="test",
            model="helix_core.tests.test_abstracts.ConcreteTestEntity",
        )
        self.schema = Schema.objects.create(
            name="Default",
            prefix="TEST",
            schema_type=self.schema_type,
            is_default=True,
        )
        self.folder = Folder.objects.create(name="Test Folder")

    def test_create_concrete_entity(self):
        """A concrete subclass of AbstractEntity can be created with all fields."""
        entity = ConcreteTestEntity.objects.create(
            name="Test Entity",
            author=self.user,
            schema=self.schema,
            folder=self.folder,
            properties={"key": "value"},
        )
        self.assertEqual(entity.name, "Test Entity")
        self.assertEqual(entity.author, self.user)
        self.assertEqual(entity.schema, self.schema)
        self.assertEqual(entity.folder, self.folder)
        self.assertEqual(entity.properties, {"key": "value"})
        self.assertEqual(entity.status, "in_progress")  # default
        self.assertIsNotNone(entity.created_at)
        self.assertIsNotNone(entity.updated_at)

    def test_display_id_prefix_reads_from_schema(self):
        """_get_display_id_prefix() returns self.schema.prefix."""
        entity = ConcreteTestEntity.objects.create(
            name="Prefixed Entity",
            author=self.user,
            schema=self.schema,
        )
        self.assertEqual(entity._get_display_id_prefix(), "TEST")

    def test_display_id_auto_generated_from_schema_prefix(self):
        """display_id is auto-generated using the schema's prefix."""
        entity = ConcreteTestEntity.objects.create(
            name="Auto-ID Entity",
            author=self.user,
            schema=self.schema,
        )
        self.assertEqual(entity.display_id, "TEST1")

    def test_display_id_counter_is_per_prefix(self):
        """Each schema prefix has an independent auto-increment counter."""
        schema2 = Schema.objects.create(
            name="Other",
            prefix="OTHER",
            schema_type=self.schema_type,
        )
        e1 = ConcreteTestEntity.objects.create(
            name="First", author=self.user, schema=self.schema
        )
        e2 = ConcreteTestEntity.objects.create(
            name="Second", author=self.user, schema=schema2
        )
        e3 = ConcreteTestEntity.objects.create(
            name="Third", author=self.user, schema=self.schema
        )
        self.assertEqual(e1.display_id, "TEST1")
        self.assertEqual(e2.display_id, "OTHER1")
        self.assertEqual(e3.display_id, "TEST2")

    def test_status_defaults_to_in_progress(self):
        """New entities default to 'in_progress' status."""
        entity = ConcreteTestEntity.objects.create(
            name="Status Test",
            author=self.user,
            schema=self.schema,
        )
        self.assertEqual(entity.status, "in_progress")

    def test_status_can_be_set_to_finished(self):
        """Status can be explicitly set to 'finished'."""
        entity = ConcreteTestEntity.objects.create(
            name="Finished Entity",
            author=self.user,
            schema=self.schema,
            status="finished",
        )
        self.assertEqual(entity.status, "finished")

    def test_last_editor_nullable(self):
        """last_editor is nullable and defaults to None."""
        entity = ConcreteTestEntity.objects.create(
            name="No Editor",
            author=self.user,
            schema=self.schema,
        )
        self.assertIsNone(entity.last_editor)

    def test_last_editor_can_be_set(self):
        """last_editor can be set to a different user."""
        editor = User.objects.create_user(username="editor", password="pass")
        entity = ConcreteTestEntity.objects.create(
            name="Edited Entity",
            author=self.user,
            last_editor=editor,
            schema=self.schema,
        )
        self.assertEqual(entity.last_editor, editor)

    def test_folder_nullable(self):
        """folder is nullable."""
        entity = ConcreteTestEntity.objects.create(
            name="No Folder",
            author=self.user,
            schema=self.schema,
        )
        self.assertIsNone(entity.folder)

    def test_project_nullable(self):
        """project is nullable (placeholder FK)."""
        entity = ConcreteTestEntity.objects.create(
            name="No Project",
            author=self.user,
            schema=self.schema,
        )
        self.assertIsNone(entity.project)

    def test_properties_defaults_to_empty_dict(self):
        """properties defaults to an empty dict."""
        entity = ConcreteTestEntity.objects.create(
            name="No Props",
            author=self.user,
            schema=self.schema,
        )
        self.assertEqual(entity.properties, {})

    def test_updated_at_changes_on_save(self):
        """updated_at is updated on every save."""
        import time

        entity = ConcreteTestEntity.objects.create(
            name="Update Test",
            author=self.user,
            schema=self.schema,
        )
        original_updated_at = entity.updated_at

        # SQLite has second-level precision, so ensure time advances.
        time.sleep(0.01)

        entity.name = "Updated Name"
        entity.save()
        entity.refresh_from_db()

        self.assertNotEqual(entity.updated_at, original_updated_at)

    def test_name_max_length_500(self):
        """name field accepts up to 500 characters."""
        long_name = "A" * 500
        entity = ConcreteTestEntity.objects.create(
            name=long_name,
            author=self.user,
            schema=self.schema,
        )
        self.assertEqual(len(entity.name), 500)

    def test_abstract_entity_is_abstract(self):
        """AbstractEntity itself is abstract (Meta.abstract = True)."""
        self.assertTrue(AbstractEntity._meta.abstract)

    def test_schema_is_protected_on_delete(self):
        """Schema FK uses PROTECT — cannot delete a Schema that is in use."""
        ConcreteTestEntity.objects.create(
            name="Protected Entity",
            author=self.user,
            schema=self.schema,
        )
        from django.db.models.deletion import ProtectedError

        with self.assertRaises(ProtectedError):
            self.schema.delete()
