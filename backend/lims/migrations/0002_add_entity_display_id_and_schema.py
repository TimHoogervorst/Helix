# Generated manually.

import django.db.models.deletion
from django.db import migrations, models


def backfill_entitytype_prefixes(apps, schema_editor):
    """Set prefix = name for existing entity types that have null prefix."""
    EntityType = apps.get_model("lims", "EntityType")
    for et in EntityType.objects.filter(prefix__isnull=True):
        et.prefix = et.name.upper()[:20]  # uppercase, max 20
        et.save(update_fields=["prefix"])


def backfill_entity_display_ids(apps, schema_editor):
    """Generate display_id for existing entities.

    Uses barcode as display_id if it exists, otherwise generates
    {prefix}{number} from the entity's type.
    """
    Entity = apps.get_model("lims", "Entity")
    entities = Entity.objects.select_related("entity_type").all()
    for entity in entities:
        if entity.barcode:
            entity.display_id = entity.barcode
        else:
            prefix = entity.entity_type.prefix
            # Find the highest existing number for this prefix
            existing = (
                Entity.objects
                .filter(display_id__startswith=prefix)
                .values_list("display_id", flat=True)
            )
            max_num = 0
            for did in existing:
                if did and did.startswith(prefix):
                    try:
                        num = int(did[len(prefix):])
                        max_num = max(max_num, num)
                    except ValueError:
                        pass
            entity.display_id = f"{prefix}{max_num + 1}"
    Entity.objects.bulk_update(entities, ["display_id"])


class Migration(migrations.Migration):

    dependencies = [
        ("eln", "0005_generalize_mention_source_to_generic_fk"),
        ("core", "0001_initial"),
        ("lims", "0001_initial"),
    ]

    operations = [
        # ── EntityType changes ──

        # 1. Add prefix (nullable first)
        migrations.AddField(
            model_name="entitytype",
            name="prefix",
            field=models.CharField(
                help_text="Uppercase letters, e.g. BLOOD. Used to generate display IDs like BLOOD1.",
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="entitytype",
            name="columns",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Ordered array of column definitions: {name, type, required, default, units, description}.",
            ),
        ),
        migrations.AddField(
            model_name="entitytype",
            name="is_active",
            field=models.BooleanField(
                default=True,
                help_text="Soft-delete flag. Inactive schemas are hidden from dropdowns but preserve existing entities.",
            ),
        ),

        # ── Entity changes ──

        # 2. Add display_id (nullable first)
        migrations.AddField(
            model_name="entity",
            name="display_id",
            field=models.CharField(editable=False, max_length=50, null=True, unique=True),
        ),
        # 3. Add source_entry FK (nullable)
        migrations.AddField(
            model_name="entity",
            name="source_entry",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="lims_entities",
                to="eln.notebookentry",
            ),
        ),

        # 4. Backfill EntityType.prefix from name
        migrations.RunPython(
            code=backfill_entitytype_prefixes,
            reverse_code=migrations.RunPython.noop,
        ),
        # 5. Make prefix unique + non-nullable after backfill
        migrations.AlterField(
            model_name="entitytype",
            name="prefix",
            field=models.CharField(
                help_text="Uppercase letters, e.g. BLOOD. Used to generate display IDs like BLOOD1.",
                max_length=20,
                unique=True,
            ),
        ),

        # 6. Backfill entity display_ids
        migrations.RunPython(
            code=backfill_entity_display_ids,
            reverse_code=migrations.RunPython.noop,
        ),

        # 7. Remove the old barcode field
        migrations.RemoveField(
            model_name="entity",
            name="barcode",
        ),
    ]
