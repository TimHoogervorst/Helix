"""Schema migration coverage for canonical Revision Group ownership."""

from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


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
