"""Backfill RegisteredEntityType rows for existing EntityTypes and ELN entries.

ADR-0006: RegisteredEntityType is the central registry that maps every
display-ID prefix to its owning workspace and content type.  The migration
backfills existing LIMS EntityType rows (workspace ``"lims"``) and adds a
registration for ELN notebook entries (workspace ``"eln"``, prefix ``"E"``).
"""

from django.db import migrations


def backfill_registered_entity_types(apps, schema_editor):
    """Create a RegisteredEntityType for every existing EntityType + ELN entries.

    Uses ``get_or_create`` for ContentType rows because they may not exist
    yet during ``RunPython`` (Django creates them in ``post_migrate``).
    """
    ContentType = apps.get_model("contenttypes", "ContentType")
    RegisteredEntityType = apps.get_model("lims", "RegisteredEntityType")
    EntityType = apps.get_model("lims", "EntityType")

    # 1. Backfill LIMS entity types — each existing EntityType gets a row
    #    with workspace "lims".
    entity_ct, _ = ContentType.objects.get_or_create(
        app_label="lims",
        model="entity",
    )

    for et in EntityType.objects.all():
        RegisteredEntityType.objects.get_or_create(
            prefix=et.prefix,
            defaults={
                "content_type": entity_ct,
                "workspace_id": "lims",
                "display_name": et.name,
            },
        )

    # 2. Register ELN notebook entries with prefix "E".
    entry_ct, _ = ContentType.objects.get_or_create(
        app_label="eln",
        model="notebookentry",
    )

    RegisteredEntityType.objects.get_or_create(
        prefix="E",
        defaults={
            "content_type": entry_ct,
            "workspace_id": "eln",
            "display_name": "Entry",
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ("lims", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            backfill_registered_entity_types,
            migrations.RunPython.noop,
        ),
    ]
