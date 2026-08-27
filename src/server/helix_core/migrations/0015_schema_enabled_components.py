"""Add per-schema frontend component settings."""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0014_result_schema_hazard_color"),
    ]

    operations = [
        migrations.AddField(
            model_name="schema",
            name="enabled_components",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="IDs of enabled frontend Schema Components.",
            ),
        ),
    ]
