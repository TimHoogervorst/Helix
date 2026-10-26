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
    creates: list[Mapping[str, Any]] | None = None
    document_snapshot: Mapping[str, Any] | None = None
    document_references: list[Mapping[str, Any]] | None = None


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
    from helix_core.reviews import ensure_record_unlocked
    ensure_record_unlocked(locked)
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

    from helix_core.reviews import ensure_record_unlocked
    review_record_id = getattr(entity, "platform_record_id", None)
    if review_record_id:
        ensure_record_unlocked(review_record_id)

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


def edit_record(
    *, actor, record_id, state_token, request_id, field_values=None, metadata=None,
    action_identity=None, provider_mod_id="helix", provider_mod_version="1",
    action_contract=None, additional_action_metadata=None, request_hash=None,
    persist_receipt=True,
):
    request_payload = {
        "record_id": str(record_id),
        "state_token": str(state_token),
        "field_values": field_values,
        "metadata": metadata,
    }
    from helix_core.record_mutations import execute_record_edit, request_fingerprint

    fingerprint = request_hash or request_fingerprint(request_payload)

    def execute():
        from helix_core.models import PlatformRecord
        from bundled.access.access.policies import effective_role

        try:
            record = PlatformRecord.objects.select_for_update(of=("self",)).select_related(
                "schema__schema_type", "project"
            ).get(pk=record_id)
        except (PlatformRecord.DoesNotExist, ValueError):
            raise NotFound("Record not found.")
        if effective_role(actor, record) != "edit":
            raise PermissionDenied("You do not have permission to edit this record.")
        from helix_core.reviews import ensure_record_unlocked
        ensure_record_unlocked(record)
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
        if values_changed or metadata_changed:
            from helix_core.reviews import record_review_metadata_effect
            record_review_metadata_effect(record=record, actor=actor)

        group = record.revision_groups.select_for_update(of=("self",)).select_related(
            "current_revision"
        ).get(group_key="record")
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
        return _record_response(record, revision=revision, action=action)

    return execute_record_edit(
        actor=actor,
        request_id=request_id,
        fingerprint=fingerprint,
        execute=execute,
        persist_receipt=persist_receipt,
    )


def save_revision_group(
    *, actor, record_id, group_key, state_token, request_id, snapshot,
    target_model_reference=None, target_object_id=None, action_type="edited",
    record_name=None,
):
    """Persist one immutable Mod-owned snapshot on a Platform record.

    Revision groups let a Mod own portable document history while the
    Platform remains the sole owner of revision and Action persistence.
    """
    from helix_core.models import ActionExecutionReceipt
    from helix_core.record_mutations import execute_revision_group_save

    request_payload = {
        "record_id": str(record_id), "group_key": group_key,
        "state_token": str(state_token), "snapshot": snapshot,
        "target_model_reference": target_model_reference,
        "target_object_id": str(target_object_id) if target_object_id is not None else None,
        "action_type": action_type,
        "record_name": record_name,
    }
    request_hash = _digest(request_payload)

    def execute():
        from bundled.access.access.policies import effective_role
        from helix_core.models import PlatformRecord, RecordRevisionGroup, ScientificRevision
        from helix_core.mod_system.registry import registry

        if not isinstance(group_key, str) or not group_key or group_key == "record":
            raise ValidationError({"group_key": "A non-empty Mod-owned group key is required."})
        if not isinstance(snapshot, dict):
            raise ValidationError({"snapshot": "Expected a JSON object."})
        if not isinstance(target_model_reference, str) or not target_model_reference:
            raise ValidationError({"target_model_reference": "A registered target is required."})
        if target_object_id is None or str(target_object_id) == "":
            raise ValidationError({"target_object_id": "A target object identity is required."})
        registration = registry.resolve_revision_group_registration(
            target_model_reference, group_key,
        )
        if registration is None:
            raise ValidationError({
                "group_key": "No unambiguous registered owner is available for this Revision Group."
            })
        action_identity = registration["action_identities"].get(action_type)
        if action_identity is None:
            raise ValidationError({
                "action_type": "This Action type is not permitted by the Revision Group registration."
            })
        contract_ref = snapshot.get("contract")
        if contract_ref is not None:
            if not isinstance(contract_ref, dict) or set(contract_ref) != {"kind", "id", "version"}:
                raise ValidationError({"snapshot": "A portable snapshot requires an exact contract identity."})
            if "document" not in snapshot:
                raise ValidationError({"snapshot": "A portable document snapshot requires document content."})
            _validate_contract_value({"type": "contract", **contract_ref}, snapshot["document"], "document")
        try:
            record = PlatformRecord.objects.select_for_update(of=("self",)).select_related("project").get(pk=record_id)
        except (PlatformRecord.DoesNotExist, ValueError):
            raise NotFound("Record not found.")
        if effective_role(actor, record) != "edit":
            raise PermissionDenied("You do not have permission to edit this record.")
        from helix_core.reviews import ensure_record_unlocked
        ensure_record_unlocked(record)
        if str(record.state_token) != str(state_token):
            raise StateConflict()

        group, created = RecordRevisionGroup.objects.select_for_update().get_or_create(
            record=record,
            group_key=group_key,
            defaults={
                "target_model_reference": target_model_reference,
                "target_object_id": str(target_object_id),
                "owner_mod_id": registration["owner_mod_id"],
            },
        )
        if not created and (
            group.target_model_reference != target_model_reference
            or group.target_object_id != str(target_object_id)
        ):
            raise ValidationError({"group_key": "This Revision Group belongs to another target."})
        if group.owner_mod_id and group.owner_mod_id != registration["owner_mod_id"]:
            raise ValidationError({"group_key": "This Revision Group belongs to another Mod."})
        if not group.owner_mod_id:
            # Legacy rows retain their historical target identity. Bind only
            # when the exact target/group pair has one active registration.
            group.owner_mod_id = registration["owner_mod_id"]
            group.save(update_fields=["owner_mod_id"])
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
        from helix_core.reviews import record_review_content_effect
        if changed or name_changed or action_type == "created":
            record_review_content_effect(
                record=record, actor=actor,
                provider_mod_id=registration["owner_mod_id"],
                group_key=group_key,
                effect="created" if action_type == "created" else "edited",
            )
        target_ref = target_model_reference
        target_id = target_object_id
        action_metadata = {
            "revision_id": str(revision.pk), "group_id": str(group.pk),
            "group_key": group_key, "revision_changed": changed,
        }
        if target_ref == "eln.entry":
            action_metadata["record_id"] = str(record.pk)
        action = _write_action(
            record, actor, action_type, request_id,
            action_metadata,
            action_identity=action_identity,
            provider_mod_id=registration["owner_mod_id"],
            provider_mod_version=registration["provider_mod_version"],
            target_model_reference=target_ref, target_object_id=target_id,
        )
        response = {
            "record_id": str(record.pk), "state_token": str(record.state_token),
            "group_id": str(group.pk), "group_key": group.group_key,
            "revision_id": str(revision.pk), "sequence": revision.sequence,
            "content_hash": revision.content_hash, "revision_changed": changed,
            "action": {"id": action.pk, "identity": action.action},
        }
        persisted_response = {
            **response,
            "_recovery": {"project_id": record.project_id},
        }
        ActionExecutionReceipt.objects.create(
            actor=actor, request_id=request_id, request_hash=request_hash,
            response=persisted_response,
        )
        return response

    return execute_revision_group_save(
        actor=actor,
        request_id=request_id,
        fingerprint=request_hash,
        execute=execute,
    )


def migrate_revision_group_ownership():
    """Bind legacy groups only when active registrations resolve them exactly.

    Historical target strings, revisions, Actions and receipts are left
    untouched. Missing or ambiguous registrations leave the legacy owner blank
    so the public save boundary will fail closed until ownership is resolved.
    """
    from django.db import connection
    from django.db.utils import OperationalError, ProgrammingError
    from helix_core.models import RecordRevisionGroup
    from helix_core.mod_system.registry import registry

    # ``AppConfig.ready`` also runs for commands that execute before migrations.
    # The model state already knows about owner_mod_id then, but the physical
    # table may still be at migration 0001. Defer in that case; post_migrate
    # will call startup reconciliation again after the schema reaches 0002.
    try:
        with connection.cursor() as cursor:
            columns = {
                column.name
                for column in connection.introspection.get_table_description(
                    cursor, RecordRevisionGroup._meta.db_table
                )
            }
    except (OperationalError, ProgrammingError):
        return 0
    if "owner_mod_id" not in columns:
        return 0

    migrated = 0
    with transaction.atomic():
        groups = RecordRevisionGroup.objects.select_for_update().filter(owner_mod_id="")
        for group in groups.iterator():
            registration = registry.resolve_revision_group_registration(
                group.target_model_reference, group.group_key,
            )
            if registration is None:
                continue
            group.owner_mod_id = registration["owner_mod_id"]
            group.save(update_fields=["owner_mod_id"])
            migrated += 1
    return migrated


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

    if effective_role(actor, record) not in {"read", "review", "edit"}:
        raise PermissionDenied("You no longer have permission to access this Action outcome.")


def _validate_retained_sequence(snapshot, declaration, fingerprint):
    """Require the submitted complete Sequence to equal one in the saved document."""
    if not isinstance(snapshot, Mapping) or not isinstance(declaration, dict):
        raise ActionValidationError({"sequenceDeclaration": "A saved document Action Sequence is required."})
    found = []
    pending = [snapshot]
    while pending:
        value = pending.pop()
        if isinstance(value, Mapping):
            sequence = value.get("actionSequence")
            if isinstance(sequence, Mapping) and sequence.get("fingerprint") == fingerprint:
                found.append(_thaw(sequence))
            pending.extend(value.values())
        elif isinstance(value, (list, tuple)):
            pending.extend(value)
    if len(found) != 1 or found[0] != declaration:
        raise ActionValidationError({"sequenceDeclaration": "The Action Sequence is missing, ambiguous, or differs from the exact saved document declaration."})
    sequence_steps = declaration.get("steps")
    if not isinstance(sequence_steps, list) or len(sequence_steps) < 2:
        raise ActionValidationError({"sequenceDeclaration": "A composed Action Sequence must declare at least two ordered steps."})


def _find_saved_block(snapshot, block_id):
    matches = []
    seen = set()
    pending = [snapshot]
    while pending:
        value = pending.pop()
        if isinstance(value, Mapping):
            attrs = value.get("attrs")
            portable = attrs.get("portableBlock") if isinstance(attrs, Mapping) else None
            candidates = [candidate for candidate in (value, attrs, portable) if isinstance(candidate, Mapping)]
            for candidate in candidates:
                if candidate.get("id") == block_id and id(candidate) not in seen:
                    seen.add(id(candidate))
                    matches.append(candidate)
            pending.extend(value.values())
        elif isinstance(value, (list, tuple)):
            pending.extend(value)
    if len(matches) != 1:
        raise ActionValidationError({"inputs": "A saved Block input is missing or ambiguous."})
    block = _thaw(matches[0])
    content = block.get("content")
    if isinstance(content, Mapping) and set(content) == {"type", "value"}:
        return content["value"]
    if isinstance(block.get("rows"), list):
        return block
    raise ActionValidationError({"inputs": "The saved Block has no retained typed content."})


def _resolve_block_source(snapshot, source, type_node, where):
    if set(source) != {"kind", "blockId", "path"}:
        raise ActionValidationError({"inputs": f"Input '{where}' has an invalid saved Block binding."})
    block_id, path = source.get("blockId"), source.get("path")
    if not isinstance(block_id, str) or not block_id or not isinstance(path, list) or any(not isinstance(part, str) for part in path):
        raise ActionValidationError({"inputs": f"Input '{where}' has an invalid saved Block path."})
    value = _find_saved_block(snapshot, block_id)
    for part in path:
        if isinstance(value, Mapping) and part in value:
            value = value[part]
        elif isinstance(value, (list, tuple)) and part.isdecimal() and int(part) < len(value):
            value = value[int(part)]
        else:
            raise ActionValidationError({"inputs": f"Input '{where}' does not exist at its saved Block path."})
    if isinstance(value, Mapping) and set(value) == {"type", "value"}:
        if value["type"] != type_node:
            raise ActionValidationError({"inputs": f"Input '{where}' has a saved Block type mismatch."})
        value = value["value"]
    try:
        _validate_contract_value(type_node, value, where)
    except ValidationError as exc:
        raise ActionValidationError({"inputs": exc.detail})
    return _thaw(value)


def _resolve_record_source(actor, source, type_node, where):
    from bundled.access.access.policies import effective_role
    from helix_core.models import PlatformRecord, RecordRevisionGroup

    reference = source.get("reference")
    if set(source) != {"kind", "reference"} or not isinstance(reference, Mapping):
        raise ActionValidationError({"inputs": f"Input '{where}' has an invalid Record Reference binding."})
    if set(reference) - {"mode", "entityId", "groupId", "revisionId", "fieldId"}:
        raise ActionValidationError({"inputs": f"Input '{where}' has unsupported Record Reference properties."})
    mode = reference.get("mode")
    entity_id = reference.get("entityId")
    field_id = reference.get("fieldId")
    if not isinstance(mode, str) or mode not in {"current", "exact"} or not isinstance(entity_id, str) or not entity_id:
        raise ActionValidationError({"inputs": f"Input '{where}' has an invalid Record Reference."})
    if reference.get("groupId") is not None and not isinstance(reference.get("groupId"), str):
        raise ActionValidationError({"inputs": f"Input '{where}' has an invalid Revision Group ID."})
    if reference.get("revisionId") is not None and not isinstance(reference.get("revisionId"), str):
        raise ActionValidationError({"inputs": f"Input '{where}' has an invalid Revision ID."})
    try:
        target = PlatformRecord.objects.filter(pk=UUID(entity_id)).first()
    except (TypeError, ValueError):
        target = None
    if target is None:
        target = PlatformRecord.objects.filter(display_id=entity_id).first()
    # Missing and inaccessible references have the same response so record
    # existence and field values cannot be discovered through this boundary.
    if target is None:
        raise PermissionDenied("You do not have permission to use this Action input.")
    target = PlatformRecord.objects.select_for_update(of=("self",)).select_related("schema__schema_type").get(pk=target.pk)
    _lock_record_access_rows(actor, target)
    if effective_role(actor, target) not in {"read", "review", "edit"}:
        raise PermissionDenied("You do not have permission to use this Action input.")

    groups = target.revision_groups.select_for_update().filter(group_key="record")
    if mode == "exact":
        try:
            group_id = UUID(str(reference["groupId"]))
            revision_id = UUID(str(reference["revisionId"]))
        except (KeyError, TypeError, ValueError):
            raise ActionValidationError({"inputs": f"Input '{where}' requires an exact Record Revision."})
        group = groups.filter(pk=group_id).first()
        if group is None:
            raise ActionValidationError({"inputs": f"Input '{where}' references an unavailable exact Revision."})
        revision = group.revisions.select_for_update().filter(pk=revision_id).first()
        if revision is None:
            raise ActionValidationError({"inputs": f"Input '{where}' references an unavailable exact Revision."})
    else:
        if reference.get("revisionId") is not None:
            raise ActionValidationError({"inputs": f"Input '{where}' cannot pin a Revision in current mode."})
        group = groups.filter(pk=reference.get("groupId")).first() if reference.get("groupId") else groups.first()
        if group is None or (reference.get("groupId") and str(group.pk) != str(reference["groupId"])):
            raise ActionValidationError({"inputs": f"Input '{where}' references an unavailable current Record."})
        revision = group.current_revision
    if revision is None:
        raise ActionValidationError({"inputs": f"Input '{where}' references a Record without a saved Revision."})

    if field_id is None:
        if (type_node.get("type") if isinstance(type_node, Mapping) else None) != "recordReference":
            raise ActionValidationError({"inputs": f"Input '{where}' must select a stable field ID."})
        return {"id": str(target.pk)}, {
            "record": target, "group": group, "revision": revision,
        }
    if not isinstance(field_id, str) or not field_id:
        raise ActionValidationError({"inputs": f"Input '{where}' has an invalid stable field ID."})
    stored = revision.snapshot.get("field_values", {}).get(field_id)
    column = _schema_fields(target).get(field_id)
    if not isinstance(stored, Mapping) or (mode == "current" and column is None):
        raise ActionValidationError({"inputs": f"Input '{where}' references an unavailable stable field."})
    if mode == "exact":
        # An exact Revision carries its own stable field type and, for a
        # Data Contract, its exact retained binding. The live Schema may have
        # removed or retyped this field since that Revision was captured.
        source_type = {"type": stored.get("type")}
        if stored.get("type") == "contract" and isinstance(stored.get("contract"), Mapping):
            source_type.update(stored["contract"])
    else:
        source_type = column.get("type")
        if isinstance(source_type, str):
            source_type = {"type": {"text": "string", "textarea": "string", "dropdown": "string",
                                      "integer": "number", "float": "number", "decimal": "number"}.get(source_type, source_type)}
        elif isinstance(source_type, Mapping) and source_type.get("type") == "contract":
            source_type = {key: value for key, value in source_type.items() if key != "type"}
            source_type = {"type": "contract", **source_type}
        if column.get("contract"):
            source_type = {"type": "contract", **column["contract"]}
    stored_type = "contract" if type_node.get("type") == "contract" else type_node.get("type")
    if source_type != type_node or stored.get("type") != stored_type:
        raise ActionValidationError({"inputs": f"Input '{where}' has an incompatible saved Record field type."})
    value = _thaw(stored.get("value"))
    try:
        _validate_contract_value(type_node, value, where)
    except ValidationError as exc:
        raise ActionValidationError({"inputs": exc.detail})
    return value, {"record": target, "group": group, "revision": revision}


def execute_action_invocation(
    *, actor, invocation_id, sequence_fingerprint, inputs, parameters,
    targets, expected_state, providers, steps=None, sequence_declaration=None,
):
    """Execute through the shared actor-scoped mutation and recovery lifecycle."""
    from django.contrib.auth import get_user_model
    from helix_core.models import ActionInvocationReceipt
    from helix_core.record_mutations import execute_mutation_lifecycle

    requested = {
        "sequenceFingerprint": sequence_fingerprint,
        "inputs": inputs,
        "parameters": parameters,
        "targets": targets,
        "expectedState": expected_state,
        "providers": providers,
        "steps": steps,
        "sequenceDeclaration": sequence_declaration,
    }
    request_fingerprint = _digest({"actor": str(actor.pk), **requested})

    def lock_identity():
        # Session auth may expose request.user as a SimpleLazyObject.
        get_user_model()._default_manager.select_for_update().get(pk=actor.pk)

    def find_receipt():
        return ActionInvocationReceipt.objects.select_for_update().filter(
            actor_stable_id=str(actor.pk), invocation_id=invocation_id
        ).first()

    def recover(receipt):
        unavailable_target_ids = _authorize_invocation_replay(actor, receipt)
        outcome = dict(receipt.outcome)
        mark_unavailable_action_targets(outcome, unavailable_target_ids)
        outcome["replayed"] = True
        return outcome

    return execute_mutation_lifecycle(
        lock_identity=lock_identity,
        find_receipt=find_receipt,
        receipt_fingerprint=lambda receipt: receipt.request_fingerprint,
        request_fingerprint=request_fingerprint,
        recover=recover,
        conflict_message="This invocation ID was already used for a different request.",
        execute=lambda: _execute_action_invocation_body(
            actor=actor,
            invocation_id=invocation_id,
            sequence_fingerprint=sequence_fingerprint,
            inputs=inputs,
            parameters=parameters,
            targets=targets,
            expected_state=expected_state,
            providers=providers,
            steps=steps,
            sequence_declaration=sequence_declaration,
            request_fingerprint=request_fingerprint,
        ),
    )


def _execute_action_invocation_body(
    *, actor, invocation_id, sequence_fingerprint, inputs, parameters,
    targets, expected_state, providers, steps, sequence_declaration, request_fingerprint,
):
    """Validate providers and apply their effects inside the shared lifecycle."""
    from helix_core.mod_system.contracts import parse_contract_json
    from helix_core.mod_system.registry import registry
    from helix_core.models import (
        ActionInvocationReceipt, PlatformRecord, RetainedContract, Schema,
    )

    requested = {
        "sequenceFingerprint": sequence_fingerprint,
        "inputs": inputs,
        "parameters": parameters,
        "targets": targets,
        "expectedState": expected_state,
        "providers": providers,
        "steps": steps,
        "sequenceDeclaration": sequence_declaration,
    }
    if not isinstance(targets, dict) or set(targets) != {"record"}:
        raise ValidationError({"targets": "A single Action must name exactly one record target."})
    if not isinstance(expected_state, dict) or set(expected_state) != {"record"}:
        raise ValidationError({"expectedState": "Expected state must name the record target."})
    if steps is None:
        if not isinstance(providers, dict) or set(providers) != {"action"}:
            raise ValidationError({"providers": "A single Action must select one action provider."})
    else:
        if not isinstance(steps, list) or not 2 <= len(steps) <= 16:
            raise ActionValidationError({"steps": "A composed Action Sequence must contain 2 to 16 steps."})
        step_ids = [item.get("id") for item in steps if isinstance(item, dict)]
        if len(step_ids) != len(steps) or len(set(step_ids)) != len(step_ids) or any(not isinstance(item, str) or not item for item in step_ids):
            raise ActionValidationError({"steps": "Action step IDs must be unique non-empty strings."})
        if any(set(step) != {"id", "inputs", "parameters"} for step in steps):
            raise ActionValidationError({"steps": "Each step must provide only its ID, inputs, and parameters."})
        if not isinstance(providers, dict) or set(providers) != {"steps"} or not isinstance(providers["steps"], dict) or set(providers["steps"]) != set(step_ids):
            raise ActionValidationError({"providers": "Each composed Action step must select exactly one provider."})
        if any(not isinstance(value, str) or not value for value in providers["steps"].values()):
            raise ActionValidationError({"providers": "Each step provider identity must be a non-empty string."})
        if inputs != {} or parameters != {}:
            raise ActionValidationError({"steps": "Composed invocation inputs and parameters belong to their declared steps."})
        if not isinstance(sequence_declaration, dict):
            raise ActionValidationError({"sequenceDeclaration": "Composed invocations must include the saved Action Sequence declaration."})
        if sequence_declaration.get("fingerprint") != sequence_fingerprint:
            raise ActionValidationError({"sequenceDeclaration": "The Action Sequence fingerprint does not match its declaration."})
    if parameters is None:
        parameters = {}
    if not isinstance(parameters, dict):
        raise ActionValidationError({"parameters": "Action parameters must be an object."})
    action_id = providers.get("action") if steps is None else None
    if steps is None and (not isinstance(action_id, str) or not action_id):
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

    # Lock the primary record and every saved Record Reference source as one
    # set. Acquiring the primary row first and sources later lets two
    # invocations deadlock when each record is the other's source.
    schema_ids = {hint.schema_id}
    schema_parameters = [parameters] if steps is None else [item.get("parameters", {}) for item in steps]
    requested_schema = next((item.get("schemaId") for item in reversed(schema_parameters) if isinstance(item, dict) and item.get("schemaId") is not None), None)
    if requested_schema is not None:
        try:
            schema_ids.add(int(requested_schema))
        except (TypeError, ValueError):
            raise ActionValidationError({"parameters": "schemaId must identify an available Schema."})
    locked_records = _lock_invocation_record_set(
        actor=actor,
        primary_record_id=record_id,
        schema_ids=schema_ids,
        sequence_declaration=sequence_declaration,
    )
    record = locked_records[record_id]
    from bundled.access.access.policies import effective_role

    if effective_role(actor, record) != "edit":
        raise PermissionDenied("You do not have permission to execute an Action on this record.")
    from helix_core.reviews import ensure_record_unlocked
    ensure_record_unlocked(record)
    revision_group = record.revision_groups.select_for_update(of=("self",)).select_related(
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
        source_document_group = record.revision_groups.select_for_update(of=("self",)).filter(
            pk=expected_document_group_id, group_key="document",
        ).select_related("current_revision").first()
        if (
            source_document_group is None
            or source_document_group.current_revision_id != expected_document_revision_id
        ):
            raise StateConflict("The saved document Revision changed before Action invocation.")
    target_schema = None
    if requested_schema is not None:
        target_schema = Schema.objects.select_related("schema_type").get(pk=int(requested_schema))

    if steps is not None:
        _validate_retained_sequence(
            source_document_group.current_revision.snapshot if source_document_group is not None else None,
            sequence_declaration, sequence_fingerprint,
        )
        return _execute_composed_action_invocation(
            actor=actor,
            record=record,
            record_group=revision_group,
            document_group=source_document_group,
            registration_map=providers["steps"],
            steps=steps,
            sequence_fingerprint=sequence_fingerprint,
            invocation_id=invocation_id,
            request_fingerprint=request_fingerprint,
            expected_token=expected_token,
            expected_revision_id=expected_revision_id,
            expected_document_revision_id=expected_document_revision_id,
            observed_schema_state=observed_schema_state,
            target_schema=target_schema,
            sequence_declaration=sequence_declaration,
        )

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
    parameter_definitions = definition.get("parameters", {})
    if set(parameters) != set(parameter_definitions):
        raise ActionValidationError({"parameters": "Parameters must match the Action Contract's declared parameters."})
    try:
        for name, value in parameters.items():
            _validate_contract_value(parameter_definitions[name], value, name)
    except ValidationError as exc:
        raise ActionValidationError(exc.detail)
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
        "parameters": parameters,
        "target_schema": None if target_schema is None else {
            "id": target_schema.pk,
            "content_hash": target_schema.content_hash,
            "schema_type_id": target_schema.schema_type_id,
            "schema_type_hash": target_schema.schema_type.content_hash,
            "columns": [*(target_schema.schema_type.columns or []), *(target_schema.columns or [])],
        },
        "document_snapshot": (
            source_document_group.current_revision.snapshot
            if source_document_group is not None else None
        ),
        "document_target": (
            {"model_reference": source_document_group.target_model_reference,
             "object_id": source_document_group.target_object_id}
            if source_document_group is not None else None
        ),
    })
    observed_target_schema = (
        None if target_schema is None else (
            target_schema.pk, target_schema.content_hash,
            target_schema.schema_type_id, target_schema.schema_type.content_hash,
        )
    )
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
    if (
        proposed.field_values is None and proposed.metadata is None
        and not proposed.creates and proposed.document_snapshot is None
    ):
        raise ActionValidationError({"effects": "The provider proposed no declared record change."})
    declared_effects = definition.get("effects", {})
    if proposed.creates and declared_effects.get("records") != "created":
        raise ActionValidationError({"effects": "The Action Contract does not declare record creation."})
    if proposed.document_snapshot is not None and declared_effects.get("document") != "edited":
        raise ActionValidationError({"effects": "The Action Contract does not declare a document edit."})
    if proposed.document_references and declared_effects.get("document") != "edited":
        raise ActionValidationError({"effects": "The Action Contract does not declare a document edit."})
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
    if target_schema is not None:
        target_schema.refresh_from_db()
        target_schema.schema_type.refresh_from_db()
        current_target_schema = (
            target_schema.pk, target_schema.content_hash,
            target_schema.schema_type_id, target_schema.schema_type.content_hash,
        )
        if current_target_schema != observed_target_schema:
            raise StateConflict("The target Schema mapping changed while the Action was prepared.")

    before_revision = revision_group.current_revision
    before_state_token = record.state_token
    if proposed.creates or proposed.document_snapshot is not None:
        return _commit_created_record_effects(
            actor=actor,
            record=record,
            record_group=revision_group,
            document_group=source_document_group,
            registration=registration,
            action_id=action_id,
            contract_id=contract_id,
            contract_version=contract_version,
            invocation_id=invocation_id,
            sequence_fingerprint=sequence_fingerprint,
            request_fingerprint=request_fingerprint,
            server_fingerprint=server_fingerprint,
            output_values=output_values,
            creates=proposed.creates or [],
            document_snapshot=proposed.document_snapshot,
            actor_id=str(actor.pk),
            before_record_revision=before_revision,
            before_state_token=before_state_token,
            target_schema=target_schema,
            declared_outputs=declared_outputs,
            document_references=proposed.document_references or [],
        )
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
            persist_receipt=False,
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
        target_ids={
            "record": str(record.pk),
            "project": record.project_id,
            "participant_projects": {str(record.pk): record.project_id},
        },
        outcome=outcome,
    )
    return outcome


def _execute_composed_action_invocation(
    *, actor, record, record_group, document_group, registration_map, steps,
    sequence_fingerprint, invocation_id, request_fingerprint, expected_token,
    expected_revision_id, expected_document_revision_id,
    observed_schema_state, target_schema,
    sequence_declaration,
):
    """Prepare a short Action Sequence, then commit its accumulated effects once."""
    from helix_core.mod_system.contracts import parse_contract_json
    from helix_core.mod_system.registry import registry
    from helix_core.models import ActionInvocationReceipt, RetainedContract

    providers = []
    outputs_by_step = {}
    creates = []
    document_snapshot = None
    document_references = []
    used_record_references = {}
    final_registration = None
    final_definition = None
    final_outputs = {}
    execution_started = time.monotonic()
    deadline = execution_started + 30.0
    original_document = document_group.current_revision.snapshot if document_group is not None else None
    original_document_revision_id = document_group.current_revision_id if document_group is not None else None

    declared_steps = sequence_declaration["steps"]
    if len(steps) != len(declared_steps):
        raise ActionValidationError({"steps": "Invocation steps must match the saved Action Sequence exactly."})
    for index, (step, declared_step) in enumerate(zip(steps, declared_steps)):
        step_id = step["id"]
        if step_id != declared_step.get("id"):
            raise ActionValidationError({"steps": "Invocation step order and IDs must match the saved Action Sequence."})
        registration = registry.get_record_action(registration_map[step_id])
        if registration is None:
            raise ProviderUnavailable(f"The provider for Action step '{step_id}' is unavailable.")
        retained = RetainedContract.objects.filter(
            kind="action", contract_id=registration["action_contract_id"],
            version=registration["action_contract_version"],
        ).first()
        if retained is None:
            raise ProviderUnavailable(f"The exact Action Contract for step '{step_id}' is unavailable.")
        definition = parse_contract_json(retained.canonical_envelope)["definition"]
        action_ref = declared_step.get("action")
        if not isinstance(action_ref, Mapping) or action_ref.get("kind") != "action" or (
            action_ref.get("id") != registration["action_contract_id"]
            or action_ref.get("version") != registration["action_contract_version"]
        ):
            raise ActionValidationError({"steps": {step_id: "Selected provider no longer matches the exact Action Contract in the saved Sequence."}})
        declared_inputs = declared_step.get("inputs")
        declared_targets = declared_step.get("targets")
        declared_parameters = declared_step.get("parameters")
        if not isinstance(declared_inputs, Mapping) or set(declared_inputs) != set(definition.get("inputs", {})):
            raise ActionValidationError({"steps": {step_id: "Saved Sequence connections must match the Action Contract input ports."}})
        if not isinstance(declared_parameters, Mapping) or set(declared_parameters) != set(definition.get("parameters", {})):
            raise ActionValidationError({"steps": {step_id: "Saved Sequence parameters must match the Action Contract."}})
        if any(not isinstance(value, Mapping) or set(value) != {"type", "value"} for value in declared_parameters.values()):
            raise ActionValidationError({"steps": {step_id: "Saved Sequence parameters must use exact typed values."}})
        if not isinstance(declared_targets, Mapping) or declared_targets != {"record": "record"}:
            raise ActionValidationError({"steps": {step_id: "Saved Sequence targets must name the Platform record."}})
        if definition.get("targets", {}).get("record") != "helix.record" or definition.get("effects", {}).get("record") != "edited":
            raise ActionValidationError({"steps": {step_id: "Every composed step must target and declare the Platform record."}})

        raw_inputs = step.get("inputs", {})
        parameters = step.get("parameters", {})
        if not isinstance(raw_inputs, dict) or not isinstance(parameters, dict):
            raise ActionValidationError({"steps": {step_id: "Step inputs and parameters must be objects."}})
        if set(parameters) != set(definition.get("parameters", {})):
            raise ActionValidationError({"steps": {step_id: "Parameters must match the Action Contract."}})
        if any(parameters[name] != declared_parameters[name]["value"] for name in parameters):
            raise ActionValidationError({"steps": {step_id: "Invocation parameters differ from the saved Sequence declaration."}})
        try:
            for name, value in parameters.items():
                _validate_contract_value(definition["parameters"][name], value, name)
            if set(raw_inputs) != set(definition.get("inputs", {})):
                raise ValidationError({"inputs": "Inputs must match the Action Contract."})
            resolved_inputs = {}
            for name, value in raw_inputs.items():
                type_node = definition["inputs"][name]
                connection = declared_inputs.get(name)
                if not isinstance(connection, Mapping) or not isinstance(connection.get("kind"), str):
                    raise ValidationError({"inputs": f"Input '{name}' has no supported saved connection."})
                kind = connection["kind"]
                if kind == "step":
                    if set(connection) != {"kind", "stepId", "port"} or connection["stepId"] not in outputs_by_step:
                        raise ValidationError({"inputs": f"Input '{name}' must reference an earlier saved step output."})
                    if value != {"kind": "step", "stepId": connection["stepId"], "port": connection["port"]}:
                        raise ValidationError({"inputs": f"Input '{name}' does not match its saved Sequence connection."})
                    typed_output = outputs_by_step[connection["stepId"]].get(connection["port"])
                    if not isinstance(typed_output, Mapping) or set(typed_output) != {"type", "value"}:
                        raise ValidationError({"inputs": f"Step output for '{name}' is unavailable."})
                    if typed_output["type"] != type_node.get("type"):
                        raise ValidationError({"inputs": f"Step output for '{name}' has an incompatible type."})
                    resolved_inputs[name] = _thaw(typed_output["value"])
                elif kind == "literal":
                    if set(connection) != {"kind", "value"} or not isinstance(connection["value"], Mapping) or set(connection["value"]) != {"type", "value"}:
                        raise ValidationError({"inputs": f"Input '{name}' has an invalid saved literal."})
                    literal = connection["value"]
                    if literal["type"] != type_node or value != literal["value"]:
                        raise ValidationError({"inputs": f"Input '{name}' differs from its exact saved literal."})
                    resolved_inputs[name] = _thaw(literal["value"])
                elif kind == "block":
                    resolved = _resolve_block_source(original_document, connection, type_node, name)
                    if value != resolved:
                        raise ValidationError({"inputs": f"Input '{name}' differs from the exact saved Block value."})
                    resolved_inputs[name] = resolved
                elif kind == "record":
                    resolved, participant = _resolve_record_source(actor, connection, type_node, name)
                    if value != resolved:
                        raise ValidationError({"inputs": f"Input '{name}' differs from its authorized saved Record Reference value."})
                    resolved_inputs[name] = resolved
                    used_record_references[(participant["record"].pk, participant["group"].pk, participant["revision"].pk)] = participant
                else:
                    raise ValidationError({"inputs": f"Input '{name}' uses an unsupported saved source kind."})
                _validate_contract_value(type_node, resolved_inputs[name], name)
        except ValidationError as exc:
            raise ActionValidationError({"steps": {step_id: exc.detail}})

        context = _freeze({
            "actor_id": actor.pk,
            "record_id": str(record.pk),
            "state_token": str(record.state_token),
            "action_id": registration_map[step_id],
            "contract_id": registration["action_contract_id"],
            "contract_version": registration["action_contract_version"],
            "deadline_monotonic": deadline,
            "sequence_fingerprint": sequence_fingerprint,
            "step_id": step_id,
            "step_outputs": outputs_by_step,
            "parameters": parameters,
            "target_schema": None if target_schema is None else {
                "id": target_schema.pk,
                "content_hash": target_schema.content_hash,
                "schema_type_id": target_schema.schema_type_id,
                "schema_type_hash": target_schema.schema_type.content_hash,
                "columns": [*(target_schema.schema_type.columns or []), *(target_schema.columns or [])],
            },
            "document_snapshot": document_snapshot if document_snapshot is not None else original_document,
            "document_target": (
                {"model_reference": document_group.target_model_reference,
                 "object_id": document_group.target_object_id}
                if document_group is not None else None
            ),
        })
        try:
            proposed = registration["handler"](context, _freeze(resolved_inputs))
        except ValidationError as exc:
            raise ActionValidationError({"steps": {step_id: exc.detail}})
        except Exception as exc:
            raise ProviderUnavailable(f"The Action provider for step '{step_id}' failed before proposing effects.") from exc
        if time.monotonic() > deadline:
            raise ProviderUnavailable("The Action Sequence exceeded the 30 second execution budget.")
        if not isinstance(proposed, ProposedEffects):
            raise ActionValidationError({"steps": {step_id: "Providers must return ProposedEffects."}})

        declared_effects = definition["effects"]
        if proposed.creates and declared_effects.get("records") != "created":
            raise ActionValidationError({"steps": {step_id: "The Action Contract does not declare record creation."}})
        if (proposed.document_snapshot is not None or proposed.document_references) and declared_effects.get("document") != "edited":
            raise ActionValidationError({"steps": {step_id: "The Action Contract does not declare document editing."}})
        if proposed.field_values is not None or proposed.metadata is not None:
            raise ActionValidationError({"steps": {step_id: "Composed record field edits are not supported by this Action Sequence."}})

        step_outputs = _thaw(proposed.outputs or {})
        declared_outputs = definition.get("outputs", {})
        if set(step_outputs) != set(declared_outputs):
            raise ActionValidationError({"steps": {step_id: "Outputs must match the Action Contract."}})
        try:
            for name, type_node in declared_outputs.items():
                typed = step_outputs[name]
                if not isinstance(typed, Mapping) or set(typed) != {"type", "value"} or typed["type"] != type_node.get("type"):
                    raise ValidationError({"outputs": f"Output '{name}' must match its declared type."})
                _validate_contract_value(type_node, typed["value"], name)
        except ValidationError as exc:
            raise ActionValidationError({"steps": {step_id: exc.detail}})

        outputs_by_step[step_id] = step_outputs
        creates.extend(proposed.creates or [])
        if proposed.document_snapshot is not None:
            document_snapshot = _thaw(proposed.document_snapshot)
        document_references.extend(proposed.document_references or [])
        providers.append({
            "stepId": step_id,
            "actionId": registration_map[step_id],
            "modId": registration["provider_mod_id"],
            "modVersion": registration["provider_mod_version"],
            "contractId": registration["action_contract_id"],
            "contractVersion": registration["action_contract_version"],
        })
        final_registration = registration
        final_definition = definition
        final_outputs = step_outputs

    if not creates and document_snapshot is None:
        raise ActionValidationError({"steps": "The Action Sequence proposed no persistent effect."})
    record.refresh_from_db()
    record.schema.refresh_from_db()
    record.schema.schema_type.refresh_from_db()
    record_group.refresh_from_db()
    if (
        record.state_token != expected_token
        or (expected_revision_id is not None and record_group.current_revision_id != expected_revision_id)
        or _schema_state(record) != observed_schema_state
    ):
        raise StateConflict("The record or Schema changed while the Action Sequence was being prepared.")
    from bundled.access.access.policies import effective_role
    if effective_role(actor, record) != "edit":
        raise StateConflict("Authorization changed while the Action Sequence was being prepared.")
    if document_group is not None:
        document_group.refresh_from_db()
        if document_group.current_revision_id != expected_document_revision_id or document_group.current_revision_id != original_document_revision_id:
            raise StateConflict("The saved document Revision changed while the Action Sequence was being prepared.")
    observed_target_schema = (
        None if target_schema is None else (
            target_schema.pk, target_schema.content_hash,
            target_schema.schema_type_id, target_schema.schema_type.content_hash,
        )
    )
    if target_schema is not None:
        target_schema.refresh_from_db()
        target_schema.schema_type.refresh_from_db()
        if observed_target_schema != (
            target_schema.pk, target_schema.content_hash,
            target_schema.schema_type_id, target_schema.schema_type.content_hash,
        ):
            raise StateConflict("The target Schema mapping changed while the Action Sequence was being prepared.")

    outcome = _commit_created_record_effects(
        actor=actor,
        record=record,
        record_group=record_group,
        document_group=document_group,
        registration=final_registration,
        action_id=registration_map[steps[-1]["id"]],
        contract_id=final_registration["action_contract_id"],
        contract_version=final_registration["action_contract_version"],
        invocation_id=invocation_id,
        sequence_fingerprint=sequence_fingerprint,
        request_fingerprint=request_fingerprint,
        server_fingerprint=_digest({"sequence": sequence_fingerprint, "providers": providers, "steps": steps}),
        output_values=final_outputs,
        creates=creates,
        document_snapshot=document_snapshot,
        actor_id=str(actor.pk),
        before_record_revision=record_group.current_revision,
        before_state_token=expected_token,
        target_schema=target_schema,
        declared_outputs=final_definition.get("outputs", {}),
        document_references=document_references,
        used_record_references=list(used_record_references.values()),
    )
    last_step_id = steps[-1]["id"]
    if "created" in outcome.get("outputs", {}):
        outputs_by_step[last_step_id]["created"] = outcome["outputs"]["created"]
    outcome["providers"] = providers
    outcome["stepOutputs"] = outputs_by_step
    receipt = ActionInvocationReceipt.objects.get(
        actor_stable_id=str(actor.pk), invocation_id=invocation_id,
    )
    receipt.outcome = outcome
    receipt.save(update_fields=["outcome"])
    return outcome


def _commit_created_record_effects(
    *, actor, record, record_group, document_group, registration, action_id,
    contract_id, contract_version, invocation_id, sequence_fingerprint,
    request_fingerprint, server_fingerprint, output_values, creates,
    document_snapshot, actor_id, before_record_revision, before_state_token,
    target_schema, declared_outputs, document_references, used_record_references=None,
):
    """Commit a provider's Platform record creates and document edit together."""
    from helix_core.models import (
        ActionInvocationReceipt, ActionLogEntry, ActionParticipant,
        PlatformRecord, RecordRevisionGroup, ScientificRevision,
    )

    if len(creates) > 1000:
        raise ActionValidationError({"rows": "An Action may create at most 1000 records."})
    if document_snapshot is not None and document_group is None:
        raise ActionValidationError({"document": "A document edit requires an exact saved document Revision."})
    if document_snapshot is not None and not isinstance(document_snapshot, Mapping):
        raise ActionValidationError({"document": "The document effect must be a JSON object."})
    if not creates and document_snapshot is None:
        raise ActionValidationError({"effects": "The provider proposed no supported registration effects."})
    if document_references and document_snapshot is None:
        raise ActionValidationError({"document": "Document references require a saved document edit."})
    for reference in used_record_references or []:
        _require_current_read_access(actor, reference["record"])

    created = []
    keys = set()
    source_instance = _registration_source_instance(document_group)
    for index, proposal in enumerate(creates):
        if not isinstance(proposal, Mapping):
            raise ActionValidationError({"rows": {index: "Expected an object."}})
        key = proposal.get("key")
        name = proposal.get("name")
        schema_id = proposal.get("schema_id")
        if not isinstance(key, str) or not key or key in keys:
            raise ActionValidationError({"rows": {index: "A unique non-empty create key is required."}})
        keys.add(key)
        if not isinstance(name, str) or not name.strip():
            raise ActionValidationError({"rows": {index: {"name": "Name is required."}}})
        try:
            schema = target_schema if target_schema is not None and str(target_schema.pk) == str(schema_id) else None
            if schema is None:
                from helix_core.models import Schema
                schema = Schema.objects.select_related("schema_type").get(pk=schema_id)
        except (ValueError, TypeError, Schema.DoesNotExist):
            raise ActionValidationError({"rows": {index: {"schema_id": "The target Schema is unavailable."}}})
        if target_schema is not None and schema.pk != target_schema.pk:
            raise ActionValidationError({"rows": {index: {"schema_id": "Created records must use the selected Schema."}}})
        try:
            values = _validate_values(schema, proposal.get("field_values", {}))
        except ValidationError as exc:
            raise ActionValidationError({"rows": {index: exc.detail}})
        metadata = proposal.get("metadata", {})
        if not isinstance(metadata, Mapping):
            raise ActionValidationError({"rows": {index: {"metadata": "Expected an object."}}})
        created_record = PlatformRecord(
            name=name.strip(), author=actor, last_editor=actor,
            project=record.project, schema=schema,
            properties=dict(metadata), field_values=values,
        )
        if source_instance is not None:
            created_record.set_source(source_instance)
        else:
            created_record.set_source(record.project)
        created_record.save()
        revision = create_initial_snapshot(created_record, actor)
        from helix_core.attachments import link_revision_attachments
        link_revision_attachments(project_id=record.project_id, values=values, revision=revision)
        created.append((key, created_record, revision))

    next_document_revision = None
    document_before_revision = document_group.current_revision if document_group is not None else None
    document_changed = False
    if document_snapshot is not None:
        snapshot = _thaw(document_snapshot)
        contract_ref = snapshot.get("contract")
        if contract_ref is not None:
            if not isinstance(contract_ref, Mapping) or set(contract_ref) != {"kind", "id", "version"} or "document" not in snapshot:
                raise ActionValidationError({"document": "The proposed document must preserve its exact contract binding."})
            _validate_contract_value({"type": "contract", **contract_ref}, snapshot["document"], "document")
        _apply_created_record_references(snapshot, document_references, created)
        current = document_group.current_revision
        document_changed = current is None or current.snapshot != snapshot
        next_document_revision = current
        if document_changed:
            next_document_revision = ScientificRevision.objects.create(
                group=document_group,
                sequence=document_group.revisions.count() + 1,
                snapshot=snapshot,
                content_hash=_digest(snapshot),
                created_by=actor,
            )
            document_group.current_revision = next_document_revision
            document_group.save(update_fields=["current_revision"])
            from helix_core.attachments import link_revision_attachments
            link_revision_attachments(
                project_id=record.project_id, values=snapshot,
                revision=next_document_revision,
            )
            record.last_editor = actor
            record.state_token = uuid4()
            record.save(update_fields=["last_editor", "state_token", "updated_at"])

    # One ledger row is the shared Action for every created Entity and the
    # optional document Revision. Participant rows carry each subject's role.
    action = ActionLogEntry.objects.create(
        performed_by=actor,
        action=action_id,
        action_type="edited",
        target_model_reference=(document_group.target_model_reference if document_group else "helix.record"),
        target_object_id=(document_group.target_object_id if document_group else str(record.pk)),
        initiating_mod_id=registration["provider_mod_id"],
        initiating_mod_version=registration["provider_mod_version"],
        request_id=uuid4(),
        metadata={
            "action_contract": {"id": contract_id, "version": contract_version},
            "source_record_id": str(record.pk),
            "document_group_id": str(document_group.pk) if document_group else None,
            "document_before_revision_id": str(document_before_revision.pk) if document_before_revision else None,
            "document_after_revision_id": str(next_document_revision.pk) if next_document_revision else None,
            "created_record_ids": {key: str(item.pk) for key, item, _revision in created},
            "created_count": len(created),
            "used_revisions": [{
                "record_id": str(reference["record"].pk),
                "group_id": str(reference["group"].pk),
                "revision_id": str(reference["revision"].pk),
                "sequence": reference["revision"].sequence,
            } for reference in (used_record_references or [])],
        },
    )
    if document_group is not None:
        ActionParticipant.objects.create(
            action=action,
            record=record,
            target_model_reference=document_group.target_model_reference,
            target_object_id=document_group.target_object_id,
            role="edited" if document_changed else "used",
        )
    participants = []
    for reference in used_record_references or []:
        source_record = reference["record"]
        source_revision = reference["revision"]
        ActionParticipant.objects.create(
            action=action, record=source_record,
            target_model_reference="helix.record",
            target_object_id=str(source_record.pk), role="used",
        )
        participants.append({
            "targetRole": "recordInput", "targetType": "helix.record",
            "targetId": str(source_record.pk), "role": "used",
            "revisionId": str(source_revision.pk),
            "sequence": source_revision.sequence,
        })
    for key, item, revision in created:
        ActionParticipant.objects.create(
            action=action,
            record=item,
            target_model_reference="helix.record",
            target_object_id=str(item.pk),
            role="created",
        )
        participants.append({
            "targetRole": "createdRecord",
            "targetType": "helix.record",
            "targetId": str(item.pk),
            "createKey": key,
            "role": "created",
            "after": {"revisionId": str(revision.pk), "sequence": revision.sequence},
        })
    if document_group is not None:
        participants.insert(0, {
            "targetRole": "document",
            "targetType": document_group.target_model_reference,
            "targetId": document_group.target_object_id,
            "role": "edited" if document_changed else "used",
            "before": ({
                "revisionId": str(document_before_revision.pk),
                "sequence": document_before_revision.sequence,
            } if document_before_revision else None),
            "after": {
                "revisionId": str(next_document_revision.pk),
                "sequence": next_document_revision.sequence,
                "stateToken": str(record.state_token),
            } if next_document_revision else None,
        })

    resolved_outputs = dict(output_values)
    if "created" in declared_outputs:
        if declared_outputs["created"].get("type") != "json":
            raise ActionValidationError({"outputs": "The created-key output must declare JSON."})
        resolved_outputs["created"] = {
            "type": "json", "value": {key: str(item.pk) for key, item, _revision in created},
        }
    outcome = {
        "invocationId": invocation_id,
        "actionId": action.pk,
        "outputs": resolved_outputs,
        "created": {key: str(item.pk) for key, item, _revision in created},
        "createdRecords": {
            key: {
                "id": str(item.pk),
                "displayId": item.display_id,
                "revisionId": str(revision.pk),
                "sequence": revision.sequence,
            }
            for key, item, revision in created
        },
        "providers": [{
            "stepId": "action", "actionId": action_id,
            "modId": registration["provider_mod_id"],
            "modVersion": registration["provider_mod_version"],
            "contractId": contract_id, "contractVersion": contract_version,
        }],
        "participants": participants,
        "replayed": False,
    }
    ActionInvocationReceipt.objects.create(
        actor=actor, actor_stable_id=actor_id, invocation_id=invocation_id,
        fingerprint=server_fingerprint, request_fingerprint=request_fingerprint,
        target_ids={
            "record": str(record.pk), "project": record.project_id,
            "created_records": [str(item.pk) for _key, item, _revision in created],
            "used_records": [str(reference["record"].pk) for reference in (used_record_references or [])],
            "participant_projects": {
                str(record.pk): record.project_id,
                **{str(item.pk): item.project_id for _key, item, _revision in created},
                **{
                    str(reference["record"].pk): reference["record"].project_id
                    for reference in (used_record_references or [])
                },
            },
        },
        outcome=outcome,
    )
    return outcome


def _apply_created_record_references(snapshot, references, created):
    records = {key: record for key, record, _revision in created}
    for index, reference in enumerate(references):
        if not isinstance(reference, Mapping) or set(reference) != {"key", "path"}:
            raise ActionValidationError({"document": {index: "A reference requires only a create key and JSON path."}})
        key, path = reference["key"], reference["path"]
        if key not in records or not isinstance(path, (list, tuple)) or not path:
            raise ActionValidationError({"document": {index: "The document reference target is invalid."}})
        parent = snapshot
        encoded_parents = []
        try:
            for segment in path[:-1]:
                child = parent[segment]
                if isinstance(child, str):
                    decoded = json.loads(child)
                    encoded_parents.append((parent, segment, decoded))
                    child = decoded
                parent = child
            row = parent[path[-1]]
        except (KeyError, IndexError, TypeError, ValueError):
            raise ActionValidationError({"document": {index: "The document reference path does not exist."}})
        if not isinstance(row, dict):
            raise ActionValidationError({"document": {index: "A created record reference must target an object."}})
        record = records[key]
        row.update({
            "entityId": str(record.pk),
            "recordId": str(record.pk),
            "displayId": record.display_id,
            "isRegistered": True,
            "registrationError": None,
        })
        for container, segment, decoded in reversed(encoded_parents):
            container[segment] = json.dumps(decoded)


def _thaw(value):
    if isinstance(value, Mapping):
        return {key: _thaw(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_thaw(item) for item in value]
    return value


def _registration_source_instance(document_group):
    if document_group is None or not document_group.target_model_reference:
        return None
    try:
        from helix_core.mod_system.registry import registry
        model = registry.resolve_content_source_model("entry")
        return model.objects.filter(pk=document_group.target_object_id).first()
    except (LookupError, ValueError, TypeError, AttributeError):
        return None


def _lock_record_access_rows(actor, record):
    from django.db.models import Q
    from bundled.access.access.models import Grant, OrganizationMembership

    team_ids = actor.groups.order_by("pk").values_list("pk", flat=True)
    # The user-or-team predicate adds a nullable team join. Lock grants only;
    # the actor's membership rows are locked separately below.
    list(Grant.objects.select_for_update(of=("self",)).filter(
        Q(project_id=record.project_id), Q(user_id=actor.pk) | Q(team__group_id__in=team_ids)
    ).order_by("pk"))
    OrganizationMembership.objects.select_for_update().filter(user_id=actor.pk).first()
    through = actor.groups.through
    list(through.objects.select_for_update().filter(user_id=actor.pk).order_by("pk"))


def _lock_invocation_record_set(*, actor, primary_record_id, schema_ids, sequence_declaration):
    """Lock every record an invocation can touch using one global row order.

    The order follows the shared write protocol: Project, SchemaType, Schema,
    PlatformRecord, then access rows. Sorting each level means two invocations
    that use one another's primary records as sources cannot acquire record
    locks in opposite orders.
    """
    from django.db.models import Q
    from helix_core.core.models import Project
    from helix_core.models import PlatformRecord, Schema, SchemaType

    primary_id = UUID(str(primary_record_id))
    source_uuids, source_display_ids = set(), set()
    if isinstance(sequence_declaration, Mapping):
        for step in sequence_declaration.get("steps", []):
            if not isinstance(step, Mapping) or not isinstance(step.get("inputs"), Mapping):
                continue
            for connection in step["inputs"].values():
                if not isinstance(connection, Mapping) or connection.get("kind") != "record":
                    continue
                reference = connection.get("reference")
                entity_id = reference.get("entityId") if isinstance(reference, Mapping) else None
                if not isinstance(entity_id, str) or not entity_id:
                    continue
                try:
                    source_uuids.add(UUID(entity_id))
                except (TypeError, ValueError):
                    source_display_ids.add(entity_id)

    lookup = Q(pk=primary_id)
    if source_uuids:
        lookup |= Q(pk__in=source_uuids)
    if source_display_ids:
        lookup |= Q(display_id__in=source_display_ids)
    hints = list(PlatformRecord.objects.filter(lookup).values("pk", "project_id", "schema_id"))
    if not any(item["pk"] == primary_id for item in hints):
        raise NotFound("Record not found.")

    project_ids = sorted({item["project_id"] for item in hints})
    list(Project.objects.select_for_update().filter(pk__in=project_ids).order_by("pk"))

    all_schema_ids = {item["schema_id"] for item in hints} | set(schema_ids)
    schema_hints = list(
        Schema.objects.filter(pk__in=all_schema_ids).values_list("pk", "schema_type_id")
    )
    if len(schema_hints) != len(all_schema_ids):
        raise NotFound("A target Schema is no longer available.")
    schema_type_ids = sorted({schema_type_id for _, schema_type_id in schema_hints})
    list(SchemaType.objects.select_for_update().filter(pk__in=schema_type_ids).order_by("pk"))
    list(Schema.objects.select_for_update().filter(pk__in=all_schema_ids).order_by("pk"))

    record_ids = sorted({item["pk"] for item in hints})
    records = list(
        PlatformRecord.objects.select_for_update(of=("self",)).select_related(
            "schema__schema_type", "project"
        ).filter(pk__in=record_ids).order_by("pk")
    )
    for record in records:
        _lock_record_access_rows(actor, record)
    return {record.pk: record for record in records}


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
    record = PlatformRecord.objects.select_for_update(of=("self",)).select_related(
        "schema__schema_type", "project"
    ).get(pk=record_id)
    _lock_record_access_rows(actor, record)
    if effective_role(actor, record) != "edit":
        raise PermissionDenied("You do not have permission to edit this record.")
    group = record.revision_groups.select_for_update(of=("self",)).select_related(
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
    """Authorize every disclosed Record participant and retain deleted-target context."""
    from helix_core.models import PlatformRecord
    from helix_core.core.models import Project
    from bundled.access.access.policies import role

    target_ids = receipt.target_ids if isinstance(receipt.target_ids, dict) else {}
    participant_projects = target_ids.get("participant_projects", {})
    if not isinstance(participant_projects, dict):
        participant_projects = {}
    record_ids = [target_ids.get("record"), *(target_ids.get("used_records") or []), *(target_ids.get("created_records") or [])]
    unavailable = set()
    for record_id in dict.fromkeys(str(value) for value in record_ids if value is not None):
        try:
            record = PlatformRecord.objects.select_related("project").get(pk=record_id)
        except (PlatformRecord.DoesNotExist, ValueError, TypeError):
            project_id = participant_projects.get(record_id)
            if record_id == str(target_ids.get("record")):
                project_id = project_id or target_ids.get("project")
            try:
                project = Project.objects.get(pk=project_id)
            except (Project.DoesNotExist, ValueError, TypeError):
                raise PermissionDenied("The Action outcome lacks authorization context for a deleted participant.")
            if role(actor, project) not in {"read", "review", "edit"}:
                raise PermissionDenied("You no longer have permission to access this Action outcome.")
            unavailable.add(record_id)
            continue
        _require_current_read_access(actor, record)
    return unavailable


def mark_unavailable_action_targets(outcome, unavailable_target_ids):
    """Mark deleted Record participants and omit their saved record payloads."""
    unavailable_target_ids = {str(target_id) for target_id in unavailable_target_ids}
    if not unavailable_target_ids:
        return outcome
    record = outcome.get("record")
    if isinstance(record, dict) and str(record.get("id")) in unavailable_target_ids:
        outcome.pop("record", None)
    for participant in outcome.get("participants", []):
        if (
            participant.get("targetType") == "helix.record"
            and str(participant.get("targetId")) in unavailable_target_ids
        ):
            participant["targetUnavailable"] = True
    created_records = outcome.get("createdRecords")
    if isinstance(created_records, dict):
        outcome["createdRecords"] = {
            key: value for key, value in created_records.items()
            if str(value.get("id")) not in unavailable_target_ids
        }
    return outcome


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
