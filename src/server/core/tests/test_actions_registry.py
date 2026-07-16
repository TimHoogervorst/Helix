"""Tests for the action model registry.

Exercises the backward-compatible delegation functions in
``core.actions.registry`` which wrap the unified
``BackendModRegistry`` singleton.
"""

import pytest

from helix_core.actions.registry import get_action_model, register_action_model


class FakeActionModel:
    """Minimal stand-in for a concrete action model during tests."""

    pass


class TestActionRegistryDelegation:
    """Tests that core.actions.registry functions delegate correctly."""

    @classmethod
    def setup_class(cls):
        """Save singleton state before any tests run."""
        from helix_core.mod_system.registry import registry

        cls._saved_action_models = registry._action_models.copy()

    @classmethod
    def teardown_class(cls):
        """Restore singleton state after all tests."""
        from helix_core.mod_system.registry import registry

        registry._action_models.clear()
        registry._action_models.update(cls._saved_action_models)

    def setup_method(self):
        """Save state before each test and clear for isolation."""
        from helix_core.mod_system.registry import registry

        self._saved = registry._action_models.copy()
        registry._action_models.clear()

    def teardown_method(self):
        """Restore state after each test."""
        from helix_core.mod_system.registry import registry

        registry._action_models.clear()
        registry._action_models.update(self._saved)

    def test_register_and_retrieve(self):
        """register_action_model stores a model class keyed by mod_id."""
        register_action_model("testmod", FakeActionModel)
        assert get_action_model("testmod") is FakeActionModel

    def test_unregistered_mod_returns_none(self):
        """get_action_model returns None for a mod that was never registered."""
        assert get_action_model("nonexistent") is None

    def test_registering_twice_replaces_previous(self):
        """A second registration for the same mod_id replaces the first."""

        class FirstModel:
            pass

        class SecondModel:
            pass

        register_action_model("dup", FirstModel)
        register_action_model("dup", SecondModel)
        assert get_action_model("dup") is SecondModel
