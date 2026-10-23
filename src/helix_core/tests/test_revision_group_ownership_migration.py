"""Schema migration coverage for canonical Revision Group ownership."""

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from unittest.mock import patch


class RevisionGroupOwnershipSchemaMigrationTests(TransactionTestCase):
    migrate_from = ("helix_core", "0001_initial")
    migrate_to = ("helix_core", "0002_revision_group_owner")

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        old_apps = MigrationExecutor(connection).loader.project_state(
            [self.migrate_from]
        ).apps
        LegacyGroup = old_apps.get_model("helix_core", "RecordRevisionGroup")
        self.group_id = "00000000-0000-0000-0000-000000000705"
        LegacyGroup.objects.create(
            id=self.group_id,
            record_id=None,
            target_model_reference="historical.entry",
            target_object_id="entry-705",
            group_key="document",
        )

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        self.new_apps = MigrationExecutor(connection).loader.project_state(
            [self.migrate_to]
        ).apps

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def test_legacy_target_identity_survives_with_unresolved_owner(self):
        Group = self.new_apps.get_model("helix_core", "RecordRevisionGroup")
        group = Group.objects.get(pk=self.group_id)

        self.assertEqual(group.owner_mod_id, "")
        self.assertEqual(group.target_model_reference, "historical.entry")
        self.assertEqual(group.target_object_id, "entry-705")
        self.assertEqual(group.group_key, "document")

    def test_startup_ownership_reconciliation_defers_until_owner_column_exists(self):
        """Startup at migration 0001 can complete, then 0002 can add ownership."""
        from helix_core.record_persistence import migrate_revision_group_ownership

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_from])
        with patch("helix_core.mod_system.registry.registry") as registry:
            # The old schema has no owner_mod_id. Reconciliation should defer
            # rather than asking the ORM to issue a query against that column.
            self.assertEqual(migrate_revision_group_ownership(), 0)
            registry.resolve_revision_group_registration.assert_not_called()

        executor = MigrationExecutor(connection)
        executor.migrate([self.migrate_to])
        from helix_core.models import RecordRevisionGroup

        with patch("helix_core.mod_system.registry.registry") as registry:
            registry.resolve_revision_group_registration.return_value = {
                "owner_mod_id": "historical.owner",
            }
            self.assertEqual(migrate_revision_group_ownership(), 1)

        group = RecordRevisionGroup.objects.get(pk=self.group_id)
        self.assertEqual(group.owner_mod_id, "historical.owner")
