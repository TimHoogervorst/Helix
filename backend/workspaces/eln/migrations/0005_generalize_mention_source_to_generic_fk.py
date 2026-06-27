# Generated manually.

import django.db.models.deletion
from django.db import migrations, models


def set_source_defaults(apps, schema_editor):
    """Point any existing Mention rows at a valid source_type + source_id."""
    ContentType = apps.get_model("contenttypes", "ContentType")
    Mention = apps.get_model("eln", "Mention")
    try:
        entry_ct = ContentType.objects.get(app_label="eln", model="notebookentry")
    except ContentType.DoesNotExist:
        return
    Mention.objects.update(source_type=entry_ct, source_id=0)


class Migration(migrations.Migration):

    dependencies = [
        ("contenttypes", "0002_remove_content_type_name"),
        ("eln", "0004_add_eln_number"),
    ]

    operations = [
        # 1. Add new generic FK columns (nullable initially)
        migrations.AddField(
            model_name="mention",
            name="source_type",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="mention_sources",
                to="contenttypes.contenttype",
            ),
        ),
        migrations.AddField(
            model_name="mention",
            name="source_id",
            field=models.PositiveIntegerField(null=True),
        ),
        # 2. Populate existing rows with a safe default
        migrations.RunPython(set_source_defaults, migrations.RunPython.noop),
        # 3. Remove the old concrete FK
        migrations.RemoveField(
            model_name="mention",
            name="source_entry",
        ),
        # 4. Make the new columns non-nullable now that all rows have values
        migrations.AlterField(
            model_name="mention",
            name="source_type",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="mention_sources",
                to="contenttypes.contenttype",
            ),
        ),
        migrations.AlterField(
            model_name="mention",
            name="source_id",
            field=models.PositiveIntegerField(),
        ),
    ]
