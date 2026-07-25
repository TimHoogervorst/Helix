"""Rewrite column type IDs from capitalized to lowercase.

One-time data migration that updates the ``type`` key inside the ``columns``
JSON field on every ``SchemaType`` and ``Schema`` row.  The mapping follows
the column type registry convention established in ADR-0010:

    Text      → text
    Number    → number
    Date      → date
    Boolean   → boolean
    Reference → reference

A reverse migration is provided so ``./manage.py migrate helix_core <previous>``
restores the original capitalized values.
"""

from django.db import migrations

TYPE_MAP = {
    "Text": "text",
    "Number": "number",
    "Date": "date",
    "Boolean": "boolean",
    "Reference": "reference",
}

REVERSE_MAP = {v: k for k, v in TYPE_MAP.items()}


def _migrate_columns(apps, type_map):
    """Rewrite ``type`` values inside every ``columns`` JSON array.

    Only touches rows whose columns contain a ``type`` key that matches one of
    the keys in *type_map*.  Rows with no columns or unrecognised types are
    left unchanged.
    """
    SchemaType = apps.get_model("helix_core", "SchemaType")
    Schema = apps.get_model("helix_core", "Schema")

    for model in (SchemaType, Schema):
        for row in model.objects.all():
            columns = row.columns
            if not columns:
                continue
            changed = False
            for col in columns:
                if isinstance(col, dict):
                    current = col.get("type")
                    if current in type_map:
                        col["type"] = type_map[current]
                        changed = True
            if changed:
                row.columns = columns
                row.save()


def lowercase_column_types(apps, schema_editor):
    """Apply the migration: capitalize → lowercase."""
    _migrate_columns(apps, TYPE_MAP)


def reverse_lowercase(apps, schema_editor):
    """Reverse the migration: lowercase → capitalize."""
    _migrate_columns(apps, REVERSE_MAP)


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0004_fix_entity_hub_view_schema_type"),
    ]

    operations = [
        migrations.RunPython(lowercase_column_types, reverse_lowercase),
    ]
