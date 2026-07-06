"""Tests for the log_action dispatcher."""

from django.test import TestCase

from core.actions.logger import log_action
from core.actions.registry import register_action_model
from core.models import User


class LoggerDispatchTests(TestCase):
    """Test that log_action routes to the correct concrete table."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="logger_test", password="pass")

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        import core.actions.registry as reg
        cls._saved_registry = reg._registry.copy()

    @classmethod
    def tearDownClass(cls):
        import core.actions.registry as reg
        reg._registry.clear()
        reg._registry.update(cls._saved_registry)
        super().tearDownClass()

    def setUp(self):
        import core.actions.registry as reg
        self._saved_registry = reg._registry.copy()
        reg._registry.clear()

    def tearDown(self):
        """Restore registry state after each test."""
        import core.actions.registry as reg
        reg._registry.clear()
        reg._registry.update(self._saved_registry)

    def test_log_action_dispatches_to_registered_mod(self):
        """log_action creates a row in the model registered for the target_type prefix."""
        from core_mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        action = log_action(
            user=self.user,
            action_type="created",
            target_type="eln.entry",
            target_id=42,
            metadata={"key": "val"},
        )

        self.assertIsInstance(action, ElnAction)
        self.assertEqual(action.performed_by, self.user)
        self.assertEqual(action.action_type, "created")
        self.assertEqual(action.target_type, "eln.entry")
        self.assertEqual(action.target_id, 42)
        self.assertEqual(action.metadata, {"key": "val"})
        self.assertIsNotNone(action.created_at)

        # Row actually landed in the database.
        self.assertEqual(ElnAction.objects.count(), 1)

    def test_log_action_metadata_defaults_to_empty_dict(self):
        """metadata is optional and defaults to {}."""
        from core_mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        action = log_action(
            user=self.user,
            action_type="edited",
            target_type="eln.entry",
            target_id=7,
        )
        self.assertEqual(action.metadata, {})

    def test_log_action_raises_for_unregistered_mod(self):
        """Calling log_action with an unregistered mod raises ValueError."""
        with self.assertRaises(ValueError) as ctx:
            log_action(
                user=self.user,
                action_type="created",
                target_type="unknownmod.thing",
                target_id=1,
            )
        self.assertIn("unknownmod", str(ctx.exception))

    def test_log_action_derives_mod_from_first_segment(self):
        """log_action extracts the mod id from the part before the first dot."""
        from core_mods.eln.models import ElnAction

        register_action_model("eln", ElnAction)

        # "eln.entry.foo" should parse to mod_id = "eln"
        action = log_action(
            user=self.user,
            action_type="created",
            target_type="eln.entry.foo",
            target_id=99,
        )
        self.assertIsInstance(action, ElnAction)
        self.assertEqual(action.target_type, "eln.entry.foo")
