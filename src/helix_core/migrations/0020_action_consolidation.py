from django.db import migrations, models
from django.utils import timezone


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0019_platform_owned_actions"),
        ("helix_core", "0019_schema_type_identity"),
    ]

    operations = [
        migrations.AlterField(
            model_name="actionlogentry",
            name="created_at",
            field=models.DateTimeField(default=timezone.now),
        ),
        migrations.AddConstraint(
            model_name="actionlogentry",
            constraint=models.UniqueConstraint(
                fields=["legacy_table", "legacy_id"],
                name="helix_action_legacy_source_uniq",
            ),
        ),
    ]
