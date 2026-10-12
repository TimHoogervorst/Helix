from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0008_rename_top_level_folder_constraint"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="folder",
            name="source_type",
            field=models.ForeignKey(
                on_delete=models.deletion.CASCADE,
                related_name="+",
                to="contenttypes.contenttype",
            ),
        ),
        migrations.AddField(
            model_name="folder",
            name="source_id",
            field=models.PositiveIntegerField(),
        ),
        migrations.AddField(
            model_name="folder",
            name="source_path",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
