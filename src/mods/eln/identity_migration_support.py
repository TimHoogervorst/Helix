"""Strict translation of identities persisted before the Mod contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class UnknownPersistedIdentity(ValueError):
    """A stored identity is absent from the checked-in migration map."""


_MAP = json.loads((Path(__file__).with_name("identity_map.json")).read_text())


def identity_map() -> dict[str, dict[str, str]]:
    """Return a copy of the exhaustive old-to-new identity map."""
    return {category: dict(values) for category, values in _MAP.items()}


def translate(category: str, value: str) -> str:
    """Translate one known value, failing rather than inferring an identity."""
    try:
        return _MAP[category][value]
    except KeyError as exc:
        raise UnknownPersistedIdentity(
            f"Unknown persisted {category} identity: {value!r}"
        ) from exc


_FIELD_CATEGORIES = {
    "workspaceId": "workspaces",
    "workspace_id": "workspaces",
    "schemaTypeId": "schema_types",
    "schema_type_id": "schema_types",
    "schema_type": "schema_types",
    "model": "models",
    "modelPath": "models",
    "blockId": "blocks",
    "block_id": "blocks",
    "slotId": "slots",
    "slot_id": "slots",
    "entityTab": "entity_tabs",
    "component": "entity_tabs",
    "action": "actions",
    "targetType": "target_types",
    "target_type": "target_types",
}


def migrate_json(value: Any) -> Any:
    """Translate known identity-bearing JSON fields without touching other data."""
    if isinstance(value, list):
        return [migrate_json(item) for item in value]
    if not isinstance(value, dict):
        return value

    migrated: dict[str, Any] = {}
    for key, item in value.items():
        category = _FIELD_CATEGORIES.get(key)
        if category and isinstance(item, str):
            migrated[key] = translate(category, item)
        elif key == "type" and isinstance(item, str) and item in _MAP["blocks"]:
            migrated[key] = translate("blocks", item)
        else:
            migrated[key] = migrate_json(item)
    return migrated


def migrate_workspace_url(url: str) -> tuple[str, str]:
    """Return an explicit workspace reference and its canonical URL."""
    path, separator, suffix = url.partition("?")
    if not separator:
        path, separator, fragment = path.partition("#")
        suffix = f"#{fragment}" if separator else ""
    else:
        suffix = f"?{suffix}"
    parts = path.strip("/").split("/")
    if len(parts) != 2 or parts[0] not in _MAP["workspaces"]:
        raise UnknownPersistedIdentity(f"Unknown persisted workspace URL: {url!r}")
    reference = translate("workspaces", parts[0])
    mod, workspace = reference.split(":", 1)
    vendor, name = mod.split(".", 1)
    return reference, f"/w/{vendor}/{name}/{workspace}/{parts[1]}{suffix}"

