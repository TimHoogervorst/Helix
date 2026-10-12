"""Public backend Mod contract.

This module is the only backend API that Mod packages should import.  The
implementation deliberately delegates to the private registry so the public
contract does not expose its storage or Django wiring.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum
from importlib.util import find_spec
import json
from pathlib import Path
from typing import Any, Callable, Generic, TypeVar

from helix_core.column_types import ColumnType
from helix_core.mod_system.manifest import ModManifest

_LOCAL_KEY = re.compile(r"^[a-z][a-z0-9]*(?:[-.]?[a-z0-9]+)*$")
_PLATFORM_TAGS = {"RegistrationTable", "ResultTable"}


def _reference(mod_id: str, local_key: str) -> str:
    if not _LOCAL_KEY.fullmatch(local_key):
        raise ValueError(f"Invalid registration key '{local_key}'")
    return f"{mod_id}:{local_key}"


@dataclass(frozen=True, slots=True)
class ModelReference:
    mod_id: str
    local_key: str

    def __post_init__(self) -> None:
        _reference(self.mod_id, self.local_key)

    @property
    def id(self) -> str:
        return _reference(self.mod_id, self.local_key)

    def __str__(self) -> str:
        return self.id


@dataclass(frozen=True, slots=True)
class ServiceReference:
    mod_id: str
    local_key: str

    def __post_init__(self) -> None:
        _reference(self.mod_id, self.local_key)

    @property
    def id(self) -> str:
        return _reference(self.mod_id, self.local_key)

    def __str__(self) -> str:
        return self.id


class SignalKind(StrEnum):
    MODEL_PRE_SAVE = "model.pre_save"
    MODEL_POST_SAVE = "model.post_save"
    MODEL_PRE_DELETE = "model.pre_delete"
    MODEL_POST_DELETE = "model.post_delete"
    POST_MIGRATE = "post_migrate"


TRequest = TypeVar("TRequest")
TResponse = TypeVar("TResponse")


@dataclass(frozen=True, slots=True)
class TypedService(Generic[TRequest, TResponse]):
    reference: ServiceReference
    request_type: type[TRequest] | None = None
    response_type: type[TResponse] | None = None


class ModRegistrar:
    """Owner-bound registrar constructed from a validated manifest."""

    def __init__(
        self,
        manifest: ModManifest,
        backend_registry: Any = None,
        *,
        registry_id: str | None = None,
    ) -> None:
        self.manifest = manifest
        if backend_registry is None:
            from helix_core.mod_system.registry import registry

            backend_registry = registry
        self._registry = backend_registry
        self._models: dict[str, type] = {}
        self._registry_id = registry_id or {
            "helix.users": "core",
        }.get(manifest.id, manifest.id.rsplit(".", 1)[-1])

    @property
    def id(self) -> str:
        return self.manifest.id

    @property
    def version(self) -> str:
        return self.manifest.version

    def _owned(self, reference: ModelReference) -> None:
        if reference.mod_id != self.id:
            raise ValueError(
                f"Reference '{reference}' is owned by '{reference.mod_id}', "
                f"not '{self.id}'"
            )

    def register_model(self, local_key: str, model: type | str) -> ModelReference:
        reference = ModelReference(self.id, local_key)
        if reference.id in self._registry.get_registered_models():
            raise ValueError(f"Duplicate model reference '{reference}'")
        self._models[reference.id] = model
        self._registry.register_model_reference(reference.id, model)
        return reference

    def model_reference(self, mod_id: str, local_key: str) -> ModelReference:
        """Create a reference to an owned model or declared dependency."""
        return ModelReference(mod_id, local_key)

    def register_source_kind(
        self, local_key: str, model: ModelReference
    ) -> str:
        self._owned(model)
        kind = _reference(self.id, local_key)
        self._registry.register_source_kind(kind, model)
        return kind

    def register_schema_type(
        self,
        display_name: str,
        *,
        workspace_id: str,
        model: ModelReference,
        prefix: str,
        columns: list[dict[str, Any]] | None = None,
        tags: list[str] | None = None,
        schema_name: str = "Default",
        icon: str = "",
        color: str = "",
    ) -> None:
        self._owned(model)
        tags = list(tags or [])
        for tag in tags:
            if tag not in _PLATFORM_TAGS and not tag.startswith(f"{self.id}:"):
                raise ValueError(f"unknown schema tag '{tag}'")
        model_class = self._models.get(model.id) or self._registry.get_registered_models().get(model.id)
        if model_class is None:
            raise ValueError(f"Model reference '{model}' is not registered")
        model_path = model_class if isinstance(model_class, str) else f"{model_class.__module__}.{model_class.__qualname__}"
        self._registry.register_schema_type(
            display_name=display_name,
            workspace_id=workspace_id,
            model=model_path,
            columns=columns,
            tags=tags,
            prefix=prefix,
            schema_name=schema_name,
            icon=icon,
            color=color,
        )

    def register_column_type(self, column_type: ColumnType) -> None:
        from helix_core.column_types import registry

        registry.register_column_type(column_type)

    def register_action_model(self, model: type) -> None:
        """Register the legacy action table through the compatibility adapter."""
        self._registry.register_action_model(self._registry_id, model)

    def register_custom_action(
        self,
        local_key: str,
        label: str,
        core: str,
        target: ModelReference,
    ) -> None:
        self._owned(target)
        action_id = local_key if "." in local_key and local_key.startswith(self.id.split(".")[-1]) else f"{self.id}:{local_key}"
        model_class = self._models.get(target.id)
        target_path = (
            f"{model_class.__module__}.{model_class.__qualname__}"
            if model_class is not None
            else str(target)
        )
        self._registry.register_custom_action(
            self._registry_id, action_id, label, core, target_path
        )

    def register_urls(self, patterns: list) -> None:
        self._registry.register_urls(self._registry_id, patterns)

    def register_setting(self, key: str, default: Any) -> None:
        self._registry.register_setting(self._registry_id, key, default)

    def register_signal(
        self, kind: SignalKind | str, sender: ModelReference, handler: Callable[..., Any]
    ) -> None:
        try:
            kind = SignalKind(kind)
        except ValueError as exc:
            raise ValueError(f"'{kind}' is not a Platform signal kind") from exc
        if sender.mod_id != self.id and sender.mod_id not in self.manifest.dependency_ids:
            raise ValueError(
                f"Mod '{self.id}' cannot observe model '{sender}' without a dependency"
            )
        model = self._models.get(sender.id) or self._registry.get_registered_models().get(sender.id)
        if model is None:
            raise ValueError(f"Model reference '{sender}' is not registered")
        self._registry.register_public_signal(
            self.id, kind, sender, model, handler
        )

    def register_service(
        self,
        local_key: str,
        handler: Callable[..., Any],
        *,
        request_type: type | None = None,
        response_type: type | None = None,
    ) -> ServiceReference | TypedService[Any, Any]:
        legacy_id = (
            local_key
            if "." in local_key and local_key.startswith(self.id.split(".")[-1])
            else None
        )
        reference = ServiceReference(
            self.id, "legacy-service" if legacy_id is not None else local_key
        )
        service_id = (
            legacy_id
            if legacy_id is not None
            else reference.id
        )
        self._registry.register_service(reference.id, handler)
        if service_id != reference.id:
            # Preserve the old internal alias while public callers use the
            # canonical typed reference.
            self._registry.register_service(service_id, handler)
        if request_type is not None or response_type is not None:
            return TypedService(reference, request_type, response_type)
        return reference

    def call(self, service: ServiceReference | TypedService[Any, Any], *args: Any, **kwargs: Any) -> Any:
        reference = service.reference if isinstance(service, TypedService) else service
        return self._registry.call(reference.id, *args, **kwargs)


Mod = ModRegistrar


def make_app_config(
    package: str,
    manifest: ModManifest,
    label: str,
    *,
    used_labels: set[str] | None = None,
    ready: Callable[[], None] | None = None,
) -> type:
    """Create the one explicit, immutable AppConfig class for an artifact."""
    if not re.fullmatch(r"[a-z][a-z0-9_]*", label):
        raise ValueError(f"Invalid Django app label '{label}'")
    if used_labels is not None and label in used_labels:
        raise ValueError(f"Django app label '{label}' is already registered")

    config_label = label
    ready_callback = ready

    class PackageAppConfig(__import__("django.apps", fromlist=["AppConfig"]).AppConfig):
        default_auto_field = "django.db.models.BigAutoField"
        name = package
        label = config_label
        mod_id = manifest.id
        mod_version = manifest.version

        if ready_callback is not None:
            def ready(self) -> None:
                ready_callback()

    PackageAppConfig.__name__ = "ModAppConfig"
    return PackageAppConfig


def load_entry_point_manifest(entry_point_name: str, package: str) -> ModManifest:
    """Read an installed artifact manifest without importing its package."""
    spec = find_spec(package)
    locations = spec.submodule_search_locations if spec is not None else None
    if not locations:
        raise ImportError(
            f"Entry point '{entry_point_name}' targets missing package '{package}'"
        )

    manifest_path = Path(next(iter(locations))) / "modManifest.json"
    if not manifest_path.is_file():
        raise ValueError(
            f"Entry point '{entry_point_name}' package '{package}' is missing "
            "modManifest.json"
        )

    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid manifest for entry point '{entry_point_name}'") from exc

    manifest = ModManifest.from_dict(data)
    if manifest.id != entry_point_name:
        raise ValueError(
            f"Entry point name '{entry_point_name}' does not match manifest ID "
            f"'{manifest.id}'"
        )
    return manifest
