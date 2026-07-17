"""Backfill column UUIDs and content_hash for existing EntityTypes.

Issue #252: Each column receives a stable UUID ``id``, and the
``content_hash`` field is computed from column definitions on every save.
This migration backfills both for existing rows.
"""

import hashlib
import json
import uuid

from django.db import migrations

_HASH_FIELDS = ("id", "name", "type", "required", "default", "units")


def _ensure_column_ids(columns):
    """Assign a UUID to each column that doesn't already have an id."""
    for col in columns:
        if not col.get("id"):
            col["id"] = str(uuid.uuid4())
    return columns


def _compute_content_hash(columns):
    """SHA-256 of the canonicalised column definitions."""
    hash_data = [
        {f: col.get(f, "" if f != "required" else False) for f in _HASH_FIELDS}
        for col in (columns or [])
    ]
    canonical = json.dumps(hash_data, sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def backfill_column_ids_and_hash(apps, schema_editor):
    """Backfill every existing EntityType with column ids and content_hash."""
    EntityType = apps.get_model("lims", "EntityType")

    for et in EntityType.objects.all():
        columns = et.columns or []
        if columns:
            _ensure_column_ids(columns)
            et.columns = columns
        et.content_hash = _compute_content_hash(columns)
        et.save(update_fields=["columns", "content_hash"])


class Migration(migrations.Migration):

    dependencies = [
        ("lims", "0003_add_content_hash"),
    ]

    operations = [
        migrations.RunPython(
            backfill_column_ids_and_hash,
            migrations.RunPython.noop,
        ),
    ]
