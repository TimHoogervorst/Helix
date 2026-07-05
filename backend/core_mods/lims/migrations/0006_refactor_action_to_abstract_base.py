# Generated migration — refactor Action to extend AbstractBaseAction.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("lims", "0005_entity_status"),
    ]

    operations = [
        # data → metadata (AbstractBaseAction uses "metadata")
        migrations.RenameField(
            model_name="action",
            old_name="data",
            new_name="metadata",
        ),
        # New columns from AbstractBaseAction
        migrations.AddField(
            model_name="action",
            name="target_type",
            field=models.CharField(
                max_length=100,
                default="",
                help_text="Namespaced target type, e.g. 'eln.entry' or 'lims.entity'.",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="action",
            name="target_id",
            field=models.IntegerField(
                default=0,
                help_text="PK of the target record.",
            ),
            preserve_default=False,
        ),
    ]
