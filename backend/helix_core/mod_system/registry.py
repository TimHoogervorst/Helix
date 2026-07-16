"""BackendModRegistry — unified registration API for backend mods.

One import, one object for all backend registrations.  Mods call
``registry.register_*()`` in their ``AppConfig.ready()`` and query
methods return the collected data.

Usage::

    from helix_core.mod_system.registry import registry

    # In AppConfig.ready():
    registry.register_action_model("eln", ElnAction)
    registry.register_urls("eln", [path("api/eln/", include("core_mods.eln.urls"))])
    registry.register_entity_type({"prefix": "BLOOD", "name": "Blood Sample", "mod_id": "lims"})
    registry.register_setting("eln", "eln_lock_timeout_minutes", 5)
    registry.register_signal("eln", post_save, handler, sender=NotebookEntry)

    # In config/urls.py:
    urlpatterns += registry.build_urlpatterns()
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Callable, Optional

from helix_core.mod_system.manifest import ModManifest


class BackendModRegistry:
    """Singleton registry for backend mod registrations.

    Each ``register_*()`` method records data keyed by mod ID.  Duplicate
    registrations for the same key silently overwrite (last write wins).

    Query methods return collected data.  ``build_urlpatterns()`` returns
    Django URL patterns in dependency order (dependencies before dependents).
    """

    def __init__(self) -> None:
        # ── storage ──────────────────────────────────────────────────────
        self._action_models: dict[str, type] = {}
        self._url_patterns: dict[str, list] = defaultdict(list)
        self._entity_types: dict[str, dict[str, Any]] = {}
        self._settings: dict[str, dict[str, Any]] = defaultdict(dict)
        self._signal_registrations: list[dict[str, Any]] = []

        # Optional: topological mod order for build_urlpatterns().
        # Set via set_mod_order() after loader runs.
        # Each entry is a mod ID (not a dotted path).
        self._mod_order: list[str] = []

        # Mod manifests keyed by mod ID.  Set via set_mod_order().
        self._manifests: dict[str, ModManifest] = {}

    # ── mod order ────────────────────────────────────────────────────────

    def set_mod_order(
        self,
        dotted_paths: list[str],
        manifests: dict[str, ModManifest] | None = None,
    ) -> None:
        """Set the topological mod order from the loader's sorted output.

        Each entry in *dotted_paths* is a string like
        ``"core_mods.tags"`` — the final segment is extracted as the mod ID.

        If *manifests* is provided, they are stored for dependency-aware
        signal validation.

        Called once during ``HelixCoreConfig.ready()`` before any URL
        patterns are collected.
        """
        self._mod_order = [path.split(".")[-1] for path in dotted_paths]
        if manifests is not None:
            self._manifests = dict(manifests)

    # ── registration methods ─────────────────────────────────────────────

    def register_action_model(self, mod_id: str, model_class: type) -> None:
        """Register a concrete action model class for *mod_id*.

        Called from each mod's ``AppConfig.ready()``.  If *mod_id* is
        already registered the previous registration is silently replaced
        (last write wins).
        """
        self._action_models[mod_id] = model_class

    def register_urls(self, mod_id: str, url_patterns: list) -> None:
        """Register URL patterns for *mod_id*.

        *url_patterns* should be a list of Django ``path()``, ``re_path()``,
        or ``include()`` entries.  Duplicate registrations for the same
        *mod_id* overwrite the previous patterns.
        """
        self._url_patterns[mod_id] = list(url_patterns)

    def register_entity_type(self, config: dict[str, Any]) -> None:
        """Register an entity type configuration.

        *config* must include a ``"prefix"`` key — the value is used as the
        registration key.  Typical keys: ``prefix``, ``name``, ``icon``,
        ``mod_id``, ``workspace_id``.

        Duplicate registrations for the same prefix silently overwrite.
        """
        prefix = config.get("prefix")
        if not prefix:
            raise ValueError(
                "register_entity_type: config must include a non-empty 'prefix' key."
            )
        self._entity_types[prefix] = dict(config)

    def register_setting(self, mod_id: str, key: str, default: Any) -> None:
        """Declare ownership of a setting key for *mod_id*.

        Settings are freeform key-value pairs.  Typed validation is deferred
        to a future phase.  Duplicate registrations for the same (*mod_id*,
        *key*) silently overwrite.
        """
        self._settings[mod_id][key] = default

    def register_signal(
        self,
        mod_id: str,
        signal: Any,
        handler: Callable[..., Any],
        sender: Any,
    ) -> None:
        """Register a Django signal connection for *mod_id*.

        Validates that the *sender*'s mod is either *mod_id* itself, a
        declared dependency of *mod_id*, or a dependent of *mod_id*
        (i.e. the sender's mod declares *mod_id* in its own
        ``depends_on``).  The handler is wrapped so that it only executes
        when *mod_id*'s dependencies are satisfied (all dependent mods'
        ``AppConfig.ready()`` have run).

        Parameters:
            mod_id: The mod that owns this signal connection.
            signal: A Django signal (e.g. ``django.db.models.signals.post_save``).
            handler: The signal handler function.
            sender: The model class that sends the signal.

        Raises:
            ValueError: If the sender's mod is not *mod_id*, not in
                *mod_id*'s ``depends_on`` list, and *mod_id* is not in the
                sender mod's ``depends_on`` list.
        """
        from django.apps import apps

        # Determine which mod owns the sender model.
        sender_mod_id = self._resolve_mod_id(sender)

        # Validate: sender's mod must be mod_id, a declared dependency of
        # mod_id, or a dependent of mod_id (observer pattern — the sender
        # depends on us, so we are allowed to listen to its signals).
        if sender_mod_id is not None and sender_mod_id != mod_id:
            manifest = self._manifests.get(mod_id)
            sender_manifest = self._manifests.get(sender_mod_id)
            if manifest is not None and sender_mod_id not in manifest.depends_on:
                # Check reverse: is mod_id a dependency of the sender?
                if sender_manifest is not None and mod_id not in sender_manifest.depends_on:
                    raise ValueError(
                        f"Mod '{mod_id}' cannot register a signal on "
                        f"'{sender.__name__}' from mod '{sender_mod_id}' — "
                        f"'{sender_mod_id}' is neither in '{mod_id}' depends_on "
                        f"({manifest.depends_on}) nor does '{sender_mod_id}' "
                        f"depend on '{mod_id}' "
                        f"({sender_manifest.depends_on})."
                    )

        # Wrap the handler to check dependency readiness at call time.
        original_handler = handler

        def _dependency_gated_handler(sender_instance=None, **kwargs):  # type: ignore[no-untyped-def]
            # Check that all declared dependencies are ready.
            if mod_id in self._manifests:
                for dep_id in self._manifests[mod_id].depends_on:
                    dep_app_label = f"core_mods.{dep_id}"
                    dep_config = apps.app_configs.get(dep_app_label)
                    if dep_config is None:
                        # Dependency not installed — don't fire.
                        return None
                    if not dep_config.ready:
                        # Dependency not ready yet — don't fire.
                        return None
            return original_handler(sender=sender_instance, **kwargs)

        signal.connect(_dependency_gated_handler, sender=sender)
        self._signal_registrations.append({
            "mod_id": mod_id,
            "signal": signal,
            "handler": handler,
            "sender": sender,
        })

    @staticmethod
    def _resolve_mod_id(sender: Any) -> str | None:
        """Resolve a sender model class to its mod ID.

        Inspects ``sender.__module__``.  Returns the mod ID (e.g. ``"eln"``
        for a sender in ``core_mods.eln.models``) or ``None`` if the sender
        is not part of a known mod package.
        """
        module_name = getattr(sender, "__module__", "")
        if not module_name:
            return None

        # core_mods.<mod_id>.<rest> → extract mod_id
        if module_name.startswith("core_mods."):
            parts = module_name.split(".")
            if len(parts) >= 2:
                return parts[1]

        return None

    # ── query methods ────────────────────────────────────────────────────

    def get_action_model(self, mod_id: str) -> Optional[type]:
        """Return the registered action model class for *mod_id*.

        Returns ``None`` when no model has been registered for *mod_id*.
        """
        return self._action_models.get(mod_id)

    def get_url_patterns(self) -> dict[str, list]:
        """Return all registered URL patterns in dependency order.

        The returned dict preserves insertion order (Python 3.7+) with
        mods sorted by their position in the topological sort.  Mods not
        in the mod order appear alphabetically after known mods.
        """
        known_order: dict[str, int] = {
            mod_id: i for i, mod_id in enumerate(self._mod_order)
        }

        def _sort_key(item: tuple[str, list]) -> tuple[int, str]:
            mod_id = item[0]
            if mod_id in known_order:
                return (0, known_order[mod_id], mod_id)
            return (1, 0, mod_id)

        sorted_items = sorted(
            self._url_patterns.items(),
            key=_sort_key,
        )
        return dict(sorted_items)

    def get_entity_types(self) -> dict[str, dict[str, Any]]:
        """Return all registered entity type configs as ``{prefix: config}``."""
        return dict(self._entity_types)

    def get_settings(self, mod_id: str) -> dict[str, Any]:
        """Return all registered settings for *mod_id*.

        Returns an empty dict if no settings have been registered.
        """
        return dict(self._settings.get(mod_id, {}))

    def get_signal_registrations(self) -> list[dict[str, Any]]:
        """Return all registered signal connections."""
        return list(self._signal_registrations)

    # ── URL pattern builder ──────────────────────────────────────────────

    def build_urlpatterns(self) -> list:
        """Return all registered URL patterns in dependency order.

        Mods are ordered by their position in the topological sort
        (dependencies before dependents).  Mods not present in the mod
        order (e.g. ``core`` or ``core.mentions`` which are not
        auto-discovered) are appended alphabetically after all known mods.

        Returns a flat list of Django URL pattern objects suitable for
        appending to the root ``urlpatterns`` list.
        """
        from django.urls.resolvers import URLPattern, URLResolver

        # Map each mod_id to its position in the topological order.
        known_order: dict[str, int] = {
            mod_id: i for i, mod_id in enumerate(self._mod_order)
        }

        # Separate mods with a known position from unknowns.
        known: list[tuple[str, list]] = []
        unknown: list[tuple[str, list]] = []

        for mod_id, patterns in self._url_patterns.items():
            if mod_id in known_order:
                known.append((mod_id, patterns))
            else:
                unknown.append((mod_id, patterns))

        # Sort known mods by their dependency order.
        known.sort(key=lambda item: known_order[item[0]])
        # Sort unknowns alphabetically for determinism.
        unknown.sort(key=lambda item: item[0])

        # Flatten: collect all patterns in order.
        result: list[URLPattern | URLResolver] = []
        for _mod_id, patterns in known + unknown:
            result.extend(patterns)

        return result


# ── singleton ────────────────────────────────────────────────────────────────

# The module-level singleton.  Initialized with actual state in
# ``helix_core.apps.HelixCoreConfig.ready()``.
registry = BackendModRegistry()
