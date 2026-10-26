"""BackendModRegistry — unified registration API for backend mods.

One import, one object for all backend registrations.  Mods call
``registry.register_*()`` in their ``mod.py.register()`` function and
query methods return the collected data.

Usage::

    from helix_core.mod_system.registry import registry

    # In mod.py register():
    registry.register_service("lims.cascadeEntryStatus", cascade_handler)

    # Cross-mod behavioral call:
    result = registry.call("lims.cascadeSourceStatus", source_type_id=42, source_id=42, status="finished")
    services = registry.list_services()

    # In config/urls.py:
    urlpatterns += registry.build_urlpatterns()
"""

from __future__ import annotations

import re
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, Generator, Mapping, Optional

from helix_core.mod_system.manifest import ModManifest

# ── constants ────────────────────────────────────────────────────────────────

# The four core action verbs that every mod gets automatically.
# "read" is an authorization-only verb — it participates in policy
# evaluation but is rejected by the audit-log insertion endpoint.
CORE_ACTION_VERBS = ("read", "created", "edited", "deleted")

# Human-readable labels matching the core verbs.
CORE_ACTION_LABELS = {
    "read": "Read",
    "created": "Created",
    "edited": "Edited",
    "deleted": "Deleted",
}


@dataclass(frozen=True, slots=True)
class ContentSourceProvider:
    """Backend capabilities for one Library content source."""

    kind: str
    model_reference: Any
    visibility_query: Callable[..., Any] | None = None
    serializer: Any = None
    display_metadata: Mapping[str, Any] = field(default_factory=dict)
    hub_visible: bool = False
    mutation_handlers: Mapping[str, Callable[..., Any]] = field(default_factory=dict)
    capabilities: tuple[str, ...] = ()
    provider_mod_id: str | None = None


@dataclass(frozen=True, slots=True)
class ReviewTargetProvider:
    """A Mod's declaration of the record scope and renderer accepted by Platform review."""

    identity: str
    target_model_reference: Any
    revision_groups: tuple[str, ...]
    renderer: Callable[..., Any]
    renderer_version: str
    evidence_capture: Callable[..., Mapping[str, Any]] | None = None
    annotation_capabilities: tuple[str, ...] = ()
    anchor_validator: Callable[..., bool] | None = None
    operation_effects: Mapping[str, tuple[str, ...]] = field(default_factory=dict)
    provider_mod_id: str | None = None

FORMULA_FUNCTION_ID = re.compile(r"^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$")


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
        self._action_providers: dict[str, tuple[str, str]] = {}
        self._record_actions: dict[str, dict[str, Any]] = {}
        # Revision-group registrations may intentionally share a historical
        # target alias; preserve all declarations so resolution can fail
        # closed instead of silently choosing the last provider.
        self._revision_group_registrations: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        self._url_patterns: dict[str, list] = defaultdict(list)
        self._settings: dict[str, dict[str, Any]] = defaultdict(dict)
        self._signal_registrations: list[dict[str, Any]] = []
        self._services: dict[str, Callable[..., Any]] = {}
        self._registered_models: dict[str, type | str] = {}
        self._source_kinds: dict[str, Any] = {}
        self._content_sources: dict[str, ContentSourceProvider] = {}
        self._review_targets: dict[str, ReviewTargetProvider] = {}
        self._formula_functions: dict[str, dict[str, Any]] = {}
        # Generic capability-bearing registrations.  Keep the common shape in
        # one place so new registry citizens do not grow bespoke capability
        # stores or payload conventions.
        self._capability_registrations: dict[str, dict[str, dict[str, Any]]] = {
            "services": {},
            "blocks": {},
            "slots": {},
            "metricProviders": {},
        }

        # Optional: topological mod order for build_urlpatterns().
        # Set via set_mod_order() after loader runs.
        # Each entry is a mod ID (not a dotted path).
        self._mod_order: list[str] = []

        # Mod manifests keyed by mod ID.  Set via set_mod_order().
        self._manifests: dict[str, ModManifest] = {}

        # ── action catalog ───────────────────────────────────────────────
        # Custom actions keyed by (mod_id, action_id).
        # Each entry: {"action_type": str, "label": str, "core": str,
        #               "target_model": str}
        self._custom_actions: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)

        # Core action verbs per mod.  Populated automatically when
        # register_action_model() is called.
        # Each entry: {"created": {...}, "edited": {...}, "deleted": {...}}
        self._core_actions: dict[str, dict[str, dict[str, Any]]] = {}
        # Registrations may refer to contributions from a mod that has not
        # run yet.  Keep intent here and resolve it only at the boot barrier.
        self._pending_schema_types: list[dict[str, Any]] = []
        self._pending_public_signals: list[dict[str, Any]] = []

    # These methods are intentionally adapter-only.  Mod packages use the
    # owner-bound facade in ``helix_core`` rather than this registry.
    def register_model_reference(self, reference: str, model: type | str) -> None:
        if reference in self._registered_models:
            raise ValueError(f"Duplicate model reference '{reference}'")
        self._registered_models[reference] = model

    def get_registered_models(self) -> dict[str, type | str]:
        return dict(self._registered_models)

    def register_source_kind(
        self,
        kind: str,
        model_reference: Any,
        **kwargs: Any,
    ) -> None:
        """Register the legacy model-only form of a source kind."""
        self.register_content_source(kind, model_reference, **kwargs)

    def register_content_source(
        self,
        kind: str,
        model_reference: Any,
        *,
        visibility_query: Callable[..., Any] | None = None,
        serializer: Any = None,
        display_metadata: Mapping[str, Any] | None = None,
        hub_visible: bool = False,
        mutation_handlers: Mapping[str, Callable[..., Any]] | None = None,
        capabilities: list[str] | None = None,
        provider_mod_id: str | None = None,
    ) -> None:
        if kind in self._source_kinds:
            raise ValueError(f"Duplicate source kind '{kind}'")
        self._source_kinds[kind] = model_reference
        self._content_sources[kind] = ContentSourceProvider(
            kind=kind,
            model_reference=model_reference,
            visibility_query=visibility_query,
            serializer=serializer,
            display_metadata=dict(display_metadata or {}),
            hub_visible=hub_visible,
            mutation_handlers=dict(mutation_handlers or {}),
            capabilities=tuple(dict.fromkeys(capabilities or [])),
            provider_mod_id=provider_mod_id,
        )
        self._register_capability(
            "services", kind, capabilities=capabilities,
            registration_type="content_source", provider_mod_id=provider_mod_id,
        )

    def _register_capability(
        self,
        kind: str,
        registration_id: str,
        *,
        capabilities: list[str] | None = None,
        **metadata: Any,
    ) -> None:
        self._capability_registrations[kind][registration_id] = {
            "id": registration_id,
            "capabilities": list(dict.fromkeys(capabilities or [])),
            **metadata,
        }

    def get_source_kinds(self) -> dict[str, Any]:
        return dict(self._source_kinds)

    def get_content_source(self, kind: str) -> ContentSourceProvider | None:
        provider = self._content_sources.get(kind)
        if provider is not None:
            return provider
        local_kind = kind.rsplit(":", 1)[-1]
        owner_alias = kind.rsplit(":", 1)[0] if ":" in kind else None
        return next(
            (
                item
                for key, item in self._content_sources.items()
                if key.rsplit(":", 1)[-1] == local_kind
                and (
                    owner_alias is None
                    or key.rsplit(":", 1)[0] == owner_alias
                    or key.rsplit(":", 1)[0].endswith(f".{owner_alias}")
                )
            ),
            None,
        )

    def register_review_target(
        self, identity: str, target_model_reference: Any, *,
        revision_groups: list[str], renderer: Callable[..., Any],
        renderer_version: str, annotation_capabilities: list[str] | None = None,
        evidence_capture: Callable[..., Mapping[str, Any]] | None = None,
        anchor_validator: Callable[..., bool] | None = None,
        operation_effects: Mapping[str, list[str]] | None = None,
        provider_mod_id: str | None = None,
    ) -> None:
        if identity in self._review_targets:
            raise ValueError(f"Duplicate review target registration '{identity}'")
        if not revision_groups or any(not isinstance(key, str) or not key for key in revision_groups):
            raise ValueError("Review targets must declare at least one Revision Group")
        if len(set(revision_groups)) != len(revision_groups):
            raise ValueError("Review target Revision Groups must be unique")
        if not callable(renderer) or not isinstance(renderer_version, str) or not renderer_version:
            raise ValueError("Review target rendering requires a callable and exact version")
        if evidence_capture is not None and not callable(evidence_capture):
            raise TypeError("evidence_capture must be callable")
        if anchor_validator is not None and not callable(anchor_validator):
            raise TypeError("anchor_validator must be callable")
        effects = operation_effects or {}
        if not isinstance(effects, Mapping) or any(
            not isinstance(operation, str) or not operation
            or not isinstance(groups, (list, tuple))
            or any(group not in revision_groups for group in groups)
            for operation, groups in effects.items()
        ):
            raise ValueError("Operation effects must map operations to declared Revision Groups")
        self._review_targets[identity] = ReviewTargetProvider(
            identity=identity,
            target_model_reference=target_model_reference,
            revision_groups=tuple(revision_groups),
            renderer=renderer,
            renderer_version=renderer_version,
            evidence_capture=evidence_capture,
            annotation_capabilities=tuple(dict.fromkeys(annotation_capabilities or [])),
            anchor_validator=anchor_validator,
            operation_effects={key: tuple(value) for key, value in effects.items()},
            provider_mod_id=provider_mod_id,
        )

    def get_review_target(self, identity: str) -> ReviewTargetProvider | None:
        return self._review_targets.get(identity)

    def resolve_content_source_model(self, kind: str) -> type:
        """Resolve a provider's model reference without importing its mod."""
        provider = self.get_content_source(kind)
        if provider is None:
            raise KeyError(f"Unknown content source kind '{kind}'")
        reference = provider.model_reference
        reference_id = getattr(reference, "id", reference)
        model = self._registered_models.get(reference_id)
        if model is None:
            raise LookupError(f"Model reference '{reference_id}' is unresolved")
        if isinstance(model, str):
            from django.apps import apps

            model = apps.get_model(model)
        return model

    def get_content_sources(self) -> dict[str, ContentSourceProvider]:
        return dict(self._content_sources)

    def list_content_sources(self) -> tuple[ContentSourceProvider, ...]:
        """Enumerate providers in registration order for generic consumers."""
        return tuple(self._content_sources.values())

    def content_source_models(self) -> tuple[tuple[ContentSourceProvider, type], ...]:
        """Return registered source providers whose models are available.

        Consumers use this instead of importing another mod's model.  A
        provider can be registered before its optional app is installed, so
        unresolved providers are intentionally skipped.
        """
        resolved = []
        for provider in self.list_content_sources():
            try:
                resolved.append((provider, self.resolve_content_source_model(provider.kind)))
            except (KeyError, LookupError):
                continue
        return tuple(resolved)

    def query_source_kind(self, kind: str, request: Any, queryset: Any = None) -> Any:
        """Compatibility spelling for consumers that work with source kinds."""
        return self.query_content_sources(kind, request, queryset)

    def query_content_sources(self, kind: str, request: Any, queryset: Any = None) -> Any:
        """Apply a provider's visibility query to a queryset.

        Providers may accept either ``(request, queryset)`` or just ``request``;
        the latter is useful when the provider owns query construction.
        """
        provider = self.get_content_source(kind)
        if provider is None:
            raise KeyError(f"Unknown content source kind '{kind}'")
        if provider.visibility_query is None:
            return queryset
        try:
            return provider.visibility_query(request, queryset)
        except TypeError:
            return provider.visibility_query(request)

    def register_public_signal(
        self, mod_id: str, kind: Any, sender_ref: Any, sender: type, handler: Callable[..., Any]
    ) -> None:
        from django.db.models.signals import (
            post_delete,
            post_save,
            pre_delete,
            pre_save,
        )

        signal = {
            "model.pre_save": pre_save,
            "model.post_save": post_save,
            "model.pre_delete": pre_delete,
            "model.post_delete": post_delete,
        }.get(str(kind))
        if signal is not None:
            signal.connect(handler, sender=sender)
        self._signal_registrations.append({
            "mod_id": mod_id,
            "kind": kind,
            "sender_ref": sender_ref,
            "sender": sender,
            "handler": handler,
        })

    def resolve_references(self) -> None:
        """Resolve all deferred cross-registration references together.

        Sorting by stable reference ID makes diagnostics independent of mod
        discovery order and prevents a partially populated registry from
        changing the result.
        """
        pending_schema = sorted(self._pending_schema_types, key=lambda item: str(item["model_ref"]))
        pending_signals = sorted(self._pending_public_signals, key=lambda item: (str(item["sender_ref"]), item["mod_id"]))
        self._pending_schema_types.clear()
        self._pending_public_signals.clear()
        errors: list[str] = []

        for item in pending_schema:
            model = self._registered_models.get(item["model_ref"].id)
            if model is None:
                errors.append(
                    f"Model reference '{item['model_ref']}' required by schema "
                    f"'{item['display_name']}' is unresolved. Register the model first."
                )
                continue
            model_path = model if isinstance(model, str) else f"{model.__module__}.{model.__qualname__}"
            schema_item = {key: value for key, value in item.items() if key != "model_ref"}
            self.register_schema_type(**{**schema_item, "model": model_path})

        for item in pending_signals:
            model = self._registered_models.get(item["sender_ref"].id)
            if model is None:
                errors.append(
                    f"Model reference '{item['sender_ref']}' required by signal "
                    f"for mod '{item['mod_id']}' is unresolved."
                )
                continue
            self.register_public_signal(
                item["mod_id"], item["kind"], item["sender_ref"], model, item["handler"]
            )

        if errors:
            raise ValueError("Unresolved registrations:\n" + "\n".join(errors))

    # ── mod order ────────────────────────────────────────────────────────

    def set_mod_order(
        self,
        dotted_paths: list[str],
        manifests: dict[str, ModManifest] | None = None,
    ) -> None:
        """Set the topological mod order from the loader's sorted output.

        Each entry in *dotted_paths* is a string like
            ``"bundled.labelling.tags"`` (for Bundled Mods) or ``"my_plugin"`` (for
            External Mods).  For Bundled Mods the final dot-separated segment
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
            # For Bundled Mods: "bundled.labelling.tags" section → "tags"
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

    def register_formula_function(
        self,
        function_id: str,
        *,
        argument_kinds: list[str],
        result_kind: str,
        description: str,
        implementation: Callable[..., Any],
        client_implemented: bool = False,
    ) -> None:
        """Register one authoritative formula function and its public metadata."""
        if not FORMULA_FUNCTION_ID.fullmatch(function_id):
            raise ValueError(
                "Formula function IDs must be identifiers or namespaced identifiers"
            )
        if function_id in self._formula_functions:
            raise ValueError(f"Duplicate formula function ID '{function_id}'")
        self._formula_functions[function_id] = {
            "id": function_id,
            "argumentKinds": list(argument_kinds),
            "resultKind": result_kind,
            "description": description,
            "clientImplemented": client_implemented,
            "implementation": implementation,
        }

    def get_formula_function(self, function_id: str) -> dict[str, Any] | None:
        """Return a registered formula function, including its implementation."""
        return self._formula_functions.get(function_id)

    def get_formula_catalog(self) -> list[dict[str, Any]]:
        """Return serializable formula metadata in deterministic order."""
        return [
            {
                key: value
                for key, value in function.items()
                if key != "implementation"
            }
            for function in sorted(
                self._formula_functions.values(), key=lambda item: item["id"]
            )
        ]

    def register_schema_type(
        self,
        *,
        display_name: str,
        workspace_id: str,
        model: str,
        columns: list[dict[str, Any]] | None = None,
        capabilities: list[str] | None = None,
        prefix: str,
        schema_name: str = "Default",
        icon: str = "",
        color: str = "",
    ) -> None:
        """Create-or-ensure a SchemaType row and a default Schema row.

        Idempotent across boots — safe to call on every ``mod.py.register()``.
        Uses ``update_or_create`` so repeated calls with the same identity
        don't create duplicates, and changed fields (columns, display_name,
            capabilities) are updated in-place.
        are updated in-place.

        Parameters:
            display_name: Human-readable label for the SchemaType.
            workspace_id: The workspace that owns this schema type
                          (e.g. ``"lims"``).
            model: Dotted Python path to the model class
                   (e.g. ``"bundled.lims.models.Entity"``).
            columns: Optional list of column definition dicts.
            capabilities: Optional capabilities declared by the owning mod.
            prefix: Uppercase prefix for the default Schema's display-ID
                    generation (e.g. ``"E"``).
            schema_name: Name for the default Schema row (default ``"Default"``).
            icon: Open key string referencing an IconLibraryEntry key
                  (e.g. ``"notebook"``).
            color: Open key string referencing a ColorToken key
                   (e.g. ``"muted"``).
        """
        from django.db import OperationalError, ProgrammingError, transaction

        from helix_core.models import Schema, SchemaType

        if columns is None:
            columns = []
        if capabilities is None:
            capabilities = []

        try:
            with transaction.atomic():
                # Match Action invocation lock order: SchemaType before Schema.
                # Boot/re-registration updates are live schema mutations too.
                schema_type = SchemaType.objects.select_for_update().filter(
                    model=model
                ).first()
                if schema_type is None:
                    schema_type, _ = SchemaType.objects.update_or_create(
                        model=model,
                        defaults={
                            "display_name": display_name,
                            "workspace_id": workspace_id,
                            "columns": columns,
                            "capabilities": capabilities,
                        },
                    )
                else:
                    schema_type.display_name = display_name
                    schema_type.workspace_id = workspace_id
                    schema_type.columns = columns
                    schema_type.capabilities = capabilities
                    schema_type.save(update_fields=[
                        "display_name", "workspace_id", "columns", "capabilities"
                    ])

                schema = Schema.objects.select_for_update().filter(
                    schema_type=schema_type, is_default=True
                ).first()
                if schema is None:
                    Schema.objects.update_or_create(
                        schema_type=schema_type,
                        is_default=True,
                        defaults={
                            "name": schema_name,
                            "prefix": prefix,
                            "columns": columns,
                            "icon": icon,
                            "color": color,
                        },
                    )
                else:
                    schema.name = schema_name
                    schema.prefix = prefix
                    schema.columns = columns
                    schema.icon = icon
                    schema.color = color
                    schema.save(update_fields=[
                        "name", "prefix", "columns", "icon", "color"
                    ])
        except (OperationalError, ProgrammingError):
            # DB not available (e.g. during makemigrations) — skip.
            # The schema type will be created on next boot when the DB
            # is available and mod.py.register() runs again.
            pass

    def register_block(
        self, block_id: str, *, capabilities: list[str] | None = None, **metadata: Any
    ) -> None:
        """Register a block and its backend-declared capabilities."""
        self._register_capability("blocks", block_id, capabilities=capabilities, **metadata)

    def register_slot(
        self,
        slot_id: str,
        *,
        accepts: list[str] | None = None,
        capabilities: list[str] | None = None,
        **metadata: Any,
    ) -> None:
        """Register a slot; ``accepts`` is its capability filter."""
        accepted = list(accepts if accepts is not None else capabilities or [])
        self._register_capability(
            "slots", slot_id, capabilities=accepted, accepts=accepted, **metadata
        )

    def register_metric_provider(
        self,
        provider_id: str,
        service: Any,
        *,
        capabilities: list[str] | None = None,
        **metadata: Any,
    ) -> None:
        """Register a metric provider backed by a public service reference."""
        self._register_capability(
            "metricProviders", provider_id, capabilities=capabilities,
            service=str(service), **metadata
        )

    def list_metric_providers(self) -> dict[str, dict[str, Any]]:
        """Return the active metric-provider definitions without their handlers."""
        return {
            provider_id: dict(entry)
            for provider_id, entry in self._capability_registrations["metricProviders"].items()
        }

    def register_action_model(self, mod_id: str, model_class: type) -> None:
        """Register a concrete action model class for *mod_id*.

        Called from each mod's ``mod.py.register()``.  If *mod_id* is
        already registered the previous registration is silently replaced
        (last write wins).

        Also auto-derives the three core CRUD actions (``created``,
        ``edited``, ``deleted``) for *mod_id*.  No manual registration
        is needed for these — every mod with an action model gets them
        automatically.
        """
        self._action_models[mod_id] = model_class

        # Auto-derive core CRUD actions.
        target_path = self._derive_target_model_path(model_class)
        self._core_actions[mod_id] = {
            verb: {
                "id": verb,
                "label": CORE_ACTION_LABELS[verb],
                "action_type": verb,
                "target_model": target_path,
            }
            for verb in CORE_ACTION_VERBS
        }

    @staticmethod
    def _derive_target_model_path(model_class: type) -> str | None:
        """Derive a dotted Python path from *model_class*.

        Uses ``__module__`` and ``__qualname__``.  Returns ``None`` for
        non-Django models where the module can't be resolved.
        """
        module = getattr(model_class, "__module__", None)
        qualname = getattr(model_class, "__qualname__", None)
        if module and qualname:
            return f"{module}.{qualname}"
        return None

    def register_custom_action(
        self,
        mod_id: str,
        action_id: str,
        label: str,
        core: str,
        target_model: str,
        *,
        provider_mod_id: str | None = None,
        provider_mod_version: str | None = None,
    ) -> None:
        """Register a custom action for *mod_id*.

        Custom actions map to a core action verb (``read``,
        ``created``, ``edited``, or ``deleted``).  They appear in the
        action catalog alongside the auto-derived core actions.

        Parameters:
            mod_id: The mod that owns this action.
            action_id: Triple-dotted action type (e.g.
                ``"lims.sample.registered"``).
            label: Human-readable label (e.g. ``"Sample Registered"``).
            core: The core action verb this action maps to — must be one of
                ``"read"``, ``"created"``, ``"edited"``, ``"deleted"``.
            target_model: Dotted Python path to the target model class
                (e.g. ``"bundled.lims.models.Entity"``).

        Raises:
            ValueError: If *mod_id* has not called
                :meth:`register_action_model` yet, or if *core* is not
                one of the three valid core verbs.
        """
        if core not in CORE_ACTION_VERBS:
            raise ValueError(
                f"Invalid core verb '{core}' for custom action "
                f"'{action_id}'. Must be one of: "
                f"{', '.join(CORE_ACTION_VERBS)}."
            )

        self._custom_actions[mod_id][action_id] = {
            "id": action_id,
            "label": label,
            "action_type": core,
            "target_model": target_model,
            "provider_mod_id": provider_mod_id or mod_id,
            "provider_mod_version": provider_mod_version or "unknown",
        }

    def register_action_provider(self, mod_id: str, version: str) -> None:
        """Record a Mod as a provider of Platform-owned core Actions."""
        self._action_providers[mod_id] = (mod_id, version)
        self._core_actions.setdefault(
            mod_id,
            {
                verb: {
                    "id": verb,
                    "label": CORE_ACTION_LABELS[verb],
                    "action_type": verb,
                    "target_model": None,
                }
                for verb in CORE_ACTION_VERBS
            },
        )
        self._persist_action_definition(mod_id, "created", "Created", "created", None, mod_id, version)
        self._persist_action_definition(mod_id, "edited", "Edited", "edited", None, mod_id, version)
        self._persist_action_definition(mod_id, "deleted", "Deleted", "deleted", None, mod_id, version)

    def register_record_action(
        self,
        mod_id: str,
        action_id: str,
        label: str,
        action_contract_id: str,
        action_contract_version: str,
        handler,
        *,
        provider_mod_id: str,
        provider_mod_version: str,
    ) -> None:
        """Register an executor that can propose effects for Platform validation."""
        if not callable(handler):
            raise TypeError("Record Action handlers must be callable")
        self._record_actions[action_id] = {
            "mod_id": mod_id,
            "action_id": action_id,
            "label": label,
            "action_contract_id": action_contract_id,
            "action_contract_version": action_contract_version,
            "handler": handler,
            "provider_mod_id": provider_mod_id,
            "provider_mod_version": provider_mod_version,
        }
        self._custom_actions[mod_id][action_id] = {
            "id": action_id,
            "label": label,
            "action_type": "edited",
            "target_model": "helix.record",
            "provider_mod_id": provider_mod_id,
            "provider_mod_version": provider_mod_version,
        }

    def register_revision_group(
        self,
        group_key: str,
        target_model_reference: str,
        *,
        owner_mod_id: str,
        provider_mod_version: str,
        action_identities: Mapping[str, str],
    ) -> None:
        """Register the owner and permitted audit actions for one group."""
        if not isinstance(group_key, str) or not group_key or group_key == "record":
            raise ValueError("A non-empty Mod-owned group key is required")
        if not isinstance(target_model_reference, str) or not target_model_reference:
            raise ValueError("A target model reference is required")
        if not isinstance(owner_mod_id, str) or not owner_mod_id:
            raise ValueError("A canonical owner Mod ID is required")
        if not isinstance(provider_mod_version, str) or not provider_mod_version:
            raise ValueError("A provider Mod version is required")
        if not action_identities or any(
            verb not in {"created", "edited"}
            or not isinstance(identity, str)
            or not identity
            for verb, identity in action_identities.items()
        ):
            raise ValueError("Revision groups require registered created/edited Action identities")
        registrations = self._revision_group_registrations[(target_model_reference, group_key)]
        value = {
            "group_key": group_key,
            "target_model_reference": target_model_reference,
            "owner_mod_id": owner_mod_id,
            "provider_mod_version": provider_mod_version,
            "action_identities": dict(action_identities),
        }
        for index, current in enumerate(registrations):
            if current["owner_mod_id"] == owner_mod_id:
                registrations[index] = value
                break
        else:
            registrations.append(value)

    def resolve_revision_group_registration(
        self, target_model_reference: str, group_key: str,
    ) -> dict[str, Any] | None:
        """Resolve one exact declaration; ambiguous aliases are unavailable."""
        registrations = self._revision_group_registrations.get(
            (target_model_reference, group_key), []
        )
        if len(registrations) != 1:
            return None
        registration = dict(registrations[0])
        registration["action_identities"] = dict(registration["action_identities"])
        return registration

    def get_record_action(self, action_id: str) -> dict[str, Any] | None:
        """Return a registered Record Action including its executable handler."""
        action = self._record_actions.get(action_id)
        return dict(action) if action is not None else None

    @staticmethod
    def _persist_action_definition(
        identity_prefix: str,
        identity: str,
        label: str,
        core_action: str,
        target_model_reference: str | None,
        provider_mod_id: str,
        provider_mod_version: str,
    ) -> None:
        try:
            from helix_core.models import ActionDefinition

            ActionDefinition.objects.update_or_create(
                identity=f"{identity_prefix}:{identity}",
                defaults={
                    "label": label,
                    "core_action": core_action,
                    "target_model_reference": target_model_reference or "unknown",
                    "provider_mod_id": provider_mod_id,
                    "provider_mod_version": provider_mod_version,
                },
            )
        except Exception:
            # Registration also runs during migration discovery, before tables exist.
            pass

    @staticmethod
    def _derive_label(action_id: str) -> str:
        """Derive a human-readable label from an action ID.

        Splits the action ID by ``"."``, skips the first segment (the mod
        name), then humanizes the remaining segments:

        * If the **last** segment is a core verb (``"created"``,
          ``"edited"``, ``"deleted"``), all remaining segments are used.
        * Otherwise only the last segment is used (custom action name).

        Each segment is humanized by replacing ``"-"`` with a space and
        title-casing every word.  The resulting parts are joined with a
        single space.

        Examples::

            "eln.table.created"          → "Table Created"
            "eln.registry-table.row-added" → "Row Added"
            "eln.registry-table.entities-registered" → "Entities Registered"
        """
        parts = action_id.split(".")
        # Skip the first segment (mod name).
        remaining = parts[1:] if len(parts) > 1 else []

        if remaining and remaining[-1] in CORE_ACTION_VERBS:
            # Lifecycle action — use all remaining segments.
            label_parts = remaining
        else:
            # Custom emit action — use only the last segment.
            label_parts = remaining[-1:] if remaining else []

        return " ".join(
            segment.replace("-", " ").title() for segment in label_parts
        )

    def get_action_catalog(self, mod_id: str) -> list[dict[str, Any]]:
        """Return the full action catalog for *mod_id*.

        Returns all actions — core (``created``, ``edited``,
        ``deleted``) and custom — as a list of dicts with keys
        ``id``, ``label``, ``action_type``, and ``target_model``.

        Returns an empty list when no action model has been registered
        for *mod_id*.
        """
        result: list[dict[str, Any]] = []

        # Core actions first.
        core = self._core_actions.get(mod_id, {})
        result.extend(core.values())

        # Then custom actions.
        custom = self._custom_actions.get(mod_id, {})
        result.extend(custom.values())

        return result

    def             validate_action(self, action: str) -> bool:
        """Return ``True`` if *action* is a registered action.

        Checks core action verbs (``read``, ``created``, ``edited``,
        ``deleted``) across all registered mods, plus custom actions by
        exact match.

        Core verbs are valid as long as at least one mod has registered
        an action model — the verb itself is enough to validate.
        """
        # Core verbs: valid if any mod has registered an action model.
        if action in CORE_ACTION_VERBS:
            return bool(self._action_models or self._action_providers)

        # Custom actions: check exact match across all mods.
        for mod_actions in self._custom_actions.values():
            if action in mod_actions:
                return True

        return False

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
            manifest_dependencies = [dependency.rsplit(".", 1)[-1] for dependency in (manifest.dependency_ids if manifest else [])]
            sender_dependencies = [dependency.rsplit(".", 1)[-1] for dependency in (sender_manifest.dependency_ids if sender_manifest else [])]
            if manifest is not None and sender_mod_id not in manifest_dependencies:
                # Check reverse: is mod_id a dependency of the sender?
                if sender_manifest is not None and mod_id not in sender_dependencies:
                    raise ValueError(
                        f"Mod '{mod_id}' cannot register a signal on "
                        f"'{sender.__name__}' from mod '{sender_mod_id}' — "
                        f"'{sender_mod_id}' is neither in '{mod_id}' depends_on "
                        f"({manifest_dependencies}) nor does '{sender_mod_id}' "
                        f"depend on '{mod_id}' "
                        f"({sender_dependencies})."
                    )

        # Wrap the handler to check dependency readiness at call time.
        original_handler = handler

        def _dependency_gated_handler(sender=None, **kwargs):  # type: ignore[no-untyped-def]
            # Check that all declared dependencies are ready.
            if mod_id in self._manifests:
                for dep_id in self._manifests[mod_id].dependency_ids:
                    dep_id = dep_id.rsplit(".", 1)[-1]
                    # Try label first (e.g. "lims"), then dotted name
                    # (e.g. "bundled.lims") — Django app_configs keys
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
        for a sender in an optional model provider) or ``None`` if the sender
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

    def register_service(
        self,
        service_id: str,
        handler: Callable[..., Any],
        *,
        capabilities: list[str] | None = None,
        provider_mod_id: str | None = None,
    ) -> None:
        """Register a callable service handler for *service_id*.

        Services are the mechanism for cross-mod behavioral calls.  A mod
        registers a handler for a service ID (convention: ``"{mod}.{verbNoun}"``,
        e.g. ``"lims.cascadeEntryStatus"``) and other mods call it
        via :meth:`call`.

        Duplicate registrations for the same *service_id* silently overwrite
        (last write wins).
        """
        self._services[service_id] = handler
        self._register_capability(
            "services", service_id, capabilities=capabilities,
            registration_type="service", provider_mod_id=provider_mod_id,
        )

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

        The top-level response also includes a ``columnTypes`` key with the
        full column type registry payload, an ``iconLibrary`` key with all
        IconLibraryEntry rows, and a ``colorPalette`` key with all
        ColorToken rows.
        """
        from django.db import OperationalError, ProgrammingError

        from helix_core.column_types import registry as column_type_registry
        from helix_core.models import ColorToken, IconLibraryEntry, SchemaType

        try:
            schema_types = SchemaType.objects.filter(is_active=True).prefetch_related(
                "schemas"
            )
        except (OperationalError, ProgrammingError):
            # DB not available (e.g. during makemigrations).
            unavailable_payload = {
                "columnTypes": column_type_registry.get_registry_payload(),
                "formulaFunctions": self.get_formula_catalog(),
            }
            unavailable_payload.update({
                kind: [entries[key] for key in entries]
                for kind, entries in self._capability_registrations.items()
            })
            return unavailable_payload

        # Group schema types by workspace_id.
        grouped: dict[str, list[SchemaType]] = {}
        for st in schema_types:
            grouped.setdefault(st.workspace_id, []).append(st)

        payload: dict[str, dict[str, Any]] = {}

        for workspace_id, st_list in sorted(grouped.items()):
            schema_type_entries: list[dict[str, Any]] = []

            # Workspace identity is explicit in the wire payload.  The
            # registration model path is the stable fallback for older rows
            # that predate typed workspace metadata.
            owner_mod = workspace_id
            first_model = st_list[0].model.split(".") if st_list else []
            if len(first_model) > 1:
                candidate = first_model[1]
                owner_mod = candidate
                for manifest_id in self._manifests:
                    if manifest_id.endswith(f".{candidate}"):
                        owner_mod = manifest_id
                        break
            vendor, mod = (owner_mod.split(".", 1) if "." in owner_mod else ("helix", owner_mod))

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
                    "capabilities": st.capabilities or [],
                    "icon": default_schema.icon if default_schema else "",
                    "color": default_schema.color if default_schema else "",
                }
                schema_type_entries.append(entry)

            # ── action catalog ──────────────────────────────────────────
            actions: list[dict[str, Any]] = []
            action_model = self._action_models.get(workspace_id)
            if action_model is not None or workspace_id in self._action_providers:
                seen_ids: set[str] = set()

                # 1. Core actions contributed by the Platform provider.
                core = self._core_actions.get(workspace_id, {})
                for entry in core.values():
                    actions.append({
                        "id": entry["id"],
                        "label": entry["label"],
                        "action_type": entry["action_type"],
                    })
                    seen_ids.add(entry["id"])

                # 2. ACTION_CHOICES from the model class (backward compat).
                # Entries already covered by core actions are skipped.
                action_choices = getattr(action_model, "ACTION_CHOICES", None)
                if action_choices:
                    for choice_id, choice_label in action_choices:
                        if choice_id not in seen_ids:
                            actions.append({
                                "id": choice_id,
                                "label": choice_label,
                                "action_type": choice_id,
                            })
                            seen_ids.add(choice_id)

                # 3. Custom actions registered via register_custom_action().
                custom = self._custom_actions.get(workspace_id, {})
                for entry in custom.values():
                    if entry["id"] not in seen_ids:
                        actions.append({
                            "id": entry["id"],
                            "label": entry["label"],
                            "action_type": entry["action_type"],
                        })
                        seen_ids.add(entry["id"])

                # 4. Fallback: default core set when nothing else is
                #    registered (no register_action_model call, no
                #    ACTION_CHOICES, no custom actions).
                if not actions:
                    actions = [
                        {"id": "created", "label": "Created", "action_type": "created"},
                        {"id": "updated", "label": "Updated", "action_type": "edited"},
                        {"id": "deleted", "label": "Deleted", "action_type": "deleted"},
                    ]

            payload[workspace_id] = {
                "workspaceId": workspace_id,
                "vendor": vendor,
                "mod": mod,
                "workspace": workspace_id,
                "schemaTypes": schema_type_entries,
                "actions": actions,
            }

        # Insert columnTypes at the top level.
        payload["columnTypes"] = column_type_registry.get_registry_payload()
        payload["formulaFunctions"] = self.get_formula_catalog()
        payload["recordActions"] = sorted(({
            "id": action["action_id"],
            "label": action["label"],
            "contract_id": action["action_contract_id"],
            "contract_version": action["action_contract_version"],
            "provider_mod_id": action["provider_mod_id"],
            "provider_mod_version": action["provider_mod_version"],
        } for action in self._record_actions.values()), key=lambda action: (action["contract_id"], action["contract_version"], action["id"]))

        # Generic registrations are hydrated as plain records.  They are
        # intentionally separate from workspace schema types: consumers can
        # discover any citizen without importing its provider.
        for kind, entries in self._capability_registrations.items():
            payload[kind] = [entries[key] for key in entries]

        # ── icon library ──────────────────────────────────────────────
        icon_entries: list[dict[str, Any]] = []
        try:
            for entry in IconLibraryEntry.objects.all():
                icon_entries.append({
                    "key": entry.key,
                    "label": entry.label,
                    "kind": entry.kind,
                    "token": entry.token,
                    "svg": entry.svg,
                })
        except (OperationalError, ProgrammingError):
            pass
        payload["iconLibrary"] = icon_entries

        # ── color palette ─────────────────────────────────────────────
        color_entries: list[dict[str, Any]] = []
        try:
            for ct in ColorToken.objects.all():
                color_entries.append({
                    "key": ct.key,
                    "label": ct.label,
                    "hex": ct.hex,
                    "hexDark": ct.hex_dark,
                    "hexLight": ct.hex_light,
                })
        except (OperationalError, ProgrammingError):
            pass
        payload["colorPalette"] = color_entries

        return payload

    # ── query methods ────────────────────────────────────────────────────

    def get_action_model(self, mod_id: str) -> Optional[type]:
        """Return the registered action model class for *mod_id*.

        Returns ``None`` when no model has been registered for *mod_id*.
        """
        return self._action_models.get(mod_id)

    def has_action_model(self, mod_id: str) -> bool:
        """Return ``True`` if *mod_id* has registered an action model."""
        return mod_id in self._action_models or mod_id in self._action_providers

    def is_mod_known(self, mod_id: str) -> bool:
        """Return ``True`` if *mod_id* is in the known mod order.

        A mod is "known" when it was part of the topological sort
        produced by ``HelixCoreConfig.ready()``.  Test mods and ad-hoc
        modules are never known.
        """
        return mod_id in self._mod_order

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
