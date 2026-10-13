"""Tests for the log_action dispatcher and bulk_log_actions."""

import uuid

from django.test import TestCase

from helix_core.actions.logger import log_action, bulk_log_actions
from helix_core.actions import VersionTarget
from helix_core.actions.registry import register_action_model
from helix_core.core.models import User
from helix_core.models import ActionLogEntry


class LoggerDispatchTests(TestCase):
    """Test that log_action routes to the correct concrete table."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="logger_test", password="pass")

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from helix_core.mod_system.registry import registry as backend_registry
        cls._saved_action_models = dict(backend_registry._action_models)

    @classmethod
    def tearDownClass(cls):
        from helix_core.mod_system.registry import registry as backend_registry
        backend_registry._action_models.clear()
        backend_registry._action_models.update(cls._saved_action_models)
        super().tearDownClass()

    def setUp(self):
        from helix_core.mod_system.registry import registry as backend_registry
        self._saved_method_action_models = dict(backend_registry._action_models)
        backend_registry._action_models.clear()

    def tearDown(self):
        """Restore registry state after each test."""
        from helix_core.mod_system.registry import registry as backend_registry
        backend_registry._action_models.clear()
        backend_registry._action_models.update(self._saved_method_action_models)

    def test_log_action_writes_to_platform_store(self):
        """log_action creates a row in the Platform-owned action store."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        action = log_action(
            user=self.user,
            action="eln.entry.created",
            target_type="eln.entry",
            target_id=42,
            metadata={"key": "val"},
        )

        self.assertIsInstance(action, ActionLogEntry)
        self.assertEqual(action.performed_by, self.user)
        self.assertEqual(action.action_type, "created")

    def test_log_action_persists_provider_supplied_version_target(self):
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)
        action = log_action(
            user=self.user,
            action="eln.entry.edited",
            target_type="eln.entry",
            target_id=42,
            version_target=VersionTarget("provider:revision", "v-9", "9", "hash"),
        )

        self.assertEqual(action.target_version_reference, "provider:revision")
        self.assertEqual(action.target_version_object_id, "v-9")
        self.assertEqual(action.target_version_label, "9")
        self.assertEqual(action.target_version_hash, "hash")
        self.assertEqual(action.target_type, "eln.entry")
        self.assertEqual(action.target_id, 42)
        self.assertEqual(action.metadata, {"key": "val"})
        self.assertIsNotNone(action.created_at)

        self.assertEqual(ActionLogEntry.objects.count(), 1)
        self.assertEqual(ElnAction.objects.count(), 0)

    def test_log_action_metadata_defaults_to_empty_dict(self):
        """metadata is optional and defaults to {}."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        action = log_action(
            user=self.user,
            action="eln.entry.edited",
            target_type="eln.entry",
            target_id=7,
        )
        self.assertEqual(action.metadata, {})

    def test_log_action_does_not_require_a_legacy_mod_model(self):
        """The central writer does not dispatch through a legacy table."""
        action = log_action(
            user=self.user,
            action="unknownmod.thing.created",
            target_type="unknownmod.thing",
            target_id=1,
        )
        self.assertEqual(action.initiating_mod_id, "unknownmod")

    def test_log_action_derives_mod_from_first_segment(self):
        """log_action extracts the mod id from the part before the first dot."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        # "eln.entry.foo" should parse to mod_id = "eln"
        action = log_action(
            user=self.user,
            action="eln.entry.foo.created",
            target_type="eln.entry.foo",
            target_id=99,
        )
        self.assertIsInstance(action, ActionLogEntry)
        self.assertEqual(action.target_type, "eln.entry.foo")


class BulkLogActionsTests(TestCase):
    """Test that bulk_log_actions creates rows efficiently via bulk_create."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="bulk_test", password="pass")

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from helix_core.mod_system.registry import registry as backend_registry

        cls._saved_action_models = dict(backend_registry._action_models)

    @classmethod
    def tearDownClass(cls):
        from helix_core.mod_system.registry import registry as backend_registry

        backend_registry._action_models.clear()
        backend_registry._action_models.update(cls._saved_action_models)
        super().tearDownClass()

    def setUp(self):
        from helix_core.mod_system.registry import registry as backend_registry

        self._saved_method_action_models = dict(backend_registry._action_models)
        backend_registry._action_models.clear()

    def tearDown(self):
        from helix_core.mod_system.registry import registry as backend_registry

        backend_registry._action_models.clear()
        backend_registry._action_models.update(self._saved_method_action_models)

    def test_bulk_log_actions_creates_rows(self):
        """bulk_log_actions creates the expected number of action rows."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        actions = [
            {"action": "eln.table.edited", "metadata": {"name": "Samples"}},
            {"action": "eln.comment.created", "metadata": {"text": "Looks good"}},
            {"action": "eln.image.deleted", "metadata": {}},
        ]

        results = bulk_log_actions(
            user=self.user,
            actions=actions,
            target_type="eln.entry",
            target_id=42,
        )

        self.assertEqual(len(results), 3)
        self.assertEqual(ActionLogEntry.objects.count(), 3)

        # Verify first row
        row = ActionLogEntry.objects.get(action="eln.table.edited")
        self.assertEqual(row.performed_by, self.user)
        self.assertEqual(row.target_type, "eln.entry")
        self.assertEqual(row.target_id, 42)
        self.assertEqual(row.metadata, {"name": "Samples"})

    def test_bulk_log_actions_shared_request_id(self):
        """All actions in a batch share the same request_id."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        request_id = uuid.uuid4()
        actions = [
            {"action": "eln.table.edited", "metadata": {}},
            {"action": "eln.comment.created", "metadata": {}},
        ]

        bulk_log_actions(
            user=self.user,
            actions=actions,
            target_type="eln.entry",
            target_id=1,
            request_id=request_id,
        )

        rows = ActionLogEntry.objects.all()
        self.assertEqual(rows.count(), 2)
        for row in rows:
            self.assertEqual(row.request_id, request_id)

    def test_bulk_log_actions_client_ip(self):
        """client_ip is set on all rows when provided."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        actions = [{"action": "eln.table.edited", "metadata": {}}]

        bulk_log_actions(
            user=self.user,
            actions=actions,
            target_type="eln.entry",
            target_id=1,
            client_ip="10.0.0.1",
        )

        row = ActionLogEntry.objects.first()
        self.assertEqual(row.client_ip, "10.0.0.1")

    def test_bulk_log_actions_metadata_defaults_to_empty_dict(self):
        """Actions without metadata get an empty dict."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        actions = [{"action": "eln.table.edited"}]

        results = bulk_log_actions(
            user=self.user,
            actions=actions,
            target_type="eln.entry",
            target_id=1,
        )

        self.assertEqual(len(results), 1)
        self.assertEqual(ActionLogEntry.objects.first().metadata, {})

    def test_bulk_log_actions_empty_list(self):
        """An empty action list creates no rows and returns empty list."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        results = bulk_log_actions(
            user=self.user,
            actions=[],
            target_type="eln.entry",
            target_id=1,
        )

        self.assertEqual(results, [])
        self.assertEqual(ActionLogEntry.objects.count(), 0)

    def test_bulk_log_actions_does_not_require_legacy_mod_models(self):
        """bulk_log_actions writes every action to the central store."""
        actions = [{"action": "unknownmod.widget.edited", "metadata": {}}]

        results = bulk_log_actions(
            user=self.user,
            actions=actions,
            target_type="unknownmod.entry",
            target_id=1,
        )
        self.assertEqual(len(results), 1)
        self.assertEqual(ActionLogEntry.objects.count(), 1)

    def test_bulk_log_actions_cross_mod_routing(self):
        """Actions from different mods route to different concrete tables."""
        from mods.eln.models import ElnAction
        from bundled.labelling.tags.models import TagsAction

        register_action_model("eln", ElnAction)
        register_action_model("tags", TagsAction)

        actions = [
            {"action": "eln.table.edited", "metadata": {"name": "Samples"}},
            {"action": "tags.tag.created", "metadata": {"label": "Urgent"}},
        ]

        results = bulk_log_actions(
            user=self.user,
            actions=actions,
            target_type="eln.entry",
            target_id=42,
        )

        # Both action rows created in the central store.
        self.assertEqual(len(results), 2)
        self.assertEqual(ActionLogEntry.objects.count(), 2)

        eln_row = ActionLogEntry.objects.get(action="eln.table.edited")
        self.assertEqual(eln_row.action, "eln.table.edited")

        tags_row = ActionLogEntry.objects.get(action="tags.tag.created")
        self.assertEqual(tags_row.action, "tags.tag.created")

    # ── read action rejection ──────────────────────────────────────────────

    def test_log_action_rejects_read(self):
        """log_action raises ValueError for action_type='read'."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        with self.assertRaises(ValueError) as ctx:
            log_action(
                user=self.user,
                action="eln.entry.read",
                target_type="eln.entry",
                target_id=42,
            )
        self.assertIn("read", str(ctx.exception).lower())
        self.assertEqual(ActionLogEntry.objects.count(), 0)

    def test_bulk_log_actions_rejects_read(self):
        """bulk_log_actions raises ValueError when any entry resolves to 'read'."""
        from mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        actions = [
            {"action": "eln.table.edited", "metadata": {}},
            {"action": "eln.entry.read", "metadata": {}},
        ]

        with self.assertRaises(ValueError) as ctx:
            bulk_log_actions(
                user=self.user,
                actions=actions,
                target_type="eln.entry",
                target_id=42,
            )
        self.assertIn("read", str(ctx.exception).lower())
        # No rows should be created — reject before any persistence.
        self.assertEqual(ElnAction.objects.count(), 0)
