"""Synchronous action logger.

``log_action()`` writes directly to the Platform-owned Action Log Entry
store and records the initiating Mod derived from the action reference.

``bulk_log_actions()`` batch-creates central action rows using
``bulk_create`` for efficiency.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Optional
from uuid import UUID

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser
from django.db import models

from .version_target import VersionTarget

User = get_user_model()

# ── Action type resolution ────────────────────────────────────────────────


def resolve_action_type(action: str) -> str:
    """Return the core action verb for *action*.

    For core actions (the last dot-segment is ``read``, ``created``,
    ``edited``, or ``deleted``), extracts the last segment directly.
    For custom actions, looks up the catalog to find the registered
    core mapping.

    Raises:
        ValueError: If *action* does not resolve to a known core verb.
    """
    from helix_core.mod_system.registry import CORE_ACTION_VERBS

    verb = action.rsplit(".", 1)[-1]
    if verb in CORE_ACTION_VERBS:
        return verb

    # Custom action — consult the catalog.
    mod_id = action.split(":", 1)[0] if ":" in action else action.split(".")[0]
    from .registry import get_action_catalog

    catalog = get_action_catalog(mod_id)
    for entry in catalog:
        if entry.get("id") == action:
            resolved = entry.get("action_type")
            if resolved:
                return resolved

    raise ValueError(
        f"Cannot resolve action_type for '{action}'. "
        f"Ensure a custom action is registered via register_custom_action() "
        f"with a valid core verb."
    )


# ── Logger functions ──────────────────────────────────────────────────────


def bulk_log_actions(
    user: AbstractUser,
    actions: list[dict],
    target_type: str,
    target_id: int,
    request_id: Optional[UUID] = None,
    client_ip: Optional[str] = None,
) -> list:
    """Batch-create action rows in the central Platform store.

    Groups *actions* by their derived mod (first segment of
    ``action``), then does one ``bulk_create`` per mod table.
    All actions share the same *target_type*, *target_id*,
    *request_id*, and *client_ip*.

    Args:
        user: The user who performed the actions.
        actions: List of ``{"action": str, "action_type"?: str,
            "metadata"?: dict}`` entries.
        target_type: Namespaced target, e.g. ``"eln.entry"``.
        target_id: Primary key of the target record.
        request_id: Correlation UUID shared across the batch.
        client_ip: Client IP address.

    Returns:
        The list of created action instances (unsaved PKs on backends
        that do not support ``bulk_create`` RETURNING).

    Raises:
        ValueError: If no model is registered for a derived mod.
    """
    if not actions:
        return []

    from helix_core.models import ActionLogEntry

    # Group by mod_id derived from action (not target_type).
    # We derive the mod from action rather than target_type
    # because block actions (e.g. "eln.table.edited") may target a
    # different mod than the route's target_type ("eln.entry").
    # This enables cross-mod routing within a single batch.
    grouped: dict[str, list[dict]] = defaultdict(list)
    for entry in actions:
        action = entry["action"]
        mod_id = action.split(":", 1)[0] if ":" in action else action.split(".")[0]
        grouped[mod_id].append(entry)

    results: list = []
    for mod_id, entries in grouped.items():
        instances = []
        for entry in entries:
            action = entry["action"]
            action_type = entry.get("action_type")
            if action_type is None:
                action_type = resolve_action_type(action)

            if action_type == "read":
                raise ValueError(
                    "'read' actions are not persisted.  Read participates "
                    "in authorization and policy discovery but never creates "
                    "an Action Log Entry."
                )

            instances.append(
                ActionLogEntry(
                    performed_by=user,
                    action=action,
                    action_type=action_type,
                    target_model_reference=target_type,
                    target_object_id=str(target_id),
                    initiating_mod_id=mod_id,
                    initiating_mod_version=_initiator_version(mod_id),
                    metadata=entry.get("metadata", {}),
                    request_id=request_id,
                    client_ip=client_ip,
                )
            )
            target = entry.get("version_target")
            if target is not None:
                instances[-1].target_version_reference = target.reference
                instances[-1].target_version_object_id = str(target.object_id)
                instances[-1].target_version_label = target.label
                instances[-1].target_version_hash = target.content_hash

        ActionLogEntry.objects.bulk_create(instances)
        results.extend(instances)

    return results


def log_action(
    user: AbstractUser,
    action: str,
    target_type: str,
    target_id: int,
    action_type: Optional[str] = None,
    metadata: Optional[dict] = None,
    version: Optional[models.Model] = None,
    version_target: Optional[VersionTarget] = None,
    request_id: Optional[UUID] = None,
    client_ip: Optional[str] = None,
):
    """Create an action row in the Platform-owned central store.

    Derives the mod identifier from *target_type* (the segment before
    the first dot).  For example ``"eln.entry"`` dispatches to
    whichever model was registered under ``"eln"``.

    If *action_type* is not provided, it is resolved automatically:
    for core actions (last segment is ``created``/``edited``/``deleted``)
    it's extracted from *action*; for custom actions the catalog is
    consulted.

    Args:
        user: The user who performed the action.
        action: Triple-dotted action identifier, e.g.
            ``"eln.entry.created"``.
        target_type: Namespaced target, e.g. ``"eln.entry"``.
        target_id: Primary key of the target record.
        action_type: Core action verb (``"created"``, ``"edited"``,
            ``"deleted"``, or ``"read"``).  Auto-resolved from *action*
            when omitted.  ``"read"`` raises ``ValueError`` — it is
            authorization-only and never persisted.
        metadata: Optional free-form payload (stored as JSON).
        version: Optional content version produced by this action.
        request_id: Correlation UUID tying together actions from the
            same HTTP request.
        client_ip: Client IP address captured from the request.

    Returns:
        The newly created action instance.

    Raises:
        ValueError: If no model is registered for the derived mod, if
            *action_type* cannot be resolved, or if *action_type* is
            ``"read"`` (authorization-only).
    """
    if action_type is None:
        action_type = resolve_action_type(action)

    from helix_core.models import ActionLogEntry

    # Read is authorization-only — never persist.
    if action_type == "read":
        raise ValueError(
            "'read' actions are not persisted.  Read participates "
            "in authorization and policy discovery but never creates "
            "an Action Log Entry."
        )

    mod_id = action.split(":", 1)[0] if ":" in action else action.split(".")[0]
    kwargs: dict[str, Any] = dict(
        performed_by=user,
        action=action,
        action_type=action_type,
        target_model_reference=target_type,
        target_object_id=str(target_id),
        initiating_mod_id=mod_id,
        initiating_mod_version=_initiator_version(mod_id),
        metadata=metadata or {},
    )
    if version_target is None and version is not None:
        version_target = VersionTarget(
            reference=getattr(version, "version_reference", "unknown:version"),
            object_id=str(version.pk),
            label=str(getattr(version, "version_number", version.pk)),
            content_hash=getattr(version, "content_hash", None),
        )
    if version_target is not None:
        kwargs["target_version_reference"] = version_target.reference
        kwargs["target_version_object_id"] = str(version_target.object_id)
        kwargs["target_version_label"] = version_target.label
        kwargs["target_version_hash"] = version_target.content_hash
    if request_id is not None:
        kwargs["request_id"] = request_id
    if client_ip is not None:
        kwargs["client_ip"] = client_ip
    return ActionLogEntry.objects.create(**kwargs)


def _initiator_version(mod_id: str) -> str:
    from helix_core.mod_system.registry import registry

    manifest = registry._manifests.get(mod_id)
    if manifest is not None:
        return manifest.version
    provider = registry._action_providers.get(mod_id)
    return provider[1] if provider is not None else "unknown"
