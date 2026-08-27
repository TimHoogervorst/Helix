from django.db import migrations, models


VIEW_SQL = """
    CREATE VIEW entity_hub_view AS
    SELECT
        id, name, display_id, author_id, last_editor_id, status,
        folder_id, project_id, schema_id, properties, created_at, updated_at,
        'eln.notebookentry' AS schema_type_id,
        'eln' AS workspace_id
    FROM eln_entry
    UNION ALL
    SELECT
        id, name, display_id, author_id, last_editor_id, status,
        folder_id, project_id, schema_id, properties, created_at, updated_at,
        'lims.entity' AS schema_type_id,
        'lims' AS workspace_id
    FROM lims_entity;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("eln", "0007_make_folder_nullable"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.RunSQL(
            sql="DROP VIEW IF EXISTS entity_hub_view;",
            reverse_sql=VIEW_SQL,
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
        migrations.RunSQL(
            sql=VIEW_SQL,
            reverse_sql="DROP VIEW IF EXISTS entity_hub_view;",
        ),
    ]
