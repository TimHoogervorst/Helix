"""Atomic persistence boundary for Platform-owned scientific records."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Mapping
from uuid import UUID, uuid4

from django.db import transaction
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError


class StateConflict(APIException):
    status_code = 409
    default_detail = "The record changed since this form was loaded."
    default_code = "state_conflict"


@dataclass(frozen=True)
class ProposedEffects:
    """Read-only proposal returned by an Action provider for Platform validation."""

    field_values: Mapping[str, Mapping[str, Any]] | None = None
    metadata: Mapping[str, Any] | None = None


def _digest(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _schema_fields(record_or_schema) -> dict[str, dict[str, Any]]:
    schema = getattr(record_or_schema, "schema", record_or_schema)
    schema_type = schema.schema_type
    return {
        column["id"]: column
        for column in [*(schema_type.columns or []), *(schema.columns or [])]
        if isinstance(column, dict) and isinstance(column.get("id"), str)
    }


def _validate_values(schema, values: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    if not isinstance(values, Mapping):
        raise ValidationError({"field_values": "Expected an object keyed by stable field IDs."})
    fields = _schema_fields(schema)
    result = {}
    for field_id, typed_value in values.items():
        column = fields.get(field_id)
        if column is None:
            raise ValidationError({"field_values": f"Unknown stable field ID '{field_id}'."})
        if not isinstance(typed_value, Mapping) or not {"type", "value"} <= set(typed_value):
            raise ValidationError({"field_values": f"Field '{field_id}' must contain type and value."})
        value_type = typed_value["type"]
        expected_type = column.get("type")
        contract_ref = column.get("contract")
        if isinstance(expected_type, dict) and expected_type.get("type") == "contract":
            contract_ref = {
                "kind": expected_type.get("kind"),
                "id": expected_type.get("id"),
                "version": expected_type.get("version"),
            }
            expected_type = "contract"
        if expected_type in {"text", "dropdown", "textarea"}:
            expected_type = "string"
        if expected_type in {"integer", "float", "decimal"}:
            expected_type = "number"
        if value_type != expected_type:
            raise ValidationError({"field_values": f"Field '{field_id}' must use type '{expected_type}'."})
        value = typed_value["value"]
        if expected_type == "contract":
            from helix_core.models import RetainedContract
            from helix_core.mod_system.contracts import parse_contract_json

            contract = typed_value.get("contract")
            if not isinstance(contract_ref, dict) or not isinstance(contract, Mapping):
                raise ValidationError({"field_values": f"Field '{field_id}' requires an exact Data Contract binding."})
            expected_ref = {key: contract_ref.get(key) for key in ("kind", "id", "version")}
            actual_ref = {key: contract.get(key) for key in ("kind", "id", "version")}
            if actual_ref != expected_ref or actual_ref["kind"] != "data":
                raise ValidationError({"field_values": f"Field '{field_id}' must retain its declared exact Data Contract version."})
            retained = RetainedContract.objects.filter(
                kind="data", contract_id=actual_ref["id"], version=actual_ref["version"]
            ).first()
            if retained is None:
                raise ValidationError({"field_values": f"Field '{field_id}' references an unavailable Data Contract version."})
            envelope = parse_contract_json(retained.canonical_envelope)
            _validate_contract_value(envelope["definition"]["type"], value, field_id)
            result[field_id] = {
                "type": "contract",
                "contract": actual_ref,
                "value": value,
            }
            continue
        if value_type == "string" and not isinstance(value, str):
            raise ValidationError({"field_values": f"Field '{field_id}' must be text."})
        if value_type == "number" and (isinstance(value, bool) or not isinstance(value, (int, float))):
            raise ValidationError({"field_values": f"Field '{field_id}' must be numeric."})
        if value_type == "boolean" and not isinstance(value, bool):
            raise ValidationError({"field_values": f"Field '{field_id}' must be boolean."})
        result[field_id] = {"type": value_type, "value": value}
    return result


def _record_response(record, revision=None, action=None) -> dict[str, Any]:
    group = record.revision_groups.first()
    current = revision or (group.current_revision if group else None)
    return {
        "id": str(record.pk),
        "display_id": record.display_id,
        "name": record.name,
        "metadata": record.properties or {},
        "project_id": record.project_id,
        "source": {"kind": "project", "id": record.project_id},
        "schema_id": record.schema_id,
        "field_values": record.field_values or {},
        "state_token": str(record.state_token),
        "revision": None if current is None else {
            "id": str(current.pk),
            "group_id": str(current.group_id),
            "sequence": current.sequence,
            "content_hash": current.content_hash,
        },
        "action": None if action is None else {"id": action.pk, "identity": action.action},
    }


def create_initial_snapshot(record, actor):
    from helix_core.models import RecordRevisionGroup, ScientificRevision

    group = RecordRevisionGroup.objects.create(
        record=record,
        group_key="record",
        target_model_reference="helix.record",
        target_object_id=str(record.pk),
    )
    snapshot = {
        "name": record.name,
        "metadata": record.properties or {},
        "schema_id": record.schema_id,
        "field_values": record.field_values or {},
    }
    revision = ScientificRevision.objects.create(
        group=group,
        sequence=1,
        snapshot=snapshot,
        content_hash=_digest(snapshot),
        created_by=actor,
    )
    group.current_revision = revision
    group.save(update_fields=["current_revision"])
    return revision


def _write_action(
    record, actor, verb, request_id, metadata, *,
    action_identity=None, provider_mod_id="helix", provider_mod_version="1",
    target_model_reference="helix.record", target_object_id=None,
):
    from helix_core.models import ActionLogEntry, ActionParticipant

    action = ActionLogEntry.objects.create(
        performed_by=actor,
        action=action_identity or f"helix.record.{verb}",
        action_type=verb,
        target_model_reference=target_model_reference,
        target_object_id=str(target_object_id if target_object_id is not None else record.pk),
        initiating_mod_id=provider_mod_id,
        initiating_mod_version=provider_mod_version,
        request_id=request_id,
        metadata=metadata,
    )
    ActionParticipant.objects.create(
        action=action,
        record=record,
        target_model_reference=target_model_reference,
        target_object_id=str(target_object_id if target_object_id is not None else record.pk),
        role="subject",
    )
    return action


@transaction.atomic
def create_record(*, actor, project, schema, name, field_values, metadata=None, request_id=None):
    from helix_core.models import PlatformRecord

    values = _validate_values(schema, field_values)
    record = PlatformRecord(
        name=name,
        author=actor,
        last_editor=actor,
        project=project,
        schema=schema,
        properties=metadata or {},
        field_values=values,
    )
    record.set_source(project)
    record.save()
    revision = create_initial_snapshot(record, actor)
    action = _write_action(record, actor, "created", request_id, {"revision_id": str(revision.pk)})
    return _record_response(record, revision=revision, action=action)


@transaction.atomic
def edit_record(
    *, actor, record_id, state_token, request_id, field_values=None, metadata=None,
    action_identity=None, provider_mod_id="helix", provider_mod_version="1",
    action_contract=None, request_hash=None,
):
    from helix_core.models import ActionExecutionReceipt, PlatformRecord
    from bundled.access.access.policies import effective_role

    request_payload = {
        "record_id": str(record_id),
        "state_token": str(state_token),
        "field_values": field_values,
        "metadata": metadata,
    }
    request_hash = request_hash or _digest(request_payload)
    receipt = ActionExecutionReceipt.objects.filter(actor=actor, request_id=request_id).first()
    if receipt is not None:
        if receipt.request_hash != request_hash:
            raise StateConflict("This request ID was already used for a different proposal.")
        return receipt.response

    try:
        record = PlatformRecord.objects.select_for_update().select_related("schema__schema_type", "project").get(pk=record_id)
    except (PlatformRecord.DoesNotExist, ValueError):
        raise NotFound("Record not found.")
    receipt = ActionExecutionReceipt.objects.filter(actor=actor, request_id=request_id).first()
    if receipt is not None:
        if receipt.request_hash != request_hash:
            raise StateConflict("This request ID was already used for a different proposal.")
        return receipt.response
    if effective_role(actor, record) != "edit":
        raise PermissionDenied("You do not have permission to edit this record.")
    if str(record.state_token) != str(state_token):
        raise StateConflict()

    changed_values = field_values is not None
    values = record.field_values or {}
    if changed_values:
        proposed = _validate_values(record.schema, field_values)
        values = {**values, **proposed}
    proposed_metadata = record.properties or {}
    if metadata is not None:
        if not isinstance(metadata, dict):
            raise ValidationError({"metadata": "Expected an object."})
        proposed_metadata = metadata
    values_changed = values != (record.field_values or {})
    metadata_changed = proposed_metadata != (record.properties or {})

    record.field_values = values
    record.properties = proposed_metadata
    record.last_editor = actor
    record.state_token = uuid4()
    record.save(update_fields=["field_values", "properties", "last_editor", "state_token", "updated_at"])

    group = record.revision_groups.select_for_update().select_related("current_revision").get(group_key="record")
    revision = group.current_revision
    if values_changed:
        from helix_core.models import ScientificRevision

        snapshot = {
            "name": record.name,
            "metadata": record.properties or {},
            "schema_id": record.schema_id,
            "field_values": record.field_values or {},
        }
        revision = ScientificRevision.objects.create(
            group=group,
            sequence=group.revisions.count() + 1,
            snapshot=snapshot,
            content_hash=_digest(snapshot),
            created_by=actor,
        )
        group.current_revision = revision
        group.save(update_fields=["current_revision"])

    action_metadata = {
        "revision_id": str(revision.pk) if revision else None,
        "values_changed": values_changed,
        "metadata_changed": metadata_changed,
    }
    if action_contract:
        action_metadata["action_contract"] = action_contract
    action = _write_action(
        record, actor, "edited", request_id, action_metadata,
        action_identity=action_identity,
        provider_mod_id=provider_mod_id,
        provider_mod_version=provider_mod_version,
    )
    response = _record_response(record, revision=revision, action=action)
    ActionExecutionReceipt.objects.create(
        actor=actor,
        request_id=request_id,
        request_hash=request_hash,
        response=response,
    )
    return response


def _freeze(value):
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    return value


def _validate_contract_value(type_node, value, where):
    kind = type_node.get("type") if isinstance(type_node, dict) else None
    valid = {
        "string": lambda v: isinstance(v, str),
        "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
        "boolean": lambda v: isinstance(v, bool),
        "date": lambda v: isinstance(v, str),
        "datetime": lambda v: isinstance(v, str),
        "recordReference": lambda v: isinstance(v, dict) and isinstance(v.get("id"), str),
        "attachmentReference": lambda v: isinstance(v, dict) and isinstance(v.get("id"), str),
    }
    if kind in valid and not valid[kind](value):
        raise ValidationError({"inputs": f"Input '{where}' does not match its declared type."})
    if kind == "object":
        if not isinstance(value, dict) or set(value) != set(type_node["fields"]):
            raise ValidationError({"inputs": f"Input '{where}' does not match its declared fields."})
        for name, nested in type_node["fields"].items():
            _validate_contract_value(nested, value[name], f"{where}.{name}")
    if kind == "array":
        if not isinstance(value, list):
            raise ValidationError({"inputs": f"Input '{where}' must be a list."})
        for index, item in enumerate(value):
            _validate_contract_value(type_node["items"], item, f"{where}[{index}]")
    if kind == "optional" and value is not None:
        _validate_contract_value(type_node["valueType"], value, where)
    if kind == "contract":
        if not isinstance(value, dict):
            raise ValidationError({"inputs": f"Input '{where}' must be a contract value."})


@transaction.atomic
def execute_record_action(
    *, actor, record_id, action_id, contract_id, contract_version,
    state_token, request_id, inputs,
):
    """Invoke one registered provider and persist only Platform-validated effects."""
    from helix_core.mod_system.contracts import parse_contract_json
    from helix_core.mod_system.registry import registry
    from helix_core.models import ActionExecutionReceipt, PlatformRecord, RetainedContract
    from bundled.access.access.policies import effective_role

    invocation_hash = _digest({
        "record_id": str(record_id),
        "action_id": action_id,
        "contract_id": contract_id,
        "contract_version": contract_version,
        "state_token": str(state_token),
        "inputs": inputs,
    })
    receipt = ActionExecutionReceipt.objects.filter(actor=actor, request_id=request_id).first()
    if receipt is not None:
        if receipt.request_hash != invocation_hash:
            raise StateConflict("This request ID was already used for a different invocation.")
        return receipt.response
    try:
        record = PlatformRecord.objects.select_for_update().select_related("schema__schema_type", "project").get(pk=record_id)
    except (PlatformRecord.DoesNotExist, ValueError):
        raise NotFound("Record not found.")
    receipt = ActionExecutionReceipt.objects.filter(actor=actor, request_id=request_id).first()
    if receipt is not None:
        if receipt.request_hash != invocation_hash:
            raise StateConflict("This request ID was already used for a different invocation.")
        return receipt.response
    if effective_role(actor, record) != "edit":
        raise PermissionDenied("You do not have permission to execute an Action on this record.")
    if str(record.state_token) != str(state_token):
        raise StateConflict()

    registration = registry.get_record_action(action_id)
    if registration is None:
        raise ValidationError({"action": "No executable provider is registered for this Action."})
    if (
        registration["action_contract_id"] != contract_id
        or registration["action_contract_version"] != contract_version
    ):
        raise ValidationError({"contract": "The Action Contract must match the provider's exact declaration."})
    retained = RetainedContract.objects.filter(
        kind="action", contract_id=contract_id, version=contract_version
    ).first()
    if retained is None:
        raise ValidationError({"contract": "The exact Action Contract definition is not retained."})
    envelope = parse_contract_json(retained.canonical_envelope)
    definition = envelope["definition"]
    if definition.get("targets", {}).get("record") != "helix.record":
        raise ValidationError({"contract": "The Action Contract does not target Platform records."})
    if definition.get("effects", {}).get("record") != "edited":
        raise ValidationError({"contract": "The Action Contract does not declare the record edit effect."})
    if not isinstance(inputs, dict) or set(inputs) != set(definition.get("inputs", {})):
        raise ValidationError({"inputs": "Inputs must match the Action Contract's declared ports."})
    for name, value in inputs.items():
        _validate_contract_value(definition["inputs"][name], value, name)
    context = _freeze({
        "actor_id": actor.pk,
        "record_id": str(record_id),
        "state_token": str(state_token),
        "action_id": action_id,
        "contract_id": contract_id,
        "contract_version": contract_version,
    })
    proposed = registration["handler"](context, _freeze(inputs))
    if not isinstance(proposed, ProposedEffects):
        raise ValidationError({"effects": "Action providers must return ProposedEffects."})
    if proposed.field_values is None and proposed.metadata is None:
        raise ValidationError({"effects": "The provider proposed no declared record change."})
    return edit_record(
        actor=actor,
        record_id=record_id,
        state_token=state_token,
        request_id=request_id,
        field_values=dict(proposed.field_values) if proposed.field_values is not None else None,
        metadata=dict(proposed.metadata) if proposed.metadata is not None else None,
        action_identity=action_id,
        provider_mod_id=registration["provider_mod_id"],
        provider_mod_version=registration["provider_mod_version"],
        action_contract={"id": contract_id, "version": contract_version},
        request_hash=invocation_hash,
    )


def _provider_snapshot(instance) -> dict[str, Any]:
    columns = [
        *(getattr(instance.schema.schema_type, "columns", []) or []),
        *(getattr(instance.schema, "columns", []) or []),
    ]
    values = {}
    properties = instance.properties or {}
    for column in columns:
        field_id = column.get("id")
        name = column.get("name")
        if not field_id or not name or name not in properties:
            continue
        value_type = column.get("type", "json")
        if value_type in {"text", "dropdown", "textarea"}:
            value_type = "string"
        elif value_type in {"integer", "float", "decimal"}:
            value_type = "number"
        values[field_id] = {"type": value_type, "value": properties[name]}
    return {
        "name": instance.name,
        "metadata": {"status": instance.status},
        "schema_id": instance.schema_id,
        "field_values": values,
    }


@transaction.atomic
def mutate_provider_record(
    *, write, actor, action, target_model_reference, request_id, client_ip,
    metadata=None, instance=None,
):
    """Run a consuming Mod record write, snapshot it, and audit it atomically."""
    from helix_core.models import ActionLogEntry, ActionParticipant, RecordRevisionGroup, ScientificRevision

    # The view's write callback sets serializer.instance after persistence.
    before = _provider_snapshot(instance) if instance is not None else None
    instance = write()
    snapshot = _provider_snapshot(instance)
    object_id = str(instance.pk)
    group, created = RecordRevisionGroup.objects.get_or_create(
        target_model_reference=target_model_reference,
        target_object_id=object_id,
        group_key="record",
        defaults={"record": None},
    )
    previous = group.current_revision
    changed = created or previous is None or before != snapshot
    if changed:
        revision = ScientificRevision.objects.create(
            group=group,
            sequence=(group.revisions.count() + 1),
            snapshot=snapshot,
            content_hash=_digest(snapshot),
            created_by=actor,
        )
        group.current_revision = revision
        group.save(update_fields=["current_revision"])

    # Reuse the shared Platform Action Log writer inside this transaction.
    from helix_core.actions.mixins import log_action

    action_row = log_action(
        user=actor,
        action=action,
        target_type=target_model_reference,
        target_id=instance.pk,
        metadata={**(metadata or {}), "revision_id": str(group.current_revision_id)},
        request_id=request_id,
        client_ip=client_ip or None,
    )
    if isinstance(action_row, ActionLogEntry) and action_row.pk:
        ActionParticipant.objects.create(
            action=action_row,
            record=None,
            target_model_reference=target_model_reference,
            target_object_id=object_id,
            role="subject",
        )
    return instance


@transaction.atomic
def record_provider_batch(
    *, records, before_snapshots, actor, action, target_model_reference,
    target_object_id, request_id, client_ip, metadata=None, action_writer=None,
):
    """Commit one shared Action for a batch and snapshots for changed records."""
    from helix_core.models import ActionLogEntry, ActionParticipant, RecordRevisionGroup, ScientificRevision

    for record in records:
        object_id = str(record.pk)
        snapshot = _provider_snapshot(record)
        before = before_snapshots.get(object_id)
        group, created = RecordRevisionGroup.objects.get_or_create(
            target_model_reference="lims.entity",
            target_object_id=object_id,
            group_key="record",
            defaults={"record": None},
        )
        previous = group.current_revision
        if created or previous is None or before != snapshot:
            revision = ScientificRevision.objects.create(
                group=group,
                sequence=group.revisions.count() + 1,
                snapshot=snapshot,
                content_hash=_digest(snapshot),
                created_by=actor,
            )
            group.current_revision = revision
            group.save(update_fields=["current_revision"])

    if action_writer is None:
        from helix_core.actions.mixins import log_action
        action_writer = log_action

    action_row = action_writer(
        user=actor,
        action=action,
        target_type=target_model_reference,
        target_id=target_object_id,
        action_type="edited",
        metadata={**(metadata or {}), "participant_count": len(records)},
        request_id=request_id,
        client_ip=client_ip or None,
    )
    if isinstance(action_row, ActionLogEntry) and action_row.pk:
        ActionParticipant.objects.bulk_create([
            ActionParticipant(
                action=action_row,
                target_model_reference="lims.entity",
                target_object_id=str(record.pk),
                role="affected",
            )
            for record in records
        ])
    return action_row
