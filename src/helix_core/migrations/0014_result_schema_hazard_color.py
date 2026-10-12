"""Use the hazard colour for all existing Result schemas."""

from django.db import migrations


def backfill_result_schema_colors(apps, schema_editor):
    Schema = apps.get_model("helix_core", "Schema")
    Schema.objects.filter(schema_type__workspace_id="results").update(color="hazard")


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0013_result_icon_and_hazard_color"),
    ]

    operations = [
        migrations.RunPython(
            backfill_result_schema_colors,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
