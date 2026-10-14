from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("helix_core", "0020_action_consolidation")]

    operations = [
        migrations.RenameField(
            model_name="schematype",
            old_name="tags",
            new_name="capabilities",
        ),
        migrations.AlterField(
            model_name="schematype",
            name="capabilities",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Capabilities declared by the owning mod.",
            ),
        ),
    ]
