from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("lims", "0010_entity_tags"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="entity",
            name="source_type",
            field=models.ForeignKey(
                on_delete=models.deletion.CASCADE,
                related_name="+",
                to="contenttypes.contenttype",
            ),
        ),
        migrations.AddField(
            model_name="entity",
            name="source_id",
            field=models.PositiveIntegerField(),
        ),
        migrations.AddField(
            model_name="entity",
            name="source_path",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
