"""Create RegisteredEntityType and backfill from existing EntityType rows.

ADR-0006: RegisteredEntityType is the central registry that maps every
display-ID prefix to its owning workspace and content type.  The migration
backfills existing LIMS EntityType rows (workspace ``"lims"``) and adds a
registration for ELN notebook entries (workspace ``"eln"``, prefix ``"E"``).
"""

import django.db.models.deletion
from django.db import migrations, models


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
        ("contenttypes", "0002_remove_content_type_name"),
        ("eln", "0015_delete_mention"),
        ("lims", "0007_alter_action_action_type_alter_action_performed_by"),
    ]

    operations = [
        migrations.CreateModel(
            name="RegisteredEntityType",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "prefix",
                    models.CharField(
                        help_text=(
                            "Uppercase letters extracted from display IDs, "
                            "e.g. 'E', 'DNA'. Must be unique across all entity types."
                        ),
                        max_length=20,
                        unique=True,
                    ),
                ),
                (
                    "workspace_id",
                    models.CharField(
                        help_text=(
                            "The workspace that owns this entity type. "
                            "Used as the URL namespace: /{workspaceId}/{displayId}."
                        ),
                        max_length=100,
                    ),
                ),
                (
                    "display_name",
                    models.CharField(
                        help_text=(
                            "Human-readable name shown in search results, "
                            "e.g. 'Entry', 'DNA Sequence'."
                        ),
                        max_length=255,
                    ),
                ),
                (
                    "content_type",
                    models.ForeignKey(
                        help_text="The Django model that backs entities with this prefix.",
                        on_delete=django.db.models.deletion.CASCADE,
                        to="contenttypes.ContentType",
                    ),
                ),
            ],
            options={
                "db_table": "lims_registered_entity_type",
                "ordering": ["prefix"],
            },
        ),
        migrations.RunPython(
            backfill_registered_entity_types,
            migrations.RunPython.noop,
        ),
    ]
