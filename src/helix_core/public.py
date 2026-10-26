"""Public backend Mod contract.

This module is the only backend API that Mod packages should import.  The
implementation deliberately delegates to the private registry so the public
contract does not expose its storage or Django wiring.
"""

from __future__ import annotations

import re
from contextlib import contextmanager
from dataclasses import dataclass
from enum import StrEnum
from importlib.util import find_spec
import json
from pathlib import Path
from typing import Any, Callable, Generic, TypeVar

from helix_core.column_types import ColumnType
from helix_core.mod_system.manifest import ModManifest
from helix_core.mod_system.registry import ContentSourceProvider
from helix_core.capabilities import validate_accepted_capabilities, validate_capabilities
from helix_core.record_persistence import ProposedEffects

_MOD_ID = re.compile(r"^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$")
_LOCAL_KEY = re.compile(r"^[a-z][a-z0-9]*(?:[-.]?[a-z0-9]+)*$")


def _reference(mod_id: str, local_key: str) -> str:
    if not _MOD_ID.fullmatch(mod_id):
        raise ValueError(f"Invalid mod ID '{mod_id}'; expected lowercase vendor.name")
    if not _LOCAL_KEY.fullmatch(local_key):
        raise ValueError(
            f"Invalid registration key '{local_key}'; expected lowercase ASCII "
            "words separated by hyphens or dots"
        )
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
class ObjectReference:
    """A durable reference to one object owned by a registered model."""

    model: ModelReference
    object_id: str

    def __post_init__(self) -> None:
        if not isinstance(self.model, ModelReference):
            raise TypeError(
                f"Expected ModelReference, got {type(self.model).__name__}"
            )
        if not isinstance(self.object_id, str) or not self.object_id:
            raise ValueError("Object reference IDs must be non-empty strings")

    @property
    def id(self) -> str:
        return f"{self.model.id}:{self.object_id}"

    def __str__(self) -> str:
        return self.id


@dataclass(frozen=True, slots=True)
class WorkspaceReference:
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
class SlotReference(WorkspaceReference):
    pass


@dataclass(frozen=True, slots=True)
class ActionReference(WorkspaceReference):
    pass


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
        self._registry.register_action_provider(self._registry_id, manifest.version)

    @property
    def id(self) -> str:
        return self.manifest.id

    @property
    def version(self) -> str:
        return self.manifest.version

    def _owned(self, reference: ModelReference) -> None:
        if not isinstance(reference, ModelReference):
            raise TypeError(
                f"Expected ModelReference, got {type(reference).__name__}"
            )
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
        self, local_key: str, model: ModelReference, **kwargs: Any
    ) -> str:
        """Register a source kind (legacy name retained for Mod compatibility)."""
        return self.register_content_source(local_key, model, **kwargs)

    def register_content_source(
        self,
        local_key: str,
        model: ModelReference,
        *,
        visibility_query: Callable[..., Any] | None = None,
        serializer: Any = None,
        display_metadata: dict[str, Any] | None = None,
        hub_visible: bool = False,
        mutation_handlers: dict[str, Callable[..., Any]] | None = None,
        capabilities: list[str] | None = None,
    ) -> str:
        self._owned(model)
        kind = _reference(self.id, local_key)
        self._registry.register_content_source(
            kind,
            model,
            visibility_query=visibility_query,
            serializer=serializer,
            display_metadata=display_metadata,
            hub_visible=hub_visible,
            mutation_handlers=mutation_handlers,
            capabilities=validate_capabilities(list(capabilities or []), self.id),
            provider_mod_id=self.id,
        )
        return kind

    def register_schema_type(
        self,
        display_name: str,
        *,
        workspace_id: str,
        model: ModelReference,
        prefix: str,
        columns: list[dict[str, Any]] | None = None,
        capabilities: list[str] | None = None,
        schema_name: str = "Default",
        icon: str = "",
        color: str = "",
    ) -> None:
        if not isinstance(model, ModelReference):
            raise TypeError(
                f"Expected ModelReference, got {type(model).__name__}"
            )
        capabilities = validate_capabilities(list(capabilities or []), self.id)
        model_class = self._models.get(model.id) or self._registry.get_registered_models().get(model.id)
        if model_class is None:
            self._registry._pending_schema_types.append({
                "display_name": display_name,
                "workspace_id": workspace_id,
                "model_ref": model,
                "prefix": prefix,
                "columns": columns,
                "capabilities": capabilities,
                "schema_name": schema_name,
                "icon": icon,
                "color": color,
            })
            return
        model_path = model_class if isinstance(model_class, str) else f"{model_class.__module__}.{model_class.__qualname__}"
        self._registry.register_schema_type(
            display_name=display_name,
            workspace_id=workspace_id,
            model=model_path,
            columns=columns,
            capabilities=capabilities,
            prefix=prefix,
            schema_name=schema_name,
            icon=icon,
            color=color,
        )

    def register_column_type(self, column_type: ColumnType) -> None:
        from helix_core.column_types import registry

        registry.register_column_type(column_type)

    def register_block(
        self,
        local_key: str,
        *,
        capabilities: list[str] | None = None,
        **metadata: Any,
    ) -> str:
        """Register a block with the capabilities it offers to slots."""
        block_id = _reference(self.id, local_key)
        self._registry.register_block(
            block_id,
            capabilities=validate_capabilities(list(capabilities or []), self.id),
            provider_mod_id=self.id,
            **metadata,
        )
        return block_id

    def register_slot(
        self,
        local_key: str,
        *,
        accepts: list[str] | None = None,
        capabilities: list[str] | None = None,
        **metadata: Any,
    ) -> SlotReference:
        """Register a slot that accepts matching capabilities."""
        slot_id = SlotReference(self.id, local_key)
        accepted = validate_accepted_capabilities(
            list(accepts if accepts is not None else capabilities or [])
        )
        self._registry.register_slot(
            slot_id.id, accepts=accepted, provider_mod_id=self.id, **metadata
        )
        return slot_id

    def register_metric_provider(
        self,
        local_key: str,
        service: ServiceReference | TypedService[Any, Any] | str,
        *,
        capabilities: list[str] | None = None,
        **metadata: Any,
    ) -> str:
        """Register a metric provider backed by a service reference."""
        service_id = service if isinstance(service, str) else (
            service.reference if isinstance(service, TypedService) else service
        )
        provider_id = _reference(self.id, local_key)
        self._registry.register_metric_provider(
            provider_id,
            service_id,
            capabilities=validate_capabilities(list(capabilities or []), self.id),
            provider_mod_id=self.id,
            **metadata,
        )
        return provider_id

    def register_custom_action(
        self,
        local_key: str,
        label: str,
        core: str,
        target: ModelReference,
    ) -> None:
        self._owned(target)
        action_id = (
            local_key
            if ":" in local_key
            or local_key.startswith(f"{self.id}.")
            or local_key.startswith(f"{self._registry_id}.")
            else f"{self.id}:{local_key}"
        )
        target_reference = str(target)
        self._registry.register_custom_action(
            self._registry_id,
            action_id,
            label,
            core,
            target_reference,
            provider_mod_id=self.id,
            provider_mod_version=self.version,
        )

    def register_record_action(
        self,
        local_key: str,
        *,
        label: str,
        action_contract_id: str,
        action_contract_version: str,
        handler: Callable[[Any, Any], Any],
    ) -> ActionReference:
        """Register an exact-contract Action handler that only proposes effects.

        The handler receives immutable execution context and input mappings. It
        must return ``ProposedEffects``; the Platform validates and persists
        those effects through its record persistence boundary.
        """
        reference = ActionReference(self.id, local_key)
        if not isinstance(action_contract_id, str) or not action_contract_id:
            raise ValueError("An exact Action Contract identity is required")
        if not isinstance(action_contract_version, str) or not action_contract_version:
            raise ValueError("An exact Action Contract version is required")
        self._registry.register_record_action(
            self._registry_id,
            reference.id,
            label,
            action_contract_id,
            action_contract_version,
            handler,
            provider_mod_id=self.id,
            provider_mod_version=self.version,
        )
        return reference

    def register_revision_group(
        self,
        group_key: str,
        target: ModelReference,
        *,
        target_model_reference: str,
        action_identities: dict[str, str],
    ) -> None:
        """Declare ownership and permitted Action attribution for a group.

        ``target_model_reference`` is the legacy vocabulary stored on saved
        Actions; it may be an alias and is not the canonical model identity.
        Ownership always comes from the registered ``target`` and this
        owner-bound registrar, never from a save request.
        """
        self._owned(target)
        if target.id not in self._registry.get_registered_models():
            raise ValueError(f"Target model '{target}' is not registered")
        if not isinstance(target_model_reference, str) or not target_model_reference:
            raise ValueError("A target Action model reference is required")
        if not isinstance(action_identities, dict):
            raise TypeError("action_identities must map Action types to identities")
        allowed_prefixes = (
            f"{self.id}.", f"{self.id}:",
            f"{self._registry_id}.", f"{self._registry_id}:",
        )
        if any(
            not isinstance(identity, str) or not identity.startswith(allowed_prefixes)
            for identity in action_identities.values()
        ):
            raise ValueError("Action identities must be namespaced to the registering Mod")
        self._registry.register_revision_group(
            group_key,
            target_model_reference,
            owner_mod_id=self.id,
            provider_mod_version=self.version,
            action_identities=action_identities,
        )

    def register_review_target(
        self,
        local_key: str,
        target: ModelReference,
        *,
        revision_groups: list[str],
        renderer: Callable[..., Any],
        renderer_version: str,
        evidence_capture: Callable[..., Any] | None = None,
        annotation_capabilities: list[str] | None = None,
        anchor_validator: Callable[..., bool] | None = None,
        suggestion_validator: Callable[..., bool] | None = None,
        operation_effects: dict[str, list[str]] | None = None,
    ) -> str:
        """Opt a Mod target into Platform's fixed review lifecycle and guards."""
        self._owned(target)
        if target.id not in self._registry.get_registered_models():
            raise ValueError(f"Target model '{target}' is not registered")
        identity = _reference(self.id, local_key)
        self._registry.register_review_target(
            identity,
            target,
            revision_groups=revision_groups,
            renderer=renderer,
            renderer_version=renderer_version,
            evidence_capture=evidence_capture,
            annotation_capabilities=annotation_capabilities,
            anchor_validator=anchor_validator,
            suggestion_validator=suggestion_validator,
            operation_effects=operation_effects,
            provider_mod_id=self.id,
        )
        return identity

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
            self._registry._pending_public_signals.append({
                "mod_id": self.id,
                "kind": kind,
                "sender_ref": sender,
                "handler": handler,
            })
            return
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
        capabilities: list[str] | None = None,
    ) -> ServiceReference | TypedService[Any, Any]:
        legacy_id = (
            local_key
            if "." in local_key and local_key.startswith(self.id.split(".")[-1])
            else None
        )
        canonical_key = local_key if legacy_id is None else re.sub(
            r"(?<!^)([A-Z])", r"-\1", local_key.split(".")[-1]
        ).lower()
        reference = ServiceReference(self.id, canonical_key)
        service_id = reference.id
        validated_capabilities = validate_capabilities(list(capabilities or []), self.id)
        self._registry.register_service(
            reference.id, handler, capabilities=validated_capabilities,
            provider_mod_id=self.id,
        )
        if legacy_id is not None and service_id != legacy_id:
            # Preserve the old internal alias while public callers use the
            # canonical typed reference.
            self._registry.register_service(
                legacy_id, handler, capabilities=validated_capabilities,
                provider_mod_id=self.id,
            )
        if request_type is not None or response_type is not None:
            return TypedService(reference, request_type, response_type)
        return reference

    def call(self, service: ServiceReference | TypedService[Any, Any], *args: Any, **kwargs: Any) -> Any:
        reference = service.reference if isinstance(service, TypedService) else service
        return self._registry.call(reference.id, *args, **kwargs)


Mod = ModRegistrar


_PUBLIC_TYPES: dict[str, tuple[str, str]] = {
    # Stable Django model and base-model types Mods may extend or serialize.
    "AbstractEntity": ("helix_core.abstracts", "AbstractEntity"),
    "AbstractBaseAction": ("helix_core.actions.base", "AbstractBaseAction"),
    "Mention": ("helix_core.mentions.models", "Mention"),
    "Folder": ("helix_core.core.models", "Folder"),
    "Project": ("helix_core.core.models", "Project"),
    "User": ("helix_core.core.models", "User"),
    "ActionLogEntry": ("helix_core.models", "ActionLogEntry"),
    "Schema": ("helix_core.models", "Schema"),
    "SchemaType": ("helix_core.models", "SchemaType"),
    "PlatformAttachment": ("helix_core.models", "PlatformAttachment"),
    "AttachmentRevisionLink": ("helix_core.models", "AttachmentRevisionLink"),
    "ActionInvocationReceipt": ("helix_core.models", "ActionInvocationReceipt"),
    "ActionParticipant": ("helix_core.models", "ActionParticipant"),
    "PlatformRecord": ("helix_core.models", "PlatformRecord"),
    "PlatformDiscussion": ("helix_core.models", "PlatformDiscussion"),
    "PlatformDiscussionMessage": ("helix_core.models", "PlatformDiscussionMessage"),
    "PlatformDiscussionMessageRevision": ("helix_core.models", "PlatformDiscussionMessageRevision"),
    "RetainedContract": ("helix_core.models", "RetainedContract"),
    "ScientificRevision": ("helix_core.models", "ScientificRevision"),
    "ColumnType": ("helix_core.column_types", "ColumnType"),
    "AggregateMeta": ("helix_core.column_types", "AggregateMeta"),
    "OperatorMeta": ("helix_core.column_types", "OperatorMeta"),
    "VersionTarget": ("helix_core.actions.version_target", "VersionTarget"),
    "ActionLoggingMixin": ("helix_core.actions.mixins", "ActionLoggingMixin"),
    "ProposedEffects": ("helix_core.record_persistence", "ProposedEffects"),
    "StateConflict": ("helix_core.record_persistence", "StateConflict"),
    "TAG_COLOR_CHOICES": ("bundled.labelling.tags.models", "TAG_COLOR_CHOICES"),
    "TAG_ICON_CHOICES": ("bundled.labelling.tags.models", "TAG_ICON_CHOICES"),
    "Tag": ("bundled.labelling.tags.models", "Tag"),
    "TagSerializer": ("bundled.labelling.tags.serializers", "TagSerializer"),
    "UserSerializer": ("bundled.access.users.serializers", "UserSerializer"),
    "IsOrganizationAdmin": ("bundled.access.access.permissions", "IsOrganizationAdmin"),
    "IsOrganizationAdminForWrites": ("bundled.access.access.permissions", "IsOrganizationAdminForWrites"),
    "entry_content_sync": ("helix_core.core.signals", "entry_content_sync"),
    "user_attribution_snapshot": ("helix_core.models", "user_attribution_snapshot"),
    "BackendModRegistry": ("helix_core.mod_system.registry", "BackendModRegistry"),
    "ModManifest": ("helix_core.mod_system.manifest", "ModManifest"),
    "Grant": ("bundled.access.access.models", "Grant"),
    "ProjectRole": ("bundled.access.access.models", "ProjectRole"),
    "FolderShare": ("bundled.access.access.models", "FolderShare"),
    "Organization": ("bundled.access.access.models", "Organization"),
    "OrganizationMembership": ("bundled.access.access.models", "OrganizationMembership"),
    "OrganizationRole": ("bundled.access.access.models", "OrganizationRole"),
    "ShareLevel": ("bundled.access.access.models", "ShareLevel"),
    "Team": ("bundled.access.access.models", "Team"),
}


def __getattr__(name: str) -> Any:
    """Resolve stable shared types lazily after Django has loaded model apps."""
    target = _PUBLIC_TYPES.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    from importlib import import_module

    return getattr(import_module(target[0]), target[1])


def public_column_type_registry() -> Any:
    """Return the registration service for Mod-owned column types."""
    from helix_core.column_types import registry

    return registry


def get_registered_model(reference: ModelReference) -> type:
    """Resolve a declared model reference through the public registration API."""
    if not isinstance(reference, ModelReference):
        raise TypeError("reference must be a ModelReference")
    from helix_core.mod_system.registry import registry

    try:
        return registry.get_registered_models()[reference.id]
    except KeyError as exc:
        raise LookupError(f"Model reference '{reference.id}' is unavailable") from exc


@contextmanager
def use_backend_registry_for_integration(registry: Any):
    """Temporarily supply an isolated registry while exercising Mod APIs.

    This is an integration-test seam for Mod-owned backend suites. Production
    registration uses the host's installed registry automatically.
    """
    from unittest.mock import patch

    with patch("helix_core.mod_system.registry.registry", registry):
        yield


def update_status_from_source(*args: Any, **kwargs: Any) -> Any:
    from helix_core.source_status import update_status_from_source as operation

    return operation(*args, **kwargs)


def hydrate_source_path(*args: Any, **kwargs: Any) -> Any:
    from helix_core.abstracts import hydrate_source_path as operation

    return operation(*args, **kwargs)


def collect_reference_ids(*args: Any, **kwargs: Any) -> Any:
    from helix_core.mentions.node_walker import collect_reference_ids as operation

    return operation(*args, **kwargs)


def sync_mentions(*args: Any, **kwargs: Any) -> Any:
    from helix_core.mentions.sync import sync_mentions as operation

    return operation(*args, **kwargs)


def delete_source_descendants(*args: Any, **kwargs: Any) -> Any:
    from helix_core.source_deletion import delete_source_descendants as operation

    return operation(*args, **kwargs)


def delete_platform_record(*args: Any, **kwargs: Any) -> Any:
    from helix_core.record_persistence import delete_platform_record as operation

    return operation(*args, **kwargs)


def delete_source_entity(*args: Any, **kwargs: Any) -> Any:
    from helix_core.record_persistence import delete_source_entity as operation

    return operation(*args, **kwargs)


def link_revision_attachments(*args: Any, **kwargs: Any) -> Any:
    from helix_core.attachments import link_revision_attachments as operation

    return operation(*args, **kwargs)


def upload_attachment(*args: Any, **kwargs: Any) -> Any:
    from helix_core.attachments import upload_attachment as operation

    return operation(*args, **kwargs)


def verify_attachment_content(*args: Any, **kwargs: Any) -> Any:
    from helix_core.attachments import _verify_content as operation

    return operation(*args, **kwargs)


def cleanup_staged_attachments(*args: Any, **kwargs: Any) -> Any:
    from helix_core.attachments import cleanup_staged_attachments as operation

    return operation(*args, **kwargs)


def visible_rows_q(*args: Any, **kwargs: Any) -> Any:
    from bundled.access.access.scoping import visible_rows_q as operation

    return operation(*args, **kwargs)


def effective_role(*args: Any, **kwargs: Any) -> Any:
    from bundled.access.access.policies import effective_role as operation

    return operation(*args, **kwargs)


def can_review(*args: Any, **kwargs: Any) -> Any:
    """Public resource-aware Review authorization (Edit includes Review)."""
    from bundled.access.access.policies import can_review as operation

    return operation(*args, **kwargs)


def role(*args: Any, **kwargs: Any) -> Any:
    from bundled.access.access.policies import role as operation

    return operation(*args, **kwargs)


def log_action(*args: Any, **kwargs: Any) -> Any:
    from helix_core.actions.logger import log_action as operation

    return operation(*args, **kwargs)


def bulk_log_actions(*args: Any, **kwargs: Any) -> Any:
    from helix_core.actions.logger import bulk_log_actions as operation

    return operation(*args, **kwargs)


def logs_action(*args: Any, **kwargs: Any) -> Any:
    from helix_core.actions.mixins import logs_action as operation

    return operation(*args, **kwargs)


def canonical_json(*args: Any, **kwargs: Any) -> Any:
    from helix_core.mod_system.contracts import canonical_json as operation

    return operation(*args, **kwargs)


def contract_fingerprint(*args: Any, **kwargs: Any) -> Any:
    from helix_core.mod_system.contracts import contract_fingerprint as operation

    return operation(*args, **kwargs)


def create_record(**values: Any) -> dict[str, Any]:
    """Create a Platform record through its atomic persistence boundary."""
    from helix_core.record_persistence import create_record as persist

    return persist(**values)


def save_revision_group(**values: Any) -> dict[str, Any]:
    """Persist a Mod-owned snapshot through the Platform revision boundary.

    Mod packages use this public entry point instead of writing Platform
    revision or Action models directly.
    """
    from helix_core.record_persistence import save_revision_group as persist

    return persist(**values)


def retain_rendition(**values: Any) -> Any:
    """Retain immutable presentation metadata against an exact Platform Revision."""
    from helix_core.models import (
        AttachmentRevisionLink, PlatformAttachment, PlatformRecord,
        PlatformRendition, RecordRevisionGroup, ScientificRevision,
    )


def submit_review_target(**values: Any) -> dict[str, Any]:
    """Submit one registered target through the Platform-owned review lifecycle."""
    from helix_core.reviews import submit_review_target as operation

    return operation(**values)


def withdraw_review_submission(**values: Any) -> dict[str, Any]:
    """Withdraw the active submission while retaining its immutable history."""
    from helix_core.reviews import withdraw_review_submission as operation

    return operation(**values)


def review_target_state(**values: Any) -> dict[str, Any]:
    """Read shared Platform review state and retained submission manifests."""
    from helix_core.reviews import review_target_state as operation

    return operation(**values)


def approve_review_target(**values: Any) -> dict[str, Any]:
    """Approve an exact active submission using an eligible independent witness."""
    from helix_core.review_threads import approve_review as operation

    return operation(**values)


def finish_review_participation(**values: Any) -> dict[str, Any]:
    """Finish one participant's assessment after a witness completes the target."""
    from helix_core.review_threads import assess_review as operation

    return operation(outcome="finish_review", **values)


def reopen_review_target(**values: Any) -> dict[str, Any]:
    """Reopen a finished review target with a retained reason and attribution."""
    from helix_core.reviews import reopen_review_target as operation

    return operation(**values)


def ensure_record_unlocked(record_or_id: Any) -> None:
    """Enforce a persistent Platform review lock before a protected mutation."""
    from helix_core.reviews import ensure_record_unlocked as operation

    return operation(record_or_id)
    from django.core.exceptions import ValidationError

    record = PlatformRecord.objects.get(pk=values["record_id"])
    actor = values.get("actor")
    from bundled.access.access.policies import role
    if actor is None or role(actor, record.project) != "edit":
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("You do not have permission to retain a rendition for this record.")
    group = RecordRevisionGroup.objects.get(pk=values["group_id"], record=record)
    revision = ScientificRevision.objects.get(pk=values["revision_id"], group=group)
    attachment = PlatformAttachment.objects.get(pk=values["attachment_id"], project_id=record.project_id)
    if revision.content_hash != values["source_hash"]:
        raise ValidationError("Rendition source hash must match the exact Platform Revision.")
    if not AttachmentRevisionLink.objects.filter(revision=revision, attachment=attachment).exists():
        raise ValidationError("Rendition attachment must be retained by the exact Revision.")
    return PlatformRendition.objects.create(
        record=record, group=group, revision=revision, attachment=attachment,
        source_hash=values["source_hash"], captured_by=actor,
        captured_at=values["captured_at"],
        presentation_provider=values["presentation_provider"],
        presentation_version=values["presentation_version"],
        presentation_context=values.get("presentation_context") or {},
    )


def list_renditions(record_id: str, *, revision_id: str | None = None) -> list[dict[str, Any]]:
    """List retained Platform presentation artifacts for a record or exact Revision."""
    from helix_core.attachments import rendition_metadata

    return rendition_metadata(record_id=record_id, revision_id=revision_id)


def record_action_state(record_id: str) -> dict[str, Any]:
    """Return the concurrency state required to invoke a Record Action.

    This is a read-only public service for Mod-owned API adapters. It includes
    the Platform record token, current default Revision and Schema mapping
    fingerprint, without exposing persistence internals to the Mod.
    """
    from helix_core.record_persistence import _schema_state
    from helix_core.models import PlatformRecord

    record = PlatformRecord.objects.select_related("schema__schema_type").get(pk=record_id)
    group = record.revision_groups.select_related("current_revision").get(group_key="record")
    return {
        "record_id": str(record.pk),
        "state_token": str(record.state_token),
        "revision_id": str(group.current_revision_id),
        "schema_state": _schema_state(record),
    }


def lock_record_revision_for_update(*args: Any, **kwargs: Any) -> Any:
    """Lock and load a record Revision through the public persistence boundary."""
    from helix_core.record_persistence import lock_record_revision_for_update as operation

    return operation(*args, **kwargs)


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


def get_bundled_mod_packages() -> list[str]:
    """Return the package names for the Platform's default bundled Mods."""
    from helix_core.mod_system.bundled import BUNDLED_MODS

    return list(BUNDLED_MODS)


def get_mod_app_configs(
    packages: list[str], *, base_dir: str | Path | None = None
) -> list[str]:
    """Resolve package names to Django app paths in dependency order.

    This public composition seam is intended for application configuration
    that explicitly installs Mod packages, including independent package tests.
    """
    from helix_core.mod_system.loader import get_helix_mods

    return get_helix_mods(base_dir=base_dir, helix_mods_override=list(packages))
