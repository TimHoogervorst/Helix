"""Atomic persistence boundary for Platform-owned scientific records."""

from __future__ import annotations

import hashlib
import json
import math
import time
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


class ProviderUnavailable(APIException):
    status_code = 503
    default_detail = "The Action provider is currently unavailable."
    default_code = "provider_unavailable"


class ActionValidationError(APIException):
    status_code = 422
    default_detail = "The Action Contract or Schema does not support this invocation."
    default_code = "action_validation_error"


@dataclass(frozen=True)
class ProposedEffects:
    """Read-only proposal returned by an Action provider for Platform validation."""

    field_values: Mapping[str, Mapping[str, Any]] | None = None
    metadata: Mapping[str, Any] | None = None
    outputs: Mapping[str, Mapping[str, Any]] | None = None


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
    from helix_core.attachments import attachment_metadata
    snapshot = current.snapshot if current else {"field_values": record.field_values or {}}
    attachments = attachment_metadata(snapshot, record_id=record.pk, revision_id=current.pk if current else None)
    return {
        "id": str(record.pk),
        "display_id": record.display_id,
        "name": record.name,
        "author": record.author_snapshot or None,
        "metadata": record.properties or {},
        "project_id": record.project_id,
        "source": {"kind": "project", "id": record.project_id},
        "schema_id": record.schema_id,
        "schema_state": _schema_state(record),
        "field_values": record.field_values or {},
        "attachments": attachments,
        "state_token": str(record.state_token),
        "revision": None if current is None else {
            "id": str(current.pk),
            "group_id": str(current.group_id),
            "sequence": current.sequence,
            "content_hash": current.content_hash,
        },
        "action": None if action is None else {"id": action.pk, "identity": action.action},
    }


@transaction.atomic
def delete_platform_record(record, *, actor=None, source=None):
    """Remove a record and its owned history while retaining authoritative audit."""
    from helix_core.models import ActionLogEntry, ActionParticipant, RecordRevisionGroup

    locked = type(record).objects.select_for_update().get(pk=record.pk)
    revision_ids = [
        str(value)
        for value in locked.revision_groups.values_list("revisions__pk", flat=True).distinct()
        if value
    ]
    action = ActionLogEntry.objects.create(
        performed_by=actor,
        action="helix.record.deleted",
        action_type="deleted",
        target_model_reference="helix.record",
        target_object_id=str(locked.pk),
        request_id=uuid4(),
        metadata={
            "revision_ids": revision_ids,
            "source": source or {},
        },
    )
    ActionParticipant.objects.create(
        action=action,
        record=locked,
        target_model_reference="helix.record",
        target_object_id=str(locked.pk),
        role="subject",
    )
    for group in RecordRevisionGroup.objects.select_for_update().filter(record=locked):
        group.current_revision = None
        group.save(update_fields=["current_revision"])
        group.delete()
    from django.db import models as django_models
    django_models.Model.delete(locked)
    return action


@transaction.atomic
def delete_source_entity(model, object_id, *, target_model_reference, actor=None, source=None):
    """Retain an audit outcome and remove Platform history for a source entity."""
    from helix_core.models import ActionLogEntry, ActionParticipant, RecordRevisionGroup

    entity = model.objects.select_for_update().filter(pk=object_id).first()
    if entity is None:
        return None

    target_references = {target_model_reference}
    if target_model_reference == "helix.eln:entry":
        # ELN document groups created before its stable ModelReference was
        # adopted stored the legacy short name. Include those rows while
        # deleting through the canonical registry identity.
        target_references.add("eln.entry")
    groups = list(RecordRevisionGroup.objects.select_for_update().filter(
        target_model_reference__in=target_references,
        target_object_id=str(object_id),
    ))
    revisions = [
        str(value)
        for value in RecordRevisionGroup.objects.filter(
            pk__in=[group.pk for group in groups]
        ).values_list("revisions__pk", flat=True).distinct()
        if value
    ]
    action = ActionLogEntry.objects.create(
        performed_by=actor,
        action="helix.source.deleted",
        action_type="deleted",
        target_model_reference=target_model_reference,
        target_object_id=str(object_id),
        request_id=uuid4(),
        metadata={"revision_ids": revisions, "source": source or {}},
    )
    ActionParticipant.objects.create(
        action=action,
        record=None,
        target_model_reference=target_model_reference,
        target_object_id=str(object_id),
        role="subject",
    )
    for group in groups:
        group.current_revision = None
        group.save(update_fields=["current_revision"])
        group.delete()
    linked_record_id = getattr(entity, "platform_record_id", None)
    if linked_record_id:
        from helix_core.models import PlatformRecord
        try:
            linked_record = PlatformRecord.objects.get(pk=linked_record_id)
        except PlatformRecord.DoesNotExist:
            linked_record = None
        if linked_record is not None:
            delete_platform_record(
                linked_record,
                actor=actor,
                source=source or {
                    "kind": "source-entity",
                    "type": target_model_reference,
                    "id": str(object_id),
                },
            )
    model.objects.filter(pk=object_id).delete()
    return action


def _schema_state(record) -> dict[str, Any]:
    """Return the exact editable Schema mapping observed for a record."""
    schema = record.schema
    schema_type = schema.schema_type
    columns = [*(schema_type.columns or []), *(schema.columns or [])]
    return {
        "schemaId": schema.pk,
        "schemaHash": schema.content_hash,
        "schemaTypeId": schema_type.pk,
        "schemaTypeHash": schema_type.content_hash,
        "mappingHash": _digest(columns),
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
    from helix_core.attachments import link_revision_attachments
    link_revision_attachments(project_id=project.pk, values=record.field_values, revision=revision)
    action = _write_action(record, actor, "created", request_id, {"revision_id": str(revision.pk)})
    return _record_response(record, revision=revision, action=action)


@transaction.atomic
def edit_record(
    *, actor, record_id, state_token, request_id, field_values=None, metadata=None,
    action_identity=None, provider_mod_id="helix", provider_mod_version="1",
    action_contract=None, additional_action_metadata=None, request_hash=None,
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
        from helix_core.attachments import link_revision_attachments
        link_revision_attachments(project_id=record.project_id, values=snapshot, revision=revision)

    action_metadata = {
        "revision_id": str(revision.pk) if revision else None,
        "values_changed": values_changed,
        "metadata_changed": metadata_changed,
    }
    if action_contract:
        action_metadata["action_contract"] = action_contract
    if additional_action_metadata:
        action_metadata.update(additional_action_metadata)
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


@transaction.atomic
def save_revision_group(
    *, actor, record_id, group_key, state_token, request_id, snapshot,
    target_model_reference=None, target_object_id=None, action_type="edited",
    record_name=None,
):
    """Persist one immutable Mod-owned snapshot on a Platform record.

    Revision groups let a Mod own portable document history while the
    Platform remains the sole owner of revision and Action persistence.
    """
    from bundled.access.access.policies import effective_role
    from helix_core.models import (
        ActionExecutionReceipt, PlatformRecord, RecordRevisionGroup,
        ScientificRevision,
    )

    if not isinstance(group_key, str) or not group_key or group_key == "record":
        raise ValidationError({"group_key": "A non-empty Mod-owned group key is required."})
    if not isinstance(snapshot, dict):
        raise ValidationError({"snapshot": "Expected a JSON object."})
    contract_ref = snapshot.get("contract")
    if contract_ref is not None:
        if not isinstance(contract_ref, dict) or set(contract_ref) != {"kind", "id", "version"}:
            raise ValidationError({"snapshot": "A portable snapshot requires an exact contract identity."})
        if "document" not in snapshot:
            raise ValidationError({"snapshot": "A portable document snapshot requires document content."})
        _validate_contract_value({"type": "contract", **contract_ref}, snapshot["document"], "document")
    request_payload = {
        "record_id": str(record_id), "group_key": group_key,
        "state_token": str(state_token), "snapshot": snapshot,
        "target_model_reference": target_model_reference,
        "target_object_id": str(target_object_id) if target_object_id is not None else None,
        "action_type": action_type,
        "record_name": record_name,
    }
    request_hash = _digest(request_payload)
    receipt = ActionExecutionReceipt.objects.filter(actor=actor, request_id=request_id).first()
    if receipt:
        if receipt.request_hash != request_hash:
            raise StateConflict("This request ID was already used for a different document save.")
        return receipt.response
    try:
        record = PlatformRecord.objects.select_for_update().select_related("project").get(pk=record_id)
    except (PlatformRecord.DoesNotExist, ValueError):
        raise NotFound("Record not found.")
    if effective_role(actor, record) != "edit":
        raise PermissionDenied("You do not have permission to edit this record.")
    if str(record.state_token) != str(state_token):
        raise StateConflict()

    group, created = RecordRevisionGroup.objects.select_for_update().get_or_create(
        record=record,
        group_key=group_key,
        defaults={
            "target_model_reference": target_model_reference or "helix.record",
            "target_object_id": str(target_object_id if target_object_id is not None else record.pk),
        },
    )
    if not created and target_model_reference and (
        group.target_model_reference != target_model_reference
        or group.target_object_id != str(target_object_id)
    ):
        raise ValidationError({"group_key": "This Revision Group belongs to another target."})
    current = group.current_revision
    revision = current
    changed = current is None or current.snapshot != snapshot
    name_changed = record_name is not None and record.name != record_name
    if changed:
        revision = ScientificRevision.objects.create(
            group=group,
            sequence=group.revisions.count() + 1,
            snapshot=snapshot,
            content_hash=_digest(snapshot),
            created_by=actor,
        )
        group.current_revision = revision
        group.save(update_fields=["current_revision"])
        from helix_core.attachments import link_revision_attachments

        link_revision_attachments(
            project_id=record.project_id, values=snapshot, revision=revision,
        )
    if changed or name_changed:
        record.last_editor = actor
        record.state_token = uuid4()
        update_fields = ["last_editor", "state_token", "updated_at"]
        if name_changed:
            record.name = record_name
            update_fields.append("name")
        record.save(update_fields=update_fields)
    target_ref = target_model_reference or "helix.record"
    target_id = target_object_id if target_object_id is not None else record.pk
    action_metadata = {
        "revision_id": str(revision.pk), "group_id": str(group.pk),
        "group_key": group_key, "revision_changed": changed,
    }
    if target_ref == "eln.entry":
        action_metadata["record_id"] = str(record.pk)
    action = _write_action(
        record, actor, action_type, request_id,
        action_metadata,
        action_identity="eln.entry.created" if action_type == "created" else "eln.entry.edited",
        provider_mod_id="helix.eln", provider_mod_version="0.1.0",
        target_model_reference=target_ref, target_object_id=target_id,
    )
    response = {
        "record_id": str(record.pk), "state_token": str(record.state_token),
        "group_id": str(group.pk), "group_key": group.group_key,
        "revision_id": str(revision.pk), "sequence": revision.sequence,
        "content_hash": revision.content_hash, "revision_changed": changed,
        "action": {"id": action.pk, "identity": action.action},
    }
    ActionExecutionReceipt.objects.create(
        actor=actor, request_id=request_id, request_hash=request_hash,
        response=response,
    )
    return response


def _freeze(value):
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    return value


def _validate_contract_value(type_node, value, where, depth=0):
    if depth > 64:
        raise ValidationError({"inputs": f"Input '{where}' exceeds the maximum document depth."})
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
    if kind == "json":
        def is_json(item, remaining):
            if remaining < 0:
                return False
            if item is None or isinstance(item, (str, bool, int)):
                return True
            if isinstance(item, float):
                return math.isfinite(item)
            if isinstance(item, list):
                return all(is_json(nested, remaining - 1) for nested in item)
            if isinstance(item, dict):
                return all(isinstance(key, str) and is_json(nested, remaining - 1) for key, nested in item.items())
            return False
        if not is_json(value, 64 - depth):
            raise ValidationError({"inputs": f"Input '{where}' must be a finite JSON value within the maximum depth."})
        return
    if kind in valid and not valid[kind](value):
        raise ValidationError({"inputs": f"Input '{where}' does not match its declared type."})
    if kind in {"string", "date", "datetime", "number", "boolean"}:
        if "enum" in type_node and not any(
            type(candidate) is type(value) and candidate == value
            or kind == "number" and not isinstance(candidate, bool)
            and isinstance(candidate, (int, float)) and candidate == value
            for candidate in type_node["enum"]
        ):
            raise ValidationError({"inputs": f"Input '{where}' is not one of its declared values."})
        if kind == "string" and (
            len(value) < type_node.get("minLength", 0)
            or len(value) > type_node.get("maxLength", math.inf)
        ):
            raise ValidationError({"inputs": f"Input '{where}' does not match its declared length bounds."})
        if kind == "number" and (
            value < type_node.get("minimum", -math.inf)
            or value > type_node.get("maximum", math.inf)
        ):
            raise ValidationError({"inputs": f"Input '{where}' does not match its declared numeric bounds."})
    if kind == "object":
        fields = type_node["fields"]
        optional_fields = type_node.get("optionalFields", {})
        allowed = set(fields) | set(optional_fields)
        extra = set(value) - allowed if isinstance(value, dict) else set()
        if (
            not isinstance(value, dict)
            or not set(fields) <= set(value)
            or (extra and "additionalValues" not in type_node)
        ):
            raise ValidationError({"inputs": f"Input '{where}' does not match its declared fields."})
        for name, nested in fields.items():
            _validate_contract_value(nested, value[name], f"{where}.{name}", depth + 1)
        for name, nested in optional_fields.items():
            if name in value:
                _validate_contract_value(nested, value[name], f"{where}.{name}", depth + 1)
        if "additionalValues" in type_node:
            for name in extra:
                _validate_contract_value(type_node["additionalValues"], value[name], f"{where}.{name}", depth + 1)
    if kind == "array":
        if not isinstance(value, list):
            raise ValidationError({"inputs": f"Input '{where}' must be a list."})
        if len(value) < type_node.get("minItems", 0) or len(value) > type_node.get("maxItems", math.inf):
            raise ValidationError({"inputs": f"Input '{where}' does not match its declared item bounds."})
        for index, item in enumerate(value):
            _validate_contract_value(type_node["items"], item, f"{where}[{index}]", depth + 1)
    if kind == "optional" and value is not None:
        _validate_contract_value(type_node["valueType"], value, where, depth + 1)
    if kind == "contract":
        if not isinstance(value, dict):
            raise ValidationError({"inputs": f"Input '{where}' must be a contract value."})
        if type_node.get("kind") != "data":
            raise ValidationError({"inputs": f"Input '{where}' must reference a Data Contract."})
        from helix_core.models import RetainedContract
        from helix_core.mod_system.contracts import parse_contract_json
        retained = RetainedContract.objects.filter(
            kind="data", contract_id=type_node["id"], version=type_node["version"]
        ).first()
        if retained is None:
            raise ValidationError({"inputs": f"Input '{where}' references a Data Contract that is not retained."})
        envelope = parse_contract_json(retained.canonical_envelope)
        _validate_contract_value(envelope["definition"]["type"], value, where, depth + 1)


def _require_current_read_access(actor, record):
    from bundled.access.access.policies import effective_role

    if effective_role(actor, record) not in {"read", "edit"}:
        raise PermissionDenied("You no longer have permission to access this Action outcome.")


@transaction.atomic
def execute_action_invocation(
    *, actor, invocation_id, sequence_fingerprint, inputs, parameters,
    targets, expected_state, providers,
):
    """Execute one registered synchronous Action and persist its replay receipt."""
    from helix_core.mod_system.contracts import parse_contract_json
    from helix_core.mod_system.registry import registry
    from helix_core.models import (
        ActionInvocationReceipt, PlatformRecord, RetainedContract,
    )

    # The actor row is the portable transaction lock for the actor-scoped ID
    # namespace. It serializes competing first uses even before a receipt row
    # exists, and keeps the receipt check ahead of all mutable-state checks.
    actor = type(actor).objects.select_for_update().get(pk=actor.pk)
    requested = {
        "sequenceFingerprint": sequence_fingerprint,
        "inputs": inputs,
        "parameters": parameters,
        "targets": targets,
        "expectedState": expected_state,
        "providers": providers,
    }
    request_fingerprint = _digest({"actor": str(actor.pk), **requested})
    receipt = ActionInvocationReceipt.objects.filter(
        actor_stable_id=str(actor.pk), invocation_id=invocation_id
    ).first()
    if receipt is not None:
        if receipt.request_fingerprint != request_fingerprint:
            raise StateConflict("This invocation ID was already used for a different request.")
        target_available = _authorize_invocation_replay(actor, receipt)
        outcome = dict(receipt.outcome)
        mark_unavailable_action_targets(outcome, target_available)
        outcome["replayed"] = True
        return outcome

    if not isinstance(targets, dict) or set(targets) != {"record"}:
        raise ValidationError({"targets": "A single Action must name exactly one record target."})
    if not isinstance(expected_state, dict) or set(expected_state) != {"record"}:
        raise ValidationError({"expectedState": "Expected state must name the record target."})
    if not isinstance(providers, dict) or set(providers) != {"action"}:
        raise ValidationError({"providers": "A single Action must select one action provider."})
    if parameters not in ({}, None):
        raise ActionValidationError({"parameters": "This Action declares no parameters."})
    action_id = providers["action"]
    if not isinstance(action_id, str) or not action_id:
        raise ValidationError({"providers": "The action provider identity is required."})

    try:
        record_id = UUID(str(targets["record"]))
        state = expected_state["record"]
        expected_token = UUID(str(state["stateToken"]))
        expected_revision_id = (
            UUID(str(state["revisionId"])) if state.get("revisionId") is not None else None
        )
        expected_schema_state = state.get("schemaState")
        expected_document_group_id = (
            UUID(str(state["documentGroupId"])) if state.get("documentGroupId") is not None else None
        )
        expected_document_revision_id = (
            UUID(str(state["documentRevisionId"])) if state.get("documentRevisionId") is not None else None
        )
    except (KeyError, TypeError, ValueError, AttributeError):
        raise ValidationError({"expectedState": "Record target and exact saved state are required."})
    if sequence_fingerprint != "legacy-single-action" and (
        expected_revision_id is None or expected_schema_state is None
    ):
        raise ValidationError({"expectedState": "Revision and Schema mapping state are required."})
    if (expected_document_group_id is None) != (expected_document_revision_id is None):
        raise ValidationError({"expectedState": "Document group and Revision must be supplied together."})

    try:
        hint = PlatformRecord.objects.get(pk=record_id)
    except (PlatformRecord.DoesNotExist, ValueError):
        raise NotFound("Record not found.")

    # Lock mutable rows in a stable parent-to-child order. Schema and access
    # writes contend on the same rows; the record and Revision pointer are
    # checked again after all locks are held.
    from helix_core.core.models import Project
    from helix_core.models import Schema, SchemaType
    Project.objects.select_for_update().get(pk=hint.project_id)
    schema_hint = Schema.objects.only("schema_type_id").get(pk=hint.schema_id)
    SchemaType.objects.select_for_update().get(pk=schema_hint.schema_type_id)
    Schema.objects.select_for_update().get(pk=hint.schema_id)
    record = PlatformRecord.objects.select_for_update().select_related(
        "schema__schema_type", "project"
    ).get(pk=record_id)
    _lock_record_access_rows(actor, record)
    from bundled.access.access.policies import effective_role

    if effective_role(actor, record) != "edit":
        raise PermissionDenied("You do not have permission to execute an Action on this record.")
    revision_group = record.revision_groups.select_for_update().select_related(
        "current_revision"
    ).get(group_key="record")
    observed_schema_state = _schema_state(record)
    if (
        record.state_token != expected_token
        or (expected_revision_id is not None and revision_group.current_revision_id != expected_revision_id)
        or (expected_schema_state is not None and observed_schema_state != expected_schema_state)
    ):
        raise StateConflict("The record, Revision, or Schema mapping changed since it was loaded.")
    source_document_group = None
    if expected_document_group_id is not None:
        from helix_core.models import RecordRevisionGroup
        source_document_group = record.revision_groups.select_for_update().filter(
            pk=expected_document_group_id, group_key="document",
        ).select_related("current_revision").first()
        if (
            source_document_group is None
            or source_document_group.current_revision_id != expected_document_revision_id
        ):
            raise StateConflict("The saved document Revision changed before Action invocation.")

    registration = registry.get_record_action(action_id)
    if registration is None:
        raise ProviderUnavailable()
    contract_id = registration["action_contract_id"]
    contract_version = registration["action_contract_version"]
    retained = RetainedContract.objects.filter(
        kind="action", contract_id=contract_id, version=contract_version
    ).first()
    if retained is None:
        raise ProviderUnavailable("The provider's exact Action Contract is unavailable.")
    envelope = parse_contract_json(retained.canonical_envelope)
    definition = envelope["definition"]
    if definition.get("targets", {}).get("record") != "helix.record":
        raise ActionValidationError({"contract": "The Action Contract does not target Platform records."})
    if definition.get("effects", {}).get("record") != "edited":
        raise ActionValidationError({"contract": "The Action Contract does not declare the record edit effect."})
    if not isinstance(inputs, dict) or set(inputs) != set(definition.get("inputs", {})):
        raise ActionValidationError({"inputs": "Inputs must match the Action Contract's declared ports."})
    try:
        for name, value in inputs.items():
            _validate_contract_value(definition["inputs"][name], value, name)
    except ValidationError as exc:
        raise ActionValidationError(exc.detail)

    server_fingerprint = _digest({
        "actor": str(actor.pk), **requested,
        "resolved": {
            "recordId": str(record.pk),
            "schemaState": observed_schema_state,
            "provider": {
                "actionId": action_id,
                "modId": registration["provider_mod_id"],
                "modVersion": registration["provider_mod_version"],
                "contractId": contract_id,
                "contractVersion": contract_version,
            },
        },
    })
    execution_started = time.monotonic()
    deadline = execution_started + 30.0
    context = _freeze({
        "actor_id": actor.pk,
        "record_id": str(record.pk),
        "state_token": str(record.state_token),
        "action_id": action_id,
        "contract_id": contract_id,
        "contract_version": contract_version,
        "deadline_monotonic": deadline,
    })
    try:
        proposed = registration["handler"](context, _freeze(inputs))
    except ValidationError as exc:
        raise ActionValidationError(exc.detail)
    except Exception as exc:
        raise ProviderUnavailable("The Action provider failed before proposing its effects.") from exc
    if time.monotonic() > deadline:
        raise ProviderUnavailable("The Action provider exceeded the 30 second execution budget.")
    if not isinstance(proposed, ProposedEffects):
        raise ActionValidationError({"effects": "Action providers must return ProposedEffects."})
    if proposed.field_values is None and proposed.metadata is None:
        raise ActionValidationError({"effects": "The provider proposed no declared record change."})
    declared_outputs = definition.get("outputs", {})
    output_values = proposed.outputs or {}
    if set(output_values) != set(declared_outputs):
        raise ActionValidationError({"outputs": "Provider outputs must match the Action Contract's declared ports."})
    try:
        for name, type_node in declared_outputs.items():
            typed_value = output_values[name]
            if not isinstance(typed_value, Mapping) or set(typed_value) != {"type", "value"}:
                raise ValidationError({"outputs": f"Output '{name}' must contain type and value."})
            expected_type = type_node.get("type") if isinstance(type_node, Mapping) else None
            if typed_value["type"] != expected_type:
                raise ValidationError({"outputs": f"Output '{name}' must use type '{expected_type}'."})
            _validate_contract_value(type_node, typed_value["value"], name)
    except ValidationError as exc:
        raise ActionValidationError(exc.detail)

    # Recheck the entire tracked read set after provider execution. The row
    # locks prevent concurrent committed edits on PostgreSQL; these checks also
    # catch writes performed by a provider on its current transaction.
    record.refresh_from_db()
    record.schema.refresh_from_db()
    record.schema.schema_type.refresh_from_db()
    revision_group.refresh_from_db()
    if (
        record.state_token != expected_token
        or (expected_revision_id is not None and revision_group.current_revision_id != expected_revision_id)
    ):
        raise StateConflict("The record changed while the Action was being prepared.")
    if _schema_state(record) != observed_schema_state or effective_role(actor, record) != "edit":
        raise StateConflict("The Schema mapping or authorization changed while the Action was prepared.")

    before_revision = revision_group.current_revision
    before_state_token = record.state_token
    try:
        record_response = edit_record(
            actor=actor,
            record_id=record.pk,
            state_token=record.state_token,
            request_id=uuid4(),
            field_values=dict(proposed.field_values) if proposed.field_values is not None else None,
            metadata=dict(proposed.metadata) if proposed.metadata is not None else None,
            action_identity=action_id,
            provider_mod_id=registration["provider_mod_id"],
            provider_mod_version=registration["provider_mod_version"],
            action_contract={"id": contract_id, "version": contract_version},
            additional_action_metadata=(
                {"source_document": {
                    "record_id": str(record.pk),
                    "group_id": str(source_document_group.pk),
                    "revision_id": str(source_document_group.current_revision_id),
                }} if source_document_group is not None else None
            ),
            request_hash=server_fingerprint,
        )
    except ValidationError as exc:
        raise ActionValidationError(exc.detail)
    from helix_core.models import ActionLogEntry
    action = ActionLogEntry.objects.get(pk=record_response["action"]["id"])
    if source_document_group is not None:
        # Link the exact ELN document Revision as an input participant on the
        # same shared Action as the provider's record effects.
        from helix_core.models import ActionParticipant
        ActionParticipant.objects.get_or_create(
            action=action,
            target_model_reference=source_document_group.target_model_reference,
            target_object_id=source_document_group.target_object_id,
            role="document_input",
        )
    outcome = {
        "invocationId": invocation_id,
        "actionId": action.pk,
        "outputs": dict(output_values),
        "providers": [{
            "stepId": "action",
            "actionId": action_id,
            "modId": registration["provider_mod_id"],
            "modVersion": registration["provider_mod_version"],
            "contractId": contract_id,
            "contractVersion": contract_version,
        }],
        "participants": [{
            "targetRole": "record",
            "targetType": "helix.record",
            "targetId": str(record.pk),
            "role": "subject",
            "before": {
                "revisionId": str(before_revision.pk),
                "sequence": before_revision.sequence,
                "stateToken": str(before_state_token),
            },
            "after": {
                "revisionId": record_response["revision"]["id"],
                "sequence": record_response["revision"]["sequence"],
                "stateToken": record_response["state_token"],
            },
        }],
        "replayed": False,
        "record": record_response,
    }
    ActionInvocationReceipt.objects.create(
        actor=actor,
        actor_stable_id=str(actor.pk),
        invocation_id=invocation_id,
        fingerprint=server_fingerprint,
        request_fingerprint=request_fingerprint,
        target_ids={"record": str(record.pk), "project": record.project_id},
        outcome=outcome,
    )
    return outcome


def _lock_record_access_rows(actor, record):
    from django.db.models import Q
    from bundled.access.access.models import Grant, OrganizationMembership

    team_ids = actor.groups.order_by("pk").values_list("pk", flat=True)
    list(Grant.objects.select_for_update().filter(
        Q(project_id=record.project_id), Q(user_id=actor.pk) | Q(team__group_id__in=team_ids)
    ).order_by("pk"))
    OrganizationMembership.objects.select_for_update().filter(user_id=actor.pk).first()
    through = actor.groups.through
    list(through.objects.select_for_update().filter(user_id=actor.pk).order_by("pk"))


def lock_record_revision_for_update(
    *, actor, record_id, group_key, state_token, revision_id,
):
    """Lock and revalidate an exact record Revision under the shared write protocol.

    Mod-owned revision capture uses this boundary so record state, schema
    ownership, and access grants cannot change between authorization and commit.
    The caller must already be inside ``transaction.atomic()``.
    """
    from helix_core.core.models import Project
    from helix_core.models import PlatformRecord, Schema, SchemaType
    from bundled.access.access.policies import effective_role

    try:
        hint = PlatformRecord.objects.get(pk=record_id)
    except (PlatformRecord.DoesNotExist, ValueError, TypeError):
        raise NotFound("Record not found.")

    Project.objects.select_for_update().get(pk=hint.project_id)
    schema_hint = Schema.objects.only("schema_type_id").get(pk=hint.schema_id)
    SchemaType.objects.select_for_update().get(pk=schema_hint.schema_type_id)
    Schema.objects.select_for_update().get(pk=hint.schema_id)
    record = PlatformRecord.objects.select_for_update().select_related(
        "schema__schema_type", "project"
    ).get(pk=record_id)
    _lock_record_access_rows(actor, record)
    if effective_role(actor, record) != "edit":
        raise PermissionDenied("You do not have permission to edit this record.")
    group = record.revision_groups.select_for_update().select_related(
        "current_revision"
    ).filter(group_key=group_key).first()
    if (
        group is None
        or str(record.state_token) != str(state_token)
        or str(group.current_revision_id) != str(revision_id)
    ):
        raise StateConflict("The record or Revision changed since it was loaded.")
    return record, group


def _authorize_invocation_replay(actor, receipt):
    from helix_core.models import PlatformRecord
    from helix_core.core.models import Project
    from bundled.access.access.policies import role

    record_id = receipt.target_ids.get("record")
    try:
        record = PlatformRecord.objects.select_related("project").get(pk=record_id)
    except (PlatformRecord.DoesNotExist, ValueError, TypeError):
        project_id = receipt.target_ids.get("project")
        try:
            project = Project.objects.get(pk=project_id)
        except (Project.DoesNotExist, ValueError, TypeError):
            raise NotFound("The Action target is no longer available.")
        if role(actor, project) not in {"read", "edit"}:
            raise PermissionDenied("You no longer have permission to access this Action outcome.")
        return False
    _require_current_read_access(actor, record)
    return True


def mark_unavailable_action_targets(outcome, target_available):
    """Return a retained Action outcome without presenting deleted records as live."""
    if target_available:
        return outcome
    outcome.pop("record", None)
    for participant in outcome.get("participants", []):
        participant["targetUnavailable"] = True
    return outcome


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
