"""Shared execution and authorized recovery for actor-scoped record edits."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from typing import Any

from django.db import connection, transaction
from rest_framework.exceptions import PermissionDenied


def request_fingerprint(payload: Any) -> str:
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def lock_request_identity(actor_id: Any, request_id: Any) -> None:
    """Serialize first uses of an existing actor/request identity on PostgreSQL."""
    if connection.vendor != "postgresql":
        return
    identity = f"record-mutation:{actor_id}:{request_id}".encode("utf-8")
    lock_key = int.from_bytes(hashlib.sha256(identity).digest()[:8], "big", signed=True)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_key])


def _get_receipt(actor, request_id, fingerprint):
    from helix_core.models import ActionExecutionReceipt
    from helix_core.record_persistence import StateConflict

    receipt = ActionExecutionReceipt.objects.select_for_update().filter(
        actor=actor, request_id=request_id
    ).first()
    if receipt is not None and receipt.request_hash != fingerprint:
        raise StateConflict("This request ID was already used for a different proposal.")
    return receipt


def recover_record_edit(actor, request_id, fingerprint):
    """Return an authorized receipt outcome, or ``None`` when no edit committed."""
    with transaction.atomic():
        lock_request_identity(actor.pk, request_id)
        receipt = _get_receipt(actor, request_id, fingerprint)
        return None if receipt is None else authorize_record_edit_recovery(actor, receipt)


def authorize_record_edit_recovery(actor, receipt):
    """Authorize disclosure of a saved response using current read access."""
    from bundled.access.access.policies import effective_role, role
    from helix_core.core.models import Project
    from helix_core.models import PlatformRecord

    response = receipt.response
    record_id = response.get("id") if isinstance(response, dict) else None
    record = PlatformRecord.objects.select_for_update(of=("self",)).select_related(
        "project"
    ).filter(pk=record_id).first()
    if record is not None:
        if effective_role(actor, record) not in {"read", "edit"}:
            raise PermissionDenied("You no longer have permission to access this record outcome.")
        return response

    project_id = response.get("project_id") if isinstance(response, dict) else None
    project = Project.objects.filter(pk=project_id).first()
    if project is None or role(actor, project) not in {"read", "edit"}:
        raise PermissionDenied("You no longer have permission to access this record outcome.")
    return {
        "id": str(record_id),
        "project_id": project.pk,
        "source": {"kind": "project", "id": project.pk},
        "targetUnavailable": True,
        "replayed": True,
    }


def execute_record_edit(*, actor, request_id, fingerprint, execute: Callable[[], dict[str, Any]]):
    """Run a record edit and save its response atomically under its request identity."""
    with transaction.atomic():
        lock_request_identity(actor.pk, request_id)
        receipt = _get_receipt(actor, request_id, fingerprint)
        if receipt is not None:
            return authorize_record_edit_recovery(actor, receipt)

        response = execute()
        from helix_core.models import ActionExecutionReceipt

        ActionExecutionReceipt.objects.create(
            actor=actor,
            request_id=request_id,
            request_hash=fingerprint,
            response=response,
        )
        return response
