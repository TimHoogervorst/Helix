"""Tests for BackendModRegistry — unified registration API.

Tests exercise each ``register_*()`` method, the query methods,
duplicate overwrite behaviour, ``build_urlpatterns()`` ordering,
and signal dependency validation.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from django.urls import include, path

from helix_core.mod_system.manifest import ModManifest
from helix_core.mod_system.registry import BackendModRegistry


# ── helpers ──────────────────────────────────────────────────────────────────


def _fresh_registry() -> BackendModRegistry:
    """Return a new, empty registry instance for isolated tests."""
    return BackendModRegistry()


def _dummy_view():
    """A no-op view for URL pattern tests."""
    pass


def _make_manifest(
    mod_id: str,
    depends_on: list[str | dict[str, str]] | None = None,
    version: str | None = "0.1.0",
) -> ModManifest:
    """Create a ModManifest for testing."""
    return ModManifest(
        id=mod_id,
        display_name=mod_id.title(),
        version=version,
        depends_on=depends_on if depends_on is not None else [],
    )


def _mock_sender(mod_id: str, name: str = "FakeModel") -> MagicMock:
    """Create a MagicMock sender with __module__ pointing to a mod."""
    sender = MagicMock()
    sender.__module__ = f"mods.{mod_id}.models"
    sender.__name__ = name
    return sender


# ── register_action_model / get_action_model ─────────────────────────────────


class TestActionModelRegistration:
    """Tests for register_action_model and get_action_model."""

    def test_register_and_retrieve(self):
        reg = _fresh_registry()

        class FakeModel:
            pass

        reg.register_action_model("eln", FakeModel)
        assert reg.get_action_model("eln") is FakeModel

    def test_unregistered_mod_returns_none(self):
        reg = _fresh_registry()
        assert reg.get_action_model("nonexistent") is None

    def test_registering_twice_replaces_previous(self):
        reg = _fresh_registry()

        class FirstModel:
            pass

        class SecondModel:
            pass

        reg.register_action_model("dup", FirstModel)
        reg.register_action_model("dup", SecondModel)
        assert reg.get_action_model("dup") is SecondModel

    def test_multiple_mods_do_not_interfere(self):
        reg = _fresh_registry()

        class ModelA:
            pass

        class ModelB:
            pass

        reg.register_action_model("a", ModelA)
        reg.register_action_model("b", ModelB)
        assert reg.get_action_model("a") is ModelA
        assert reg.get_action_model("b") is ModelB


# ── register_urls / get_url_patterns ─────────────────────────────────────────


class TestURLRegistration:
    """Tests for register_urls and get_url_patterns."""

    def test_register_and_retrieve(self):
        reg = _fresh_registry()
        patterns = [path("api/test/", _dummy_view)]
        reg.register_urls("eln", patterns)
        assert reg.get_url_patterns() == {"eln": patterns}

    def test_unregistered_mod_not_in_result(self):
        reg = _fresh_registry()
        assert "nonexistent" not in reg.get_url_patterns()

    def test_registering_twice_replaces_previous(self):
        reg = _fresh_registry()
        first = [path("api/v1/", _dummy_view)]
        second = [path("api/v2/", _dummy_view)]
        reg.register_urls("eln", first)
        reg.register_urls("eln", second)
        assert reg.get_url_patterns()["eln"] == second

    def test_multiple_mods(self):
        reg = _fresh_registry()
        eln_patterns = [path("api/eln/", _dummy_view)]
        lims_patterns = [path("api/lims/", _dummy_view)]
        reg.register_urls("eln", eln_patterns)
        reg.register_urls("lims", lims_patterns)
        result = reg.get_url_patterns()
        assert result["eln"] == eln_patterns
        assert result["lims"] == lims_patterns

    def test_get_url_patterns_returns_copy(self):
        """Mutation of the returned dict should not affect the registry."""
        reg = _fresh_registry()
        reg.register_urls("eln", [path("api/eln/", _dummy_view)])
        result = reg.get_url_patterns()
        result["new"] = []
        assert "new" not in reg.get_url_patterns()

    def test_get_url_patterns_in_dependency_order(self):
        """get_url_patterns returns mods in dependency order."""
        reg = _fresh_registry()
        reg.set_mod_order(["mods.tags", "mods.eln"])

        eln_p = path("api/eln/", _dummy_view)
        tags_p = path("api/tags/", _dummy_view)
        reg.register_urls("eln", [eln_p])
        reg.register_urls("tags", [tags_p])

        result = reg.get_url_patterns()
        # tags (dependency) before eln (dependent).
        assert list(result.keys()) == ["tags", "eln"]

    def test_get_url_patterns_unknown_mods_last(self):
        """Unknown mods appear alphabetically after known mods."""
        reg = _fresh_registry()
        reg.set_mod_order(["mods.tags"])

        tags_p = path("api/tags/", _dummy_view)
        core_p = path("api/core/", _dummy_view)
        mentions_p = path("api/mentions/", _dummy_view)
        reg.register_urls("tags", [tags_p])
        reg.register_urls("core", [core_p])
        reg.register_urls("mentions", [mentions_p])

        result = reg.get_url_patterns()
        assert list(result.keys()) == ["tags", "core", "mentions"]




# ── register_setting / get_settings ──────────────────────────────────────────


class TestSettingRegistration:
    """Tests for register_setting and get_settings."""

    def test_register_and_retrieve(self):
        reg = _fresh_registry()
        reg.register_setting("eln", "lock_timeout_minutes", 5)
        assert reg.get_settings("eln") == {"lock_timeout_minutes": 5}

    def test_unregistered_mod_returns_empty_dict(self):
        reg = _fresh_registry()
        assert reg.get_settings("nonexistent") == {}

    def test_multiple_settings_same_mod(self):
        reg = _fresh_registry()
        reg.register_setting("eln", "a", 1)
        reg.register_setting("eln", "b", 2)
        assert reg.get_settings("eln") == {"a": 1, "b": 2}

    def test_multiple_mods_do_not_interfere(self):
        reg = _fresh_registry()
        reg.register_setting("eln", "timeout", 5)
        reg.register_setting("lims", "timeout", 10)
        assert reg.get_settings("eln") == {"timeout": 5}
        assert reg.get_settings("lims") == {"timeout": 10}

    def test_duplicate_key_overwrites(self):
        reg = _fresh_registry()
        reg.register_setting("eln", "timeout", 5)
        reg.register_setting("eln", "timeout", 10)
        assert reg.get_settings("eln") == {"timeout": 10}

    def test_get_settings_returns_copy(self):
        reg = _fresh_registry()
        reg.register_setting("eln", "timeout", 5)
        result = reg.get_settings("eln")
        result["new"] = 99
        assert "new" not in reg.get_settings("eln")

    def test_setting_default_can_be_any_type(self):
        reg = _fresh_registry()
        reg.register_setting("eln", "str_val", "hello")
        reg.register_setting("eln", "int_val", 42)
        reg.register_setting("eln", "list_val", [1, 2, 3])
        reg.register_setting("eln", "none_val", None)
        settings = reg.get_settings("eln")
        assert settings["str_val"] == "hello"
        assert settings["int_val"] == 42
        assert settings["list_val"] == [1, 2, 3]
        assert settings["none_val"] is None


# ── register_signal / get_signal_registrations ───────────────────────────────


class TestSignalRegistration:
    """Tests for register_signal and get_signal_registrations."""

    def test_register_and_retrieve(self):
        """Signal registration records metadata."""
        reg = _fresh_registry()
        signal = MagicMock()
        handler = lambda sender, **kwargs: None  # noqa: E731
        sender = _mock_sender("eln")  # same mod — always allowed

        reg.register_signal("eln", signal, handler, sender=sender)

        registrations = reg.get_signal_registrations()
        assert len(registrations) == 1
        assert registrations[0]["mod_id"] == "eln"
        assert registrations[0]["signal"] is signal
        assert registrations[0]["handler"] is handler

    def test_signal_is_connected(self):
        """register_signal actually calls signal.connect()."""
        reg = _fresh_registry()
        signal = MagicMock()
        handler = lambda sender, **kwargs: None  # noqa: E731
        sender = _mock_sender("eln")

        reg.register_signal("eln", signal, handler, sender=sender)

        signal.connect.assert_called_once()
        # The connected handler is the wrapped version.
        call_args = signal.connect.call_args
        assert call_args[1]["sender"] is sender

    def test_self_signal_allowed_without_manifest(self):
        """A mod can register on its own sender without manifests."""
        reg = _fresh_registry()
        signal = MagicMock()
        handler = lambda sender, **kwargs: None  # noqa: E731
        sender = _mock_sender("eln")

        # Should not raise — sender_mod_id == mod_id.
        reg.register_signal("eln", signal, handler, sender=sender)
        assert len(reg.get_signal_registrations()) == 1

    def test_cross_mod_signal_with_valid_dependency(self):
        """A mod can register on a dependency's sender."""
        reg = _fresh_registry()
        manifests = {
            "eln": _make_manifest("eln", depends_on=["lims"]),
            "lims": _make_manifest("lims"),
        }
        reg.set_mod_order(
            ["mods.lims", "mods.eln"], manifests
        )

        signal = MagicMock()
        handler = lambda sender, **kwargs: None  # noqa: E731
        sender = _mock_sender("lims")

        # eln depends on lims — registering on lims's sender is valid.
        reg.register_signal("eln", signal, handler, sender=sender)
        assert len(reg.get_signal_registrations()) == 1

    def test_cross_mod_signal_with_reverse_dependency(self):
        """A mod can register on a dependent's sender (observer pattern).

        If mod A depends on mod B, then mod B should be allowed to listen
        to mod A's signals — B is A's dependency, so B's ready() runs
        before A's, and the handler wrapper gates execution on A being
        ready.
        """
        reg = _fresh_registry()
        manifests = {
            "eln": _make_manifest("eln", depends_on=["lims"]),
            "lims": _make_manifest("lims"),
        }
        reg.set_mod_order(
            ["mods.lims", "mods.eln"], manifests
        )

        signal = MagicMock()
        handler = lambda sender, **kwargs: None  # noqa: E731
        sender = _mock_sender("eln")

        # lims does NOT depend on eln, but eln depends on lims.
        # lims should be allowed to listen to eln's signals (observer pattern).
        reg.register_signal("lims", signal, handler, sender=sender)
        assert len(reg.get_signal_registrations()) == 1

    def test_cross_mod_signal_without_dependency_raises(self):
        """Registering on a non-dependency's sender raises ValueError."""
        reg = _fresh_registry()
        manifests = {
            "eln": _make_manifest("eln", depends_on=["tags"]),
            "lims": _make_manifest("lims"),
        }
        reg.set_mod_order(
            ["mods.tags", "mods.lims", "mods.eln"], manifests
        )

        signal = MagicMock()
        handler = lambda sender, **kwargs: None  # noqa: E731
        sender = _mock_sender("lims")

        # eln does NOT depend on lims, nor does lims depend on eln — should raise.
        with pytest.raises(ValueError, match="neither in.*depends_on"):
            reg.register_signal("eln", signal, handler, sender=sender)

    def test_unknown_sender_module_skips_validation(self):
        """A sender without a mods module skips validation."""
        reg = _fresh_registry()
        manifests = {"eln": _make_manifest("eln")}
        reg.set_mod_order(["mods.eln"], manifests)

        signal = MagicMock()
        handler = lambda sender, **kwargs: None  # noqa: E731
        sender = MagicMock()
        sender.__module__ = "django.contrib.auth.models"
        sender.__name__ = "User"

        # Should not raise — sender mod is unknown.
        reg.register_signal("eln", signal, handler, sender=sender)

    def test_no_manifests_skips_validation(self):
        """Without manifests, cross-mod signals are not validated."""
        reg = _fresh_registry()
        signal = MagicMock()
        handler = lambda sender, **kwargs: None  # noqa: E731
        sender = _mock_sender("other_mod")

        # No manifests set — validation skipped.
        reg.register_signal("eln", signal, handler, sender=sender)

    def test_multiple_signal_registrations(self):
        reg = _fresh_registry()
        sig1 = MagicMock()
        sig2 = MagicMock()
        h1 = lambda **kw: None  # noqa: E731
        h2 = lambda **kw: None  # noqa: E731

        reg.register_signal("eln", sig1, h1, sender=_mock_sender("eln"))
        reg.register_signal("lims", sig2, h2, sender=_mock_sender("lims"))

        assert len(reg.get_signal_registrations()) == 2

    def test_get_signal_registrations_returns_copy(self):
        reg = _fresh_registry()
        signal = MagicMock()
        reg.register_signal(
            "eln", signal, lambda **kw: None, sender=_mock_sender("eln")
        )
        result = reg.get_signal_registrations()
        result.append({"mod_id": "fake"})
        assert len(reg.get_signal_registrations()) == 1


class TestSignalDependencyGating:
    """Tests for the dependency-gated handler wrapper."""

    def test_handler_called_when_deps_ready(self):
        """Wrapper calls original handler when dependencies are ready."""
        reg = _fresh_registry()
        manifests = {
            "eln": _make_manifest("eln", depends_on=["lims"]),
            "lims": _make_manifest("lims"),
        }
        reg.set_mod_order(
            ["mods.lims", "mods.eln"], manifests
        )

        signal = MagicMock()
        original_handler = MagicMock()
        sender = _mock_sender("lims")

        with patch("django.apps.apps.app_configs", {
            "lims": MagicMock(ready=True),
        }):
            reg.register_signal("eln", signal, original_handler, sender=sender)

            # Get the wrapped handler that was passed to connect.
            # connect(receiver, sender=..., ...) — receiver is positional.
            wrapped_handler = signal.connect.call_args[0][0]
            # Call it — should invoke the original handler.
            wrapped_handler(sender_instance=MagicMock())
            original_handler.assert_called_once()

    def test_handler_not_called_when_dep_not_installed(self):
        """Wrapper skips handler when a dependency isn't installed."""
        reg = _fresh_registry()
        manifests = {
            "eln": _make_manifest("eln", depends_on=["lims"]),
            "lims": _make_manifest("lims"),
        }
        reg.set_mod_order(
            ["mods.lims", "mods.eln"], manifests
        )

        signal = MagicMock()
        original_handler = MagicMock()
        sender = _mock_sender("lims")

        # lims is NOT in app_configs (not installed).
        with patch("django.apps.apps.app_configs", {}):
            reg.register_signal("eln", signal, original_handler, sender=sender)

            wrapped_handler = signal.connect.call_args[0][0]
            result = wrapped_handler(sender_instance=MagicMock())
            # Handler should NOT be called.
            original_handler.assert_not_called()
            assert result is None

    def test_handler_not_called_when_dep_not_ready(self):
        """Wrapper skips handler when a dependency's ready() hasn't run."""
        reg = _fresh_registry()
        manifests = {
            "eln": _make_manifest("eln", depends_on=["lims"]),
            "lims": _make_manifest("lims"),
        }
        reg.set_mod_order(
            ["mods.lims", "mods.eln"], manifests
        )

        signal = MagicMock()
        original_handler = MagicMock()
        sender = _mock_sender("lims")

        # lims is installed but NOT ready.
        with patch("django.apps.apps.app_configs", {
            "lims": MagicMock(ready=False),
        }):
            reg.register_signal("eln", signal, original_handler, sender=sender)

            wrapped_handler = signal.connect.call_args[0][0]
            result = wrapped_handler(sender_instance=MagicMock())
            original_handler.assert_not_called()
            assert result is None


# ── register_service / call / list_services ────────────────────────────────


class TestServiceRegistration:
    """Tests for register_service, call, and list_services."""

    # ── register_service ─────────────────────────────────────────────────

    def test_register_and_retrieve(self):
        """Registered service appears in list_services."""
        reg = _fresh_registry()

        def my_handler():
            return 42

        reg.register_service("test.echo", my_handler)
        services = reg.list_services()
        assert "test.echo" in services
        assert services["test.echo"] is my_handler

    def test_register_multiple_services(self):
        """Multiple services are all listed."""
        reg = _fresh_registry()

        def h1():
            return 1

        def h2():
            return 2

        reg.register_service("a.one", h1)
        reg.register_service("b.two", h2)
        services = reg.list_services()
        assert set(services.keys()) == {"a.one", "b.two"}

    def test_duplicate_registration_overwrites(self):
        """Last write wins for duplicate service IDs."""
        reg = _fresh_registry()

        def first():
            return "first"

        def second():
            return "second"

        reg.register_service("dup.svc", first)
        reg.register_service("dup.svc", second)
        services = reg.list_services()
        assert services["dup.svc"] is second

    def test_service_handler_can_be_lambda(self):
        """Lambda handlers work — any callable is accepted."""
        reg = _fresh_registry()
        reg.register_service("test.lambda", lambda x: x * 2)
        assert "test.lambda" in reg.list_services()

    # ── call ──────────────────────────────────────────────────────────

    def test_call_dispatches_to_handler(self):
        """call() invokes the registered handler with forwarded args."""
        reg = _fresh_registry()
        handler = MagicMock(return_value="ok")
        reg.register_service("test.doThing", handler)

        result = reg.call("test.doThing", "arg1", key="val")

        handler.assert_called_once_with("arg1", key="val")
        assert result == "ok"

    def test_call_returns_handler_result(self):
        """call() propagates the return value from the handler."""
        reg = _fresh_registry()

        def add(a, b):
            return a + b

        reg.register_service("math.add", add)
        assert reg.call("math.add", 3, 4) == 7

    def test_call_unregistered_service_raises(self):
        """Calling an unregistered service raises ValueError."""
        reg = _fresh_registry()
        with pytest.raises(ValueError, match="not registered"):
            reg.call("nonexistent.service")

    def test_call_unregistered_service_message_lists_available(self):
        """Error message includes available services for debugging."""
        reg = _fresh_registry()
        reg.register_service("math.add", lambda a, b: a + b)
        with pytest.raises(ValueError, match="Available services"):
            reg.call("math.subtract")

    def test_call_empty_registry_message(self):
        """Error message works even when no services are registered."""
        reg = _fresh_registry()
        with pytest.raises(ValueError, match="not registered"):
            reg.call("anything")

    def test_call_with_only_kwargs(self):
        """call() works with keyword-only arguments."""
        reg = _fresh_registry()

        def greet(*, name, greeting="Hello"):
            return f"{greeting}, {name}"

        reg.register_service("test.greet", greet)
        assert reg.call("test.greet", name="World") == "Hello, World"

    def test_call_with_side_effects(self):
        """Service handlers can perform side effects."""
        reg = _fresh_registry()
        side_effects = []

        def do_side_effect(x):
            side_effects.append(x)
            return len(side_effects)

        reg.register_service("test.sideEffect", do_side_effect)
        assert reg.call("test.sideEffect", "a") == 1
        assert reg.call("test.sideEffect", "b") == 2
        assert side_effects == ["a", "b"]

    # ── list_services ───────────────────────────────────────────────────

    def test_list_services_empty(self):
        """list_services returns empty dict when nothing registered."""
        reg = _fresh_registry()
        assert reg.list_services() == {}

    def test_list_services_returns_copy(self):
        """Mutation of the returned dict does not affect the registry."""
        reg = _fresh_registry()
        reg.register_service("test.one", lambda: 1)
        result = reg.list_services()
        result["test.two"] = lambda: 2
        assert "test.two" not in reg.list_services()

    def test_list_services_after_overwrite(self):
        """list_services reflects the latest handler after overwrite."""
        reg = _fresh_registry()
        reg.register_service("test.svc", lambda: "old")
        reg.register_service("test.svc", lambda: "new")
        services = reg.list_services()
        assert len(services) == 1
        assert services["test.svc"]() == "new"


# ── override (service mocking context manager) ─────────────────────────────


class TestOverride:
    """Tests for ``registry.override()`` context manager."""

    def test_override_replaces_handler(self):
        """Within the context, call() uses the mock handler."""
        reg = _fresh_registry()

        def real_handler(x):
            return f"real:{x}"

        def mock_handler(x):
            return f"mock:{x}"

        reg.register_service("test.svc", real_handler)

        with reg.override("test.svc", mock_handler):
            result = reg.call("test.svc", "data")
            assert result == "mock:data"

    def test_original_restored_after_exit(self):
        """After the context exits, the original handler is restored."""
        reg = _fresh_registry()

        def real_handler(x):
            return f"real:{x}"

        reg.register_service("test.svc", real_handler)

        with reg.override("test.svc", lambda x: f"mock:{x}"):
            pass

        result = reg.call("test.svc", "data")
        assert result == "real:data"

    def test_override_service_not_previously_registered(self):
        """Can override a service ID that wasn't registered before."""
        reg = _fresh_registry()

        def mock_handler(x):
            return f"mock:{x}"

        with reg.override("new.svc", mock_handler):
            result = reg.call("new.svc", "data")
            assert result == "mock:data"

        # After exit, the service should be removed (not left as stale mock).
        with pytest.raises(ValueError, match="not registered"):
            reg.call("new.svc", "data")

    def test_override_restores_on_exception(self):
        """Original handler is restored even if the context raises."""
        reg = _fresh_registry()

        def real_handler():
            return "real"

        reg.register_service("test.svc", real_handler)

        try:
            with reg.override("test.svc", lambda: "mock"):
                raise RuntimeError("oops")
        except RuntimeError:
            pass

        # Original should be restored despite the exception.
        assert reg.call("test.svc") == "real"

    def test_override_restores_previous_mock_on_exception(self):
        """When a previously-unregistered service override raises,
        the service is removed after exit."""
        reg = _fresh_registry()

        def mock_handler():
            return "mock"

        try:
            with reg.override("temp.svc", mock_handler):
                raise RuntimeError("oops")
        except RuntimeError:
            pass

        # Service should not exist after exception exit.
        with pytest.raises(ValueError, match="not registered"):
            reg.call("temp.svc")

    def test_override_nested_contexts(self):
        """Nested overrides restore each level correctly."""
        reg = _fresh_registry()

        def real():
            return "real"

        reg.register_service("test.svc", real)

        with reg.override("test.svc", lambda: "outer"):
            assert reg.call("test.svc") == "outer"
            with reg.override("test.svc", lambda: "inner"):
                assert reg.call("test.svc") == "inner"
            # Inner exited — back to outer.
            assert reg.call("test.svc") == "outer"
        # Outer exited — back to real.
        assert reg.call("test.svc") == "real"

    def test_override_does_not_affect_other_services(self):
        """Overriding one service does not change others."""
        reg = _fresh_registry()

        reg.register_service("a.one", lambda: "a-real")
        reg.register_service("b.two", lambda: "b-real")

        with reg.override("a.one", lambda: "a-mock"):
            assert reg.call("a.one") == "a-mock"
            assert reg.call("b.two") == "b-real"

        assert reg.call("a.one") == "a-real"
        assert reg.call("b.two") == "b-real"

    def test_override_updates_list_services(self):
        """list_services() reflects the mock during override."""
        reg = _fresh_registry()
        reg.register_service("test.svc", lambda: "real")

        mock = lambda: "mock"  # noqa: E731

        with reg.override("test.svc", mock):
            services = reg.list_services()
            assert services["test.svc"] is mock

        services = reg.list_services()
        assert services["test.svc"] is not mock


# ── _resolve_mod_id ─────────────────────────────────────────────────────────


class TestResolveModId:
    """Tests for _resolve_mod_id static method."""

    def test_mods_sender(self):
        sender = _mock_sender("eln")
        result = BackendModRegistry._resolve_mod_id(sender)
        assert result == "eln"

    def test_django_contrib_sender(self):
        sender = MagicMock()
        sender.__module__ = "django.contrib.auth.models"
        sender.__name__ = "User"
        result = BackendModRegistry._resolve_mod_id(sender)
        assert result is None

    def test_no_module_attribute(self):
        sender = MagicMock(spec=[])  # no __module__
        result = BackendModRegistry._resolve_mod_id(sender)
        assert result is None

    def test_empty_module(self):
        sender = MagicMock()
        sender.__module__ = ""
        result = BackendModRegistry._resolve_mod_id(sender)
        assert result is None


# ── build_urlpatterns ────────────────────────────────────────────────────────


class TestBuildURLPatterns:
    """Tests for build_urlpatterns() ordering."""

    def test_empty_registry_returns_empty_list(self):
        reg = _fresh_registry()
        assert reg.build_urlpatterns() == []

    def test_returns_patterns_in_dependency_order(self):
        """Dependencies should appear before dependents."""
        reg = _fresh_registry()
        reg.set_mod_order(["mods.tags", "mods.eln"])

        tags_pattern = path("api/tags/", _dummy_view, name="tags")
        eln_pattern = path("api/eln/", _dummy_view, name="eln")

        reg.register_urls("eln", [eln_pattern])
        reg.register_urls("tags", [tags_pattern])

        result = reg.build_urlpatterns()
        assert result == [tags_pattern, eln_pattern]

    def test_unknown_mods_appended_alphabetically(self):
        """Mods not in the mod order go last, sorted alphabetically."""
        reg = _fresh_registry()
        reg.set_mod_order(["mods.tags"])

        tags_pattern = path("api/tags/", _dummy_view)
        core_pattern = path("api/core/", _dummy_view)
        mentions_pattern = path("api/mentions/", _dummy_view)

        reg.register_urls("tags", [tags_pattern])
        reg.register_urls("core", [core_pattern])
        reg.register_urls("mentions", [mentions_pattern])

        result = reg.build_urlpatterns()
        assert result == [tags_pattern, core_pattern, mentions_pattern]

    def test_real_world_eln_deps_order(self):
        """Match the dependency table from the mod-system spec."""
        reg = _fresh_registry()
        reg.set_mod_order([
            "mods.tags",
            "mods.users",
            "mods.lims",
            "mods.eln",
            "mods.library",
            "mods.tabs",
            "mods.core",
        ])

        eln_p = path("api/eln/", _dummy_view)
        lims_p = path("api/lims/", _dummy_view)
        tags_p = path("api/tags/", _dummy_view)
        library_p = path("api/library/", _dummy_view)

        reg.register_urls("eln", [eln_p])
        reg.register_urls("lims", [lims_p])
        reg.register_urls("tags", [tags_p])
        reg.register_urls("library", [library_p])

        result = reg.build_urlpatterns()
        assert result.index(lims_p) < result.index(eln_p)
        assert result.index(tags_p) < result.index(eln_p)
        assert result.index(tags_p) < result.index(library_p)
        assert result.index(eln_p) < result.index(library_p)

    def test_mod_with_multiple_patterns(self):
        """All patterns from a single mod are included together."""
        reg = _fresh_registry()
        reg.set_mod_order(["mods.a", "mods.b"])

        a1 = path("api/a/one/", _dummy_view)
        a2 = path("api/a/two/", _dummy_view)
        b1 = path("api/b/", _dummy_view)

        reg.register_urls("a", [a1, a2])
        reg.register_urls("b", [b1])

        result = reg.build_urlpatterns()
        assert result == [a1, a2, b1]

    def test_include_pattern(self):
        """build_urlpatterns works with include() entries."""
        reg = _fresh_registry()
        reg.set_mod_order(["mods.eln"])

        inc_pattern = include("mods.eln.urls")
        reg.register_urls("eln", [inc_pattern])

        result = reg.build_urlpatterns()
        assert result == [inc_pattern]


# ── set_mod_order ────────────────────────────────────────────────────────────


class TestSetModOrder:
    """Tests for set_mod_order."""

    def test_extracts_mod_ids_from_dotted_paths(self):
        reg = _fresh_registry()
        reg.set_mod_order([
            "mods.tags",
            "mods.lims",
            "mods.eln",
        ])
        tags_p = path("api/tags/", _dummy_view)
        eln_p = path("api/eln/", _dummy_view)
        reg.register_urls("eln", [eln_p])
        reg.register_urls("tags", [tags_p])
        result = reg.build_urlpatterns()
        assert result == [tags_p, eln_p]

    def test_empty_order(self):
        reg = _fresh_registry()
        reg.set_mod_order([])
        b_p = path("api/b/", _dummy_view)
        a_p = path("api/a/", _dummy_view)
        reg.register_urls("b", [b_p])
        reg.register_urls("a", [a_p])
        result = reg.build_urlpatterns()
        assert result == [a_p, b_p]

    def test_stores_manifests_when_provided(self):
        reg = _fresh_registry()
        manifests = {
            "eln": _make_manifest("eln", depends_on=["lims"]),
            "lims": _make_manifest("lims"),
        }
        reg.set_mod_order(
            ["mods.lims", "mods.eln"], manifests
        )
        assert reg._manifests == manifests

    def test_manifests_none_does_not_clear_existing(self):
        reg = _fresh_registry()
        manifests = {"eln": _make_manifest("eln")}
        reg.set_mod_order(["mods.eln"], manifests)
        reg.set_mod_order(["mods.eln"], None)
        # Existing manifests should be preserved.
        assert reg._manifests == manifests


# ── register_schema_type ──────────────────────────────────────────────────────


@pytest.mark.django_db
class TestRegisterSchemaType:
    """Tests for register_schema_type — DB upsert of SchemaType + Schema."""

    def test_creates_schema_type_and_default_schema(self):
        """register_schema_type creates a SchemaType and a default Schema."""
        from helix_core.models import Schema, SchemaType

        reg = _fresh_registry()
        reg.register_schema_type(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
            prefix="E",
        )

        st = SchemaType.objects.get(model="mods.lims.models.Entity")
        assert st.display_name == "Entity"
        assert st.workspace_id == "lims"
        assert st.is_active is True

        schema = Schema.objects.get(schema_type=st, is_default=True)
        assert schema.name == "Default"
        assert schema.prefix == "E"

    def test_idempotent_across_calls(self):
        """Calling register_schema_type twice does not create duplicate rows."""
        from helix_core.models import Schema, SchemaType

        reg = _fresh_registry()
        reg.register_schema_type(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
            prefix="E",
        )
        reg.register_schema_type(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
            prefix="E",
        )

        # Only one SchemaType and one Schema should exist.
        assert SchemaType.objects.filter(model="mods.lims.models.Entity").count() == 1
        st = SchemaType.objects.get(model="mods.lims.models.Entity")
        assert Schema.objects.filter(schema_type=st, is_default=True).count() == 1

    def test_updates_existing_schema_type_on_repeat_call(self):
        """Repeated call with changed fields updates the existing rows."""
        from helix_core.models import Schema, SchemaType

        reg = _fresh_registry()
        reg.register_schema_type(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
            prefix="E",
        )

        # Call again with updated display_name and columns.
        reg.register_schema_type(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
            columns=[{"name": "volume", "type": "Number"}],
            prefix="E",
        )

        st = SchemaType.objects.get(model="mods.lims.models.Entity")
        assert st.display_name == "Entity"
        assert len(st.columns) == 1
        assert st.columns[0]["name"] == "volume"

    def test_custom_schema_name(self):
        """The schema_name parameter controls the default Schema's name."""
        from helix_core.models import Schema, SchemaType

        reg = _fresh_registry()
        reg.register_schema_type(
            display_name="Sample",
            workspace_id="lims",
            model="m.S",
            prefix="SAMP",
            schema_name="Standard Sample",
        )

        st = SchemaType.objects.get(model="m.S")
        schema = Schema.objects.get(schema_type=st, is_default=True)
        assert schema.name == "Standard Sample"

    def test_columns_default_to_empty_list(self):
        """When columns is not provided, it defaults to an empty list."""
        from helix_core.models import SchemaType

        reg = _fresh_registry()
        reg.register_schema_type(
            display_name="Minimal",
            workspace_id="test",
            model="m.Min",
            prefix="MIN",
        )

        st = SchemaType.objects.get(model="m.Min")
        assert st.columns == []

    def test_different_models_are_independent(self):
        """Each unique model string gets its own SchemaType row."""
        from helix_core.models import SchemaType

        reg = _fresh_registry()
        reg.register_schema_type(
            display_name="Entity",
            workspace_id="lims",
            model="mods.lims.models.Entity",
            prefix="E",
        )
        reg.register_schema_type(
            display_name="Entry",
            workspace_id="eln",
            model="mods.eln.models.NotebookEntry",
            prefix="NB",
        )

        assert SchemaType.objects.count() == 2
        assert SchemaType.objects.filter(model="mods.lims.models.Entity").exists()
        assert SchemaType.objects.filter(model="mods.eln.models.NotebookEntry").exists()


# ── singleton ────────────────────────────────────────────────────────────────


class TestSingleton:
    """Tests for the module-level singleton."""

    def test_singleton_exists(self):
        from helix_core.mod_system.registry import registry

        assert isinstance(registry, BackendModRegistry)

    def test_singleton_is_reused(self):
        from helix_core.mod_system.registry import registry as r1
        from helix_core.mod_system.registry import registry as r2

        assert r1 is r2


# ── backward-compatible delegation ──────────────────────────────────────────


class TestActionRegistryDelegation:
    """Tests that helix_core.actions.registry delegates to BackendModRegistry."""

    def test_register_action_model_delegates(self):
        from helix_core.actions.registry import (
            get_action_model,
            register_action_model,
        )

        class FakeModel:
            pass

        register_action_model("test_delegation", FakeModel)
        result = get_action_model("test_delegation")
        assert result is FakeModel

    def test_get_action_model_delegates_for_unknown(self):
        from helix_core.actions.registry import get_action_model

        assert get_action_model("completely_unknown_mod_xyz") is None


# ── action catalog ────────────────────────────────────────────────────────────


class TestRegisterCustomAction:
    """Tests for register_custom_action."""

    def test_register_custom_action_stores_entry(self):
        """register_custom_action stores the custom action and makes it
        retrievable via get_action_catalog."""
        reg = _fresh_registry()
        reg.register_action_model("lims", type("FakeAction", (), {}))

        reg.register_custom_action(
            mod_id="lims",
            action_id="lims.sample.registered",
            label="Sample Registered",
            core="edited",
            target_model="mods.lims.models.Entity",
        )

        catalog = reg.get_action_catalog("lims")
        # Custom actions have id != action_type (id is the full action ID,
        # action_type is the core verb).
        custom_actions = [a for a in catalog if a["id"] != a["action_type"]]
        assert len(custom_actions) == 1
        action = custom_actions[0]
        assert action["id"] == "lims.sample.registered"
        assert action["label"] == "Sample Registered"
        assert action["action_type"] == "edited"
        assert action["target_model"] == "mods.lims.models.Entity"

    def test_register_custom_action_multiple_actions(self):
        """Multiple custom actions for the same mod are all stored."""
        reg = _fresh_registry()
        reg.register_action_model("lims", type("FakeAction", (), {}))

        reg.register_custom_action(
            mod_id="lims",
            action_id="lims.sample.registered",
            label="Sample Registered",
            core="edited",
            target_model="mods.lims.models.Entity",
        )
        reg.register_custom_action(
            mod_id="lims",
            action_id="lims.sample.aliquoted",
            label="Sample Aliquoted",
            core="edited",
            target_model="mods.lims.models.Entity",
        )

        catalog = reg.get_action_catalog("lims")
        # Custom actions: id not in the three core verb names.
        custom_actions = [a for a in catalog if a["id"] not in ("created", "edited", "deleted")]
        assert len(custom_actions) == 2

    def test_register_custom_action_different_mods(self):
        """Custom actions for different mods don't interfere."""
        reg = _fresh_registry()
        reg.register_action_model("eln", type("FakeElnAction", (), {}))
        reg.register_action_model("lims", type("FakeLimsAction", (), {}))

        reg.register_custom_action(
            mod_id="eln",
            action_id="eln.entry.exported",
            label="Entry Exported",
            core="edited",
            target_model="mods.eln.models.NotebookEntry",
        )
        reg.register_custom_action(
            mod_id="lims",
            action_id="lims.sample.registered",
            label="Sample Registered",
            core="edited",
            target_model="mods.lims.models.Entity",
        )

        eln_catalog = reg.get_action_catalog("eln")
        lims_catalog = reg.get_action_catalog("lims")
        # Custom actions have id != action_type.
        eln_custom = [a for a in eln_catalog if a["id"] not in ("created", "edited", "deleted")]
        lims_custom = [a for a in lims_catalog if a["id"] not in ("created", "edited", "deleted")]
        assert len(eln_custom) == 1
        assert len(lims_custom) == 1
        assert eln_custom[0]["id"] == "eln.entry.exported"
        assert lims_custom[0]["id"] == "lims.sample.registered"


class TestCoreActionAutoDerivation:
    """Tests for core action auto-derivation when register_action_model is called."""

    def test_core_actions_auto_derived(self):
        """Calling register_action_model auto-creates created/edited/deleted
        core action entries."""
        reg = _fresh_registry()

        class FakeAction:
            pass

        reg.register_action_model("eln", FakeAction)

        catalog = reg.get_action_catalog("eln")
        # Core actions have id == action_type (self-referential — both are the verb).
        core_action_types = {a["action_type"] for a in catalog if a["id"] == a["action_type"]}
        assert core_action_types == {"created", "edited", "deleted"}

    def test_core_actions_have_correct_labels(self):
        """Core actions have human-readable labels."""
        reg = _fresh_registry()
        reg.register_action_model("eln", type("FakeAction", (), {}))

        catalog = reg.get_action_catalog("eln")
        core_actions = {a["action_type"]: a for a in catalog if a["id"] == a["action_type"]}
        assert core_actions["created"]["label"] == "Created"
        assert core_actions["edited"]["label"] == "Edited"
        assert core_actions["deleted"]["label"] == "Deleted"

    def test_core_actions_have_target_model(self):
        """Core actions include the target_model derived from the model class."""
        reg = _fresh_registry()

        class FakeAction:
            pass

        reg.register_action_model("eln", FakeAction)

        catalog = reg.get_action_catalog("eln")
        core_actions = {a["action_type"]: a for a in catalog if a["id"] == a["action_type"]}
        for verb in ("created", "edited", "deleted"):
            assert core_actions[verb]["target_model"] is not None, \
                f"Core action '{verb}' should have a target_model"

    def test_core_actions_marked_as_core(self):
        """Core actions have id equal to action_type (self-referential)."""
        reg = _fresh_registry()
        reg.register_action_model("eln", type("FakeAction", (), {}))

        catalog = reg.get_action_catalog("eln")
        for action in catalog:
            if action["action_type"] in ("created", "edited", "deleted"):
                # Core actions: id == action_type (both are the verb).
                assert action["id"] == action["action_type"], \
                    f"Core action {action['action_type']} should have id == action_type"

    def test_no_core_actions_without_action_model(self):
        """get_action_catalog returns empty list when no action model registered."""
        reg = _fresh_registry()

        catalog = reg.get_action_catalog("nonexistent")
        assert catalog == []


class TestGetActionCatalog:
    """Tests for get_action_catalog — combined core + custom actions."""

    def test_returns_both_core_and_custom(self):
        """get_action_catalog returns core actions and custom actions together."""
        reg = _fresh_registry()
        reg.register_action_model("lims", type("FakeAction", (), {}))

        reg.register_custom_action(
            mod_id="lims",
            action_id="lims.sample.registered",
            label="Sample Registered",
            core="edited",
            target_model="mods.lims.models.Entity",
        )

        catalog = reg.get_action_catalog("lims")
        # 3 core + 1 custom = 4 actions
        assert len(catalog) == 4
        action_ids = {a["id"] for a in catalog}
        assert "created" in action_ids
        assert "edited" in action_ids
        assert "deleted" in action_ids
        assert "lims.sample.registered" in action_ids

    def test_custom_action_core_field_points_to_core_verb(self):
        """Custom actions have action_type pointing to the base core verb."""
        reg = _fresh_registry()
        reg.register_action_model("lims", type("FakeAction", (), {}))

        reg.register_custom_action(
            mod_id="lims",
            action_id="lims.sample.aliquoted",
            label="Sample Aliquoted",
            core="edited",
            target_model="mods.lims.models.Entity",
        )

        catalog = reg.get_action_catalog("lims")
        # Custom actions have the full ID in the "id" field.
        custom = [a for a in catalog if a["id"] == "lims.sample.aliquoted"]
        assert len(custom) == 1
        # The action_type for custom actions is the core verb.
        assert custom[0]["action_type"] == "edited"
        assert custom[0]["label"] == "Sample Aliquoted"

    def test_returns_copy_not_reference(self):
        """Mutation of returned catalog does not affect internal state."""
        reg = _fresh_registry()
        reg.register_action_model("eln", type("FakeAction", (), {}))

        catalog = reg.get_action_catalog("eln")
        catalog.append({"id": "fake", "label": "Fake", "action_type": "created", "target_model": None})

        catalog2 = reg.get_action_catalog("eln")
        assert len(catalog2) == 3  # Only the 3 core actions


class TestValidateAction:
    """Tests for validate_action."""

    def test_valid_core_action_returns_true(self):
        """validate_action returns True for a recognized core action verb."""
        reg = _fresh_registry()
        reg.register_action_model("eln", type("FakeAction", (), {}))

        # Core verbs are valid even without target prefix
        assert reg.validate_action("created") is True
        assert reg.validate_action("edited") is True
        assert reg.validate_action("deleted") is True

    def test_valid_custom_action_returns_true(self):
        """validate_action returns True for a registered custom action."""
        reg = _fresh_registry()
        reg.register_action_model("lims", type("FakeAction", (), {}))

        reg.register_custom_action(
            mod_id="lims",
            action_id="lims.sample.registered",
            label="Sample Registered",
            core="edited",
            target_model="mods.lims.models.Entity",
        )

        assert reg.validate_action("lims.sample.registered") is True

    def test_unregistered_action_returns_false(self):
        """validate_action returns False for an unknown action type."""
        reg = _fresh_registry()
        reg.register_action_model("eln", type("FakeAction", (), {}))

        assert reg.validate_action("unknown.action.type") is False

    def test_unregistered_core_verb_returns_false(self):
        """validate_action returns False for an unregistered core verb."""
        reg = _fresh_registry()

        # No mod registered — even core verbs fail
        assert reg.validate_action("created") is False

    def test_partial_match_returns_false(self):
        """validate_action returns False for a partial match."""
        reg = _fresh_registry()
        reg.register_action_model("lims", type("FakeAction", (), {}))

        reg.register_custom_action(
            mod_id="lims",
            action_id="lims.sample.registered",
            label="Sample Registered",
            core="edited",
            target_model="mods.lims.models.Entity",
        )

        # Partial/substring match should not count
        assert reg.validate_action("lims.sample.reg") is False
        assert reg.validate_action("lims.sample.registered.extra") is False

    def test_multiple_mods_validate_independently(self):
        """Each mod's catalog is validated independently."""
        reg = _fresh_registry()
        reg.register_action_model("eln", type("FakeAction", (), {}))
        reg.register_action_model("lims", type("FakeAction", (), {}))

        reg.register_custom_action(
            mod_id="lims",
            action_id="lims.sample.registered",
            label="Sample Registered",
            core="edited",
            target_model="mods.lims.models.Entity",
        )

        # eln has core actions but not the custom lims action
        assert reg.validate_action("created") is True  # eln has it
        assert reg.validate_action("lims.sample.registered") is True  # lims has it


class TestCustomActionRegistrationWithoutModel:
    """Edge-case tests for register_custom_action."""

    def test_register_custom_action_without_action_model_raises(self):
        """Registering a custom action for a mod without register_action_model
        should raise ValueError."""
        reg = _fresh_registry()

        with pytest.raises(ValueError, match="register_action_model"):
            reg.register_custom_action(
                mod_id="fake",
                action_id="fake.widget.exported",
                label="Exported",
                core="edited",
                target_model="fake.models.Widget",
            )

    def test_register_custom_action_with_invalid_core_raises(self):
        """register_custom_action rejects an invalid core verb."""
        reg = _fresh_registry()
        reg.register_action_model("eln", type("FakeAction", (), {}))

        with pytest.raises(ValueError, match="Must be one of"):
            reg.register_custom_action(
                mod_id="eln",
                action_id="eln.entry.viewed",
                label="Entry Viewed",
                core="viewed",  # invalid — not created/edited/deleted
                target_model="mods.eln.models.NotebookEntry",
            )
