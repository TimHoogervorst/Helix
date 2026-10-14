from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("eln", "0007_make_folder_nullable"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunSQL(
            sql="DROP VIEW IF EXISTS entity_hub_view;",
            # The view was removed by the generic Entities Hub migration;
            # there is no ELN-owned view to restore when reversing this step.
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.AddField(
            model_name="notebookentry",
            name="source_type",
            field=models.ForeignKey(
                on_delete=models.deletion.CASCADE,
                related_name="+",
                to="contenttypes.contenttype",
            ),
        ),
        migrations.AddField(
            model_name="notebookentry",
            name="source_id",
            field=models.PositiveIntegerField(),
        ),
        migrations.AddField(
            model_name="notebookentry",
            name="source_path",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
