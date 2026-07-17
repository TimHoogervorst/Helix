"""
Tests for the column-ID + content-hash backfill migration (issue #252).
"""
from importlib import import_module

from django.test import TestCase

from mods.lims.models import EntityType

# Import the migration function by dotted path to avoid line-continuation
# issues with numeric-leading module names.
_backfill_func = import_module(
    "mods.lims.migrations.0004_backfill_column_ids_and_hash"
).backfill_column_ids_and_hash


class BackfillColumnIdsAndHashTests(TestCase):
    """Verify the data migration backfills column IDs and content_hash."""

    def test_migration_assigns_column_ids(self):
        """Migration backfills UUID ids on columns that lack them."""
        # Simulate pre-migration state: columns without ids
        et = EntityType.objects.create(
            name="Pre Migration",
            prefix="PREMIG",
            columns=[{"name": "volume", "type": "Number"}],
        )
        # Manually strip the ids that the model's save() adds
        EntityType.objects.filter(pk=et.pk).update(
            columns=[{"name": "volume", "type": "Number"}],
            content_hash="",
        )
        et.refresh_from_db()
        self.assertEqual(et.content_hash, "")

        # We need a mock for apps.get_model — use the real model
        class MockApps:
            @staticmethod
            def get_model(app_label, model_name):
                if app_label == "lims" and model_name == "EntityType":
                    return EntityType
                raise ValueError(f"Unknown model: {app_label}.{model_name}")

        _backfill_func(MockApps(), None)

        et.refresh_from_db()
        self.assertEqual(len(et.columns), 1)
        self.assertIn("id", et.columns[0])
        self.assertEqual(len(et.columns[0]["id"]), 36)
        self.assertTrue(et.content_hash)
        self.assertEqual(len(et.content_hash), 64)

    def test_migration_preserves_existing_column_ids(self):
        """Migration does not overwrite column IDs that already exist."""
        et = EntityType.objects.create(
            name="Already Has IDs",
            prefix="HASIDS",
            columns=[{"id": "abc-123", "name": "volume", "type": "Number"}],
        )
        # Clear the content_hash to simulate pre-migration state
        EntityType.objects.filter(pk=et.pk).update(content_hash="")
        et.refresh_from_db()
        self.assertEqual(et.content_hash, "")

        class MockApps:
            @staticmethod
            def get_model(app_label, model_name):
                if app_label == "lims" and model_name == "EntityType":
                    return EntityType
                raise ValueError(f"Unknown model: {app_label}.{model_name}")

        _backfill_func(MockApps(), None)

        et.refresh_from_db()
        self.assertEqual(et.columns[0]["id"], "abc-123")  # preserved
        self.assertTrue(et.content_hash)
        self.assertEqual(len(et.content_hash), 64)

    def test_migration_handles_empty_columns(self):
        """Migration handles entity types with no columns."""
        et = EntityType.objects.create(
            name="No Columns", prefix="NOCOLS", columns=[]
        )
        EntityType.objects.filter(pk=et.pk).update(content_hash="")
        et.refresh_from_db()

        class MockApps:
            @staticmethod
            def get_model(app_label, model_name):
                if app_label == "lims" and model_name == "EntityType":
                    return EntityType
                raise ValueError(f"Unknown model: {app_label}.{model_name}")

        _backfill_func(MockApps(), None)

        et.refresh_from_db()
        self.assertEqual(et.columns, [])
        self.assertTrue(et.content_hash)
        self.assertEqual(len(et.content_hash), 64)
