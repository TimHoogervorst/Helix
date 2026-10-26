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


def execute_mutation_lifecycle(
    *,
    lock_identity: Callable[[], None],
    find_receipt: Callable[[], Any],
    receipt_fingerprint: Callable[[Any], str],
    request_fingerprint: str,
    recover: Callable[[Any], Any],
    execute: Callable[[], Any],
    conflict_message: str = "This request identity was already used for a different proposal.",
):
    """Own identity serialization, receipt replay, and atomic mutation execution.

    Adapters supply their receipt namespace and recovery policy. The enclosing
    transaction makes provider effects, audit writes, and the adapter's receipt
    one commit, while preserving each public receipt format.
    """
    from helix_core.record_persistence import StateConflict

    with transaction.atomic():
        lock_identity()
        receipt = find_receipt()
        if receipt is not None:
            if receipt_fingerprint(receipt) != request_fingerprint:
                raise StateConflict(conflict_message)
            return recover(receipt)
        return execute()


def recover_committed_mutation(*, lock_identity, find_receipt, recover, missing):
    """Read and authorize a committed outcome under the same identity lock."""
    with transaction.atomic():
        lock_identity()
        receipt = find_receipt()
        if receipt is None:
            return missing()
        return recover(receipt)


def recover_record_edit(actor, request_id, fingerprint):
    """Return an authorized receipt outcome, or ``None`` when no edit committed."""
    return recover_committed_mutation(
        lock_identity=lambda: lock_request_identity(actor.pk, request_id),
        find_receipt=lambda: _get_receipt(actor, request_id, fingerprint),
        recover=lambda receipt: authorize_record_edit_recovery(actor, receipt),
        missing=lambda: None,
    )


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
        if effective_role(actor, record) not in {"read", "review", "edit"}:
            raise PermissionDenied("You no longer have permission to access this record outcome.")
        return response

    project_id = response.get("project_id") if isinstance(response, dict) else None
    project = Project.objects.filter(pk=project_id).first()
    if project is None or role(actor, project) not in {"read", "review", "edit"}:
        raise PermissionDenied("You no longer have permission to access this record outcome.")
    return {
        "id": str(record_id),
        "project_id": project.pk,
        "source": {"kind": "project", "id": project.pk},
        "targetUnavailable": True,
        "replayed": True,
    }


def execute_record_edit(
    *, actor, request_id, fingerprint, execute: Callable[[], dict[str, Any]], persist_receipt=True,
):
    """Run a record edit and save its response atomically under its request identity."""
    from helix_core.models import ActionExecutionReceipt

    def find_receipt():
        return _get_receipt(actor, request_id, fingerprint)

    def persist(response):
        ActionExecutionReceipt.objects.create(
            actor=actor,
            request_id=request_id,
            request_hash=fingerprint,
            response=response,
        )

    if not persist_receipt:
        with transaction.atomic():
            return execute()

    return execute_mutation_lifecycle(
        lock_identity=lambda: lock_request_identity(actor.pk, request_id),
        find_receipt=lambda: find_receipt(),
        receipt_fingerprint=lambda receipt: receipt.request_hash,
        request_fingerprint=fingerprint,
        recover=lambda receipt: authorize_record_edit_recovery(actor, receipt),
        execute=lambda: _execute_and_persist(execute, persist),
    )


def execute_revision_group_save(*, actor, request_id, fingerprint, execute):
    """Run a public Revision Group save through the shared receipt lifecycle."""
    def find_receipt():
        return _get_receipt(actor, request_id, fingerprint)

    return execute_mutation_lifecycle(
        lock_identity=lambda: lock_request_identity(actor.pk, request_id),
        find_receipt=find_receipt,
        receipt_fingerprint=lambda receipt: receipt.request_hash,
        request_fingerprint=fingerprint,
        recover=lambda receipt: authorize_revision_group_recovery(actor, receipt),
        conflict_message="This request ID was already used for a different document save.",
        execute=execute,
    )


def authorize_revision_group_recovery(actor, receipt):
    """Authorize a saved Revision outcome without rerunning current validation."""
    from bundled.access.access.policies import effective_role, role
    from helix_core.core.models import Project
    from helix_core.models import PlatformRecord

    response = receipt.response if isinstance(receipt.response, dict) else {}
    record_id = response.get("record_id")
    record = PlatformRecord.objects.select_for_update(of=("self",)).select_related(
        "project"
    ).filter(pk=record_id).first()
    if record is not None:
        if effective_role(actor, record) not in {"read", "review", "edit"}:
            raise PermissionDenied("You no longer have permission to access this Revision outcome.")
        return {key: value for key, value in response.items() if key != "_recovery"}

    recovery = response.get("_recovery")
    project_id = recovery.get("project_id") if isinstance(recovery, dict) else None
    project = Project.objects.filter(pk=project_id).first()
    if project is None or role(actor, project) not in {"read", "review", "edit"}:
        raise PermissionDenied("The Revision outcome lacks authorization context for its deleted Record.")
    return {
        "record_id": str(record_id),
        "targetUnavailable": True,
        "replayed": True,
    }


def _execute_and_persist(execute, persist):
    response = execute()
    persist(response)
    return response


def recover_action_invocation(actor, invocation_id):
    """Recover a committed invocation through the shared receipt lifecycle."""
    from helix_core.models import ActionInvocationReceipt
    from helix_core.record_persistence import _authorize_invocation_replay, mark_unavailable_action_targets
    from django.contrib.auth import get_user_model

    def missing():
        from rest_framework.exceptions import NotFound

        raise NotFound("Action invocation not found.")

    return recover_committed_mutation(
        lock_identity=lambda: get_user_model()._default_manager.select_for_update().get(pk=actor.pk),
        find_receipt=lambda: ActionInvocationReceipt.objects.select_for_update().filter(
            actor_stable_id=str(actor.pk), invocation_id=invocation_id
        ).first(),
        recover=lambda receipt: _recover_action_invocation_outcome(actor, receipt),
        missing=missing,
    )


def _recover_action_invocation_outcome(actor, receipt):
    from helix_core.record_persistence import _authorize_invocation_replay, mark_unavailable_action_targets

    unavailable_target_ids = _authorize_invocation_replay(actor, receipt)
    outcome = dict(receipt.outcome)
    mark_unavailable_action_targets(outcome, unavailable_target_ids)
    outcome.pop("record", None)
    outcome["replayed"] = True
    return outcome
