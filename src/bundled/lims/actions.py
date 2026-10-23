"""Provider implementations for exact, retained LIMS Actions."""

from __future__ import annotations

from typing import Any, Mapping
import json

from rest_framework.exceptions import ValidationError

from helix_core import ProposedEffects


ACTION_CONTRACT_ID = "helix.lims.registry-register"
ACTION_CONTRACT_VERSION = "1.0.0"


def propose_registry_registration(context, inputs):
    """Propose registration of saved, unmapped Registry Table rows.

    This handler is deliberately a pure transformation: it reads only the
    supplied saved document and Schema snapshots and returns effects for the
    Platform transaction to validate and commit.
    """
    parameters = context["parameters"]
    schema_id = parameters.get("schemaId")
    field_mapping = parameters.get("fieldMapping")
    block_id = parameters.get("blockId")
    rows_input = inputs.get("rows")
    snapshot = context.get("document_snapshot")
    target_schema = context.get("target_schema")
    if not isinstance(snapshot, Mapping) or not isinstance(snapshot.get("document"), Mapping):
        raise ValidationError({"document": "A saved document snapshot is required."})
    if not isinstance(target_schema, Mapping) or str(target_schema.get("id")) != str(schema_id):
        raise ValidationError({"schemaId": "The selected target Schema is unavailable."})
    if not isinstance(block_id, str) or not block_id:
        raise ValidationError({"blockId": "A stable Registry Table block ID is required."})
    if not isinstance(field_mapping, Mapping) or not field_mapping:
        raise ValidationError({"fieldMapping": "Map at least one source field to a target field."})
    if not isinstance(rows_input, (list, tuple)):
        raise ValidationError({"rows": "Saved Registry Table rows are required."})

    document = _mutable_json(snapshot)
    matches = list(_find_registry_tables(document.get("document"), block_id))
    if len(matches) != 1:
        raise ValidationError({"blockId": "The saved Registry Table block is missing or ambiguous."})
    attrs, node_path = matches[0]
    source_rows = attrs.get("rows")
    source_columns = attrs.get("columns")
    if not isinstance(source_rows, list) or _mutable_json(rows_input) != source_rows:
        raise ValidationError({"rows": "Input rows must match the exact saved Registry Table rows."})
    if str(attrs.get("schemaId")) != str(schema_id):
        raise ValidationError({"schemaId": "The target Schema does not match the saved Registry Table."})
    if not isinstance(source_columns, list):
        raise ValidationError({"columns": "The saved Registry Table has no stable source columns."})

    source_by_id = {
        column.get("id"): column for column in source_columns
        if isinstance(column, Mapping) and isinstance(column.get("id"), str)
    }
    target_columns = target_schema.get("columns")
    if not isinstance(target_columns, (list, tuple)):
        raise ValidationError({"schemaId": "The target Schema fields are unavailable."})
    target_by_id = {
        column.get("id"): column for column in target_columns
        if isinstance(column, Mapping) and isinstance(column.get("id"), str)
    }
    mapping = dict(field_mapping)
    if any(not isinstance(source, str) or not isinstance(target, str) for source, target in mapping.items()):
        raise ValidationError({"fieldMapping": "Field mappings must use stable string IDs."})
    if not mapping.keys() <= source_by_id.keys() or not set(mapping.values()) <= target_by_id.keys():
        raise ValidationError({"fieldMapping": "A mapped source or target field no longer exists."})
    if len(set(mapping.values())) != len(mapping):
        raise ValidationError({"fieldMapping": "Each target field may be mapped only once."})

    creates = []
    references = []
    for index, row in enumerate(source_rows):
        if not isinstance(row, Mapping):
            raise ValidationError({"rows": {index: "A row must be an object."}})
        if row.get("isRegistered"):
            if not row.get("entityId"):
                raise ValidationError({"rows": {index: "A registered row is missing its record reference."}})
            continue
        name = row.get("__name")
        if not isinstance(name, str) or not name.strip():
            raise ValidationError({"rows": {index: {"name": "Name is required."}}})
        row_values = row.get("values")
        if not isinstance(row_values, Mapping):
            raise ValidationError({"rows": {index: "Row values must be an object."}})
        typed_values = {}
        for source_id, target_id in mapping.items():
            source_column = source_by_id[source_id]
            target_column = target_by_id[target_id]
            source_name = source_column.get("name")
            if not isinstance(source_name, str) or source_name not in row_values:
                raise ValidationError({"fieldMapping": f"Saved source field '{source_id}' has no row value."})
            value = row_values[source_name]
            value_type = _contract_type(target_column)
            if value_type == "contract":
                contract = target_column.get("contract")
                if not isinstance(contract, Mapping):
                    raise ValidationError({"fieldMapping": f"Target field '{target_id}' has no exact Data Contract."})
                typed_values[target_id] = {"type": "contract", "contract": dict(contract), "value": value}
            else:
                typed_values[target_id] = {"type": value_type, "value": value}
        for field_id, column in target_by_id.items():
            if column.get("required") and field_id not in typed_values:
                raise ValidationError({"fieldMapping": f"Required target field '{field_id}' is not mapped."})

        key = row.get("displayId")
        if not isinstance(key, str) or not key:
            key = f"row-{index + 1}"
        creates.append({
            "key": key,
            "name": name,
            "schema_id": schema_id,
            "field_values": typed_values,
            "metadata": {"registration_provenance": {
                "action": f"{ACTION_CONTRACT_ID}@{ACTION_CONTRACT_VERSION}",
                "source_document": _mutable_json(context.get("document_target")),
                "block_id": block_id,
                "row_key": key,
            }},
        })
        references.append({
            "key": key,
            "path": ["document", *node_path, "rows", index],
        })

    return ProposedEffects(
        creates=creates,
        document_snapshot=document,
        document_references=references,
        outputs={"created": {"type": "json", "value": {item["key"]: "pending" for item in creates}}},
    )


def _find_registry_tables(value: Any, block_id: str, path=()):
    if isinstance(value, list):
        for index, child in enumerate(value):
            yield from _find_registry_tables(child, block_id, (*path, index))
    elif isinstance(value, Mapping):
        attrs = value.get("attrs")
        if isinstance(attrs, Mapping):
            attrs_path = (*path, "attrs")
            if isinstance(attrs.get("content"), str):
                try:
                    decoded = json.loads(attrs["content"])
                except (ValueError, TypeError):
                    decoded = None
                if isinstance(decoded, Mapping):
                    attrs = decoded
                    attrs_path = (*attrs_path, "content")
            portable = attrs.get("portableBlock")
            stable_id = attrs.get("id")
            if isinstance(portable, Mapping):
                stable_id = portable.get("id", stable_id)
            if stable_id == block_id and isinstance(attrs.get("rows"), list):
                yield attrs, attrs_path
        for key, child in value.items():
            yield from _find_registry_tables(child, block_id, (*path, key))


def _contract_type(column: Mapping[str, Any]) -> str:
    value = column.get("type")
    if isinstance(value, Mapping) and value.get("type") == "contract":
        return "contract"
    if value in {"text", "dropdown", "textarea"}:
        return "string"
    if value in {"integer", "float", "decimal"}:
        return "number"
    if isinstance(value, str):
        return value
    raise ValidationError({"fieldMapping": "Target field has an unsupported value type."})


def _mutable_json(value):
    if isinstance(value, Mapping):
        return {key: _mutable_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_mutable_json(item) for item in value]
    return value
