"""Tests for the action model registry."""

from django.test import TestCase

from core.actions.registry import get_action_model, register_action_model


class FakeActionModel:
    """Minimal stand-in for a concrete action model during tests."""

    objects: object = None  # replaced in test


class RegistryTests(TestCase):
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
        """Save registry before each test and clear it for isolation."""
        import core.actions.registry as reg
        self._saved_registry = reg._registry.copy()
        reg._registry.clear()

    def tearDown(self):
        """Restore registry state after each test."""
        import core.actions.registry as reg
        reg._registry.clear()
        reg._registry.update(self._saved_registry)

    def test_register_and_retrieve(self):
        """register_action_model stores a model class keyed by mod_id."""
        register_action_model("testmod", FakeActionModel)
        self.assertEqual(get_action_model("testmod"), FakeActionModel)

    def test_unregistered_mod_returns_none(self):
        """get_action_model returns None for a mod that was never registered."""
        self.assertIsNone(get_action_model("nonexistent"))

    def test_registering_twice_replaces_previous(self):
        """A second registration for the same mod_id replaces the first."""

        class FirstModel:
            pass

        class SecondModel:
            pass

        register_action_model("dup", FirstModel)
        register_action_model("dup", SecondModel)
        self.assertEqual(get_action_model("dup"), SecondModel)
