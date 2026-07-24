"""BackendModRegistry — unified registration API for backend mods.

One import, one object for all backend registrations.  Mods call
``registry.register_*()`` in their ``mod.py.register()`` function and
query methods return the collected data.

Usage::

    from helix_core.mod_system.registry import registry

    # In mod.py register():
    registry.register_action_model("eln", ElnAction)
    registry.register_urls("eln", [path("api/eln/", include("mods.eln.urls"))])
    registry.register_setting("eln", "eln_lock_timeout_minutes", 5)
    registry.register_signal("eln", post_save, handler, sender=NotebookEntry)
    registry.register_service("lims.cascadeEntryStatus", cascade_handler)

    # Cross-mod behavioral call:
    result = registry.call("lims.cascadeEntryStatus", source_entry_id=42, status="published")
    services = registry.list_services()

    # In config/urls.py:
    urlpatterns += registry.build_urlpatterns()
"""

from __future__ import annotations

from collections import defaultdict
from contextlib import contextmanager
from typing import Any, Callable, Generator, Optional

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
        self._settings: dict[str, dict[str, Any]] = defaultdict(dict)
        self._signal_registrations: list[dict[str, Any]] = []
        self._services: dict[str, Callable[..., Any]] = {}

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
        ``"mods.tags"`` (for core mods) or ``"my_plugin"`` (for
        external mods).  For core mods the final dot-separated segment
        is extracted as the mod ID.  For external mods the manifest
        keys are used directly to recover the original mod ID (which
        may differ from the sanitized dotted path, e.g. ``"my-plugin"``
        vs ``"my_plugin"``).

        If *manifests* is provided, they are stored for dependency-aware
        signal validation.

        Called once during ``HelixCoreConfig.ready()`` before any URL
        patterns are collected.
        """
        if manifests is not None:
            self._manifests = dict(manifests)
            # Build a reverse mapping: dotted path → manifest ID.
            # For core mods: "mods.tags" section → "tags"
            # For external mods: "my_plugin" → "my-plugin"
            path_to_id: dict[str, str] = {}
            for mod_id in manifests:
                core_path = f"mods.{mod_id}"
                path_to_id[core_path] = mod_id
            # External mods: dotted path is the sanitized mod_id.
            from helix_core.mod_system.loader import _sanitize_module_name

            for mod_id in manifests:
                if f"mods.{mod_id}" not in dotted_paths:
                    path_to_id[_sanitize_module_name(mod_id)] = mod_id

            self._mod_order = [
                path_to_id.get(path, path.split(".")[-1])
                for path in dotted_paths
            ]
        else:
            self._mod_order = [
                path.split(".")[-1] for path in dotted_paths
            ]

    # ── registration methods ─────────────────────────────────────────────

    def register_schema_type(
        self,
        *,
        display_name: str,
        workspace_id: str,
        model: str,
        columns: list[dict[str, Any]] | None = None,
        prefix: str,
        schema_name: str = "Default",
    ) -> None:
        """Create-or-ensure a SchemaType row and a default Schema row.

        Idempotent across boots — safe to call on every ``mod.py.register()``.
        Uses ``update_or_create`` so repeated calls with the same identity
        don't create duplicates, and changed fields (columns, display_name)
        are updated in-place.

        Parameters:
            display_name: Human-readable label for the SchemaType.
            workspace_id: The workspace that owns this schema type
                          (e.g. ``"lims"``).
            model: Dotted Python path to the model class
                   (e.g. ``"mods.lims.models.Entity"``).
            columns: Optional list of column definition dicts.
            prefix: Uppercase prefix for the default Schema's display-ID
                    generation (e.g. ``"E"``).
            schema_name: Name for the default Schema row (default ``"Default"``).
        """
        from django.db import OperationalError, ProgrammingError

        from helix_core.models import Schema, SchemaType

        if columns is None:
            columns = []

        try:
            schema_type, _ = SchemaType.objects.update_or_create(
                model=model,
                defaults={
                    "display_name": display_name,
                    "workspace_id": workspace_id,
                    "columns": columns,
                },
            )

            Schema.objects.update_or_create(
                schema_type=schema_type,
                is_default=True,
                defaults={
                    "name": schema_name,
                    "prefix": prefix,
                    "columns": columns,
                },
            )
        except (OperationalError, ProgrammingError):
            # DB not available (e.g. during makemigrations) — skip.
            # The schema type will be created on next boot when the DB
            # is available and mod.py.register() runs again.
            pass

    def register_action_model(self, mod_id: str, model_class: type) -> None:
        """Register a concrete action model class for *mod_id*.

        Called from each mod's ``mod.py.register()``.  If *mod_id* is
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
            if manifest is not None and sender_mod_id not in manifest.dependency_ids:
                # Check reverse: is mod_id a dependency of the sender?
                if sender_manifest is not None and mod_id not in sender_manifest.dependency_ids:
                    raise ValueError(
                        f"Mod '{mod_id}' cannot register a signal on "
                        f"'{sender.__name__}' from mod '{sender_mod_id}' — "
                        f"'{sender_mod_id}' is neither in '{mod_id}' depends_on "
                        f"({manifest.dependency_ids}) nor does '{sender_mod_id}' "
                        f"depend on '{mod_id}' "
                        f"({sender_manifest.dependency_ids})."
                    )

        # Wrap the handler to check dependency readiness at call time.
        original_handler = handler

        def _dependency_gated_handler(sender=None, **kwargs):  # type: ignore[no-untyped-def]
            # Check that all declared dependencies are ready.
            if mod_id in self._manifests:
                for dep_id in self._manifests[mod_id].dependency_ids:
                    # Try label first (e.g. "lims"), then dotted name
                    # (e.g. "mods.lims") — Django app_configs keys
                    # are app labels, which for mods are the last
                    # component of the dotted name.
                    dep_config = apps.app_configs.get(dep_id)
                    if dep_config is None:
                        # Fall back: search by full dotted name
                        dep_dotted = f"mods.{dep_id}"
                        for config in apps.app_configs.values():
                            if config.name == dep_dotted:
                                dep_config = config
                                break
                    if dep_config is None:
                        # Dependency not installed — don't fire.
                        return None
                    if not dep_config.ready:
                        # Dependency not ready yet — don't fire.
                        return None
            return original_handler(sender=sender, **kwargs)

        signal.connect(_dependency_gated_handler, sender=sender)
        self._signal_registrations.append({
            "mod_id": mod_id,
            "signal": signal,
            "handler": handler,
            "sender": sender,
            "_wrapper": _dependency_gated_handler,  # keep a strong reference
        })

    @staticmethod
    def _resolve_mod_id(sender: Any) -> str | None:
        """Resolve a sender model class to its mod ID.

        Inspects ``sender.__module__``.  Returns the mod ID (e.g. ``"eln"``
        for a sender in ``mods.eln.models``) or ``None`` if the sender
        is not part of a known mod package.
        """
        module_name = getattr(sender, "__module__", "")
        if not module_name:
            return None

        # mods.<mod_id>.<rest> → extract mod_id
        if module_name.startswith("mods."):
            parts = module_name.split(".")
            if len(parts) >= 2:
                return parts[1]

        return None

    # ── service registry ──────────────────────────────────────────────────

    def register_service(self, service_id: str, handler: Callable[..., Any]) -> None:
        """Register a callable service handler for *service_id*.

        Services are the mechanism for cross-mod behavioral calls.  A mod
        registers a handler for a service ID (convention: ``"{mod}.{verbNoun}"``,
        e.g. ``"lims.cascadeEntryStatus"``) and other mods call it
        via :meth:`call`.

        Duplicate registrations for the same *service_id* silently overwrite
        (last write wins).
        """
        self._services[service_id] = handler

    def call(self, service_id: str, *args: Any, **kwargs: Any) -> Any:
        """Invoke a registered service and return its result.

        Parameters:
            service_id: The service to invoke (e.g. ``"lims.cascadeEntryStatus"``).
            *args: Positional arguments forwarded to the handler.
            **kwargs: Keyword arguments forwarded to the handler.

        Returns:
            Whatever the handler returns.  Services must not return ORM objects
            — return platform SDK types or plain dicts instead.

        Raises:
            ValueError: If *service_id* is not registered.
        """
        if service_id not in self._services:
            available = sorted(self._services.keys())
            raise ValueError(
                f"Service '{service_id}' is not registered. "
                f"Available services: {available}"
            )
        return self._services[service_id](*args, **kwargs)

    def list_services(self) -> dict[str, Callable[..., Any]]:
        """Return all registered services as ``{service_id: handler}``."""
        return dict(self._services)

    @contextmanager
    def override(
        self,
        service_id: str,
        mock_handler: Callable[..., Any],
    ) -> Generator[None, None, None]:
        """Temporarily override a service handler for testing.

        Usage::

            with registry.override("lims.resolveEntity", mock_handler):
                # Service calls within this block use the mock
                registry.call("lims.resolveEntity", entity_id=42)
            # Original handler restored

        If *service_id* was not previously registered, it is removed after
        the context exits (rather than leaving a stale mock).

        Parameters:
            service_id: The service to override.
            mock_handler: The callable to use in place of the real handler.
        """
        original = self._services.get(service_id)
        self._services[service_id] = mock_handler
        try:
            yield
        finally:
            if original is None:
                del self._services[service_id]
            else:
                self._services[service_id] = original

    # ── mod registry payload ─────────────────────────────────────────────

    def get_registry_payload(self) -> dict[str, Any]:
        """Return all backend-owned mod data keyed by workspace ID.

        Each entry contains:

        * ``workspaceId`` — the workspace identifier (e.g. ``"lims"``).
        * ``schemaTypes`` — array of ``{id, displayName, prefix, columns}``
          objects, one per active SchemaType in this workspace.
        * ``actions`` — array of ``{id, label, core}`` objects describing
          the action catalog for this mod.

        The payload is built from already-populated ``SchemaType`` rows
        (created by ``register_schema_type()`` calls in each mod's
        ``mod.py.register()``) and registered action models.
        """
        from django.db import OperationalError, ProgrammingError

        from helix_core.models import SchemaType

        try:
            schema_types = SchemaType.objects.filter(is_active=True).prefetch_related(
                "schemas"
            )
        except (OperationalError, ProgrammingError):
            # DB not available (e.g. during makemigrations).
            return {}

        # Group schema types by workspace_id.
        grouped: dict[str, list[SchemaType]] = {}
        for st in schema_types:
            grouped.setdefault(st.workspace_id, []).append(st)

        payload: dict[str, dict[str, Any]] = {}

        for workspace_id, st_list in sorted(grouped.items()):
            schema_type_entries: list[dict[str, Any]] = []

            for st in st_list:
                # Derive schema_type_id using the same convention as the
                # SchemaTypeListSerializer: {mod}.{model_name_lower}.
                parts = st.model.split(".")
                if len(parts) >= 4:
                    st_id = f"{parts[1]}.{parts[-1].lower()}"
                else:
                    # Short model path (e.g. test-only "m.S") — use the
                    # last segment as the type name.
                    st_id = f"{workspace_id}.{parts[-1].lower()}"

                # Find the default schema for this SchemaType to get the
                # prefix and columns.
                default_schema = None
                for schema in st.schemas.all():
                    if schema.is_default and schema.is_active:
                        default_schema = schema
                        break

                entry: dict[str, Any] = {
                    "id": st_id,
                    "displayName": st.display_name,
                    "prefix": default_schema.prefix if default_schema else "",
                    "columns": st.columns or [],
                }
                schema_type_entries.append(entry)

            # ── action catalog ──────────────────────────────────────────
            actions: list[dict[str, Any]] = []
            action_model = self._action_models.get(workspace_id)
            if action_model is not None:
                action_choices = getattr(action_model, "ACTION_CHOICES", None)
                if action_choices:
                    for choice_id, choice_label in action_choices:
                        actions.append({
                            "id": choice_id,
                            "label": choice_label,
                            "core": True,
                        })
                else:
                    # Default core actions for mods without explicit
                    # ACTION_CHOICES on their model.
                    actions = [
                        {"id": "created", "label": "Created", "core": True},
                        {"id": "updated", "label": "Updated", "core": True},
                        {"id": "deleted", "label": "Deleted", "core": True},
                    ]

            payload[workspace_id] = {
                "workspaceId": workspace_id,
                "schemaTypes": schema_type_entries,
                "actions": actions,
            }

        return payload

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

        def _sort_key(item: tuple[str, list]) -> tuple[int, int, str]:
            mod_id = item[0]
            if mod_id in known_order:
                return (0, known_order[mod_id], mod_id)
            return (1, 0, mod_id)

        sorted_items = sorted(
            self._url_patterns.items(),
            key=_sort_key,
        )
        return dict(sorted_items)

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
