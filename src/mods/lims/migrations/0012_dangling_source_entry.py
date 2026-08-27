from django.db import migrations, models


VIEW_SQL = """
    CREATE VIEW entity_hub_view AS
    SELECT
        e.id,
        e.name,
        e.display_id,
        e.author_id,
        e.last_editor_id,
        e.status,
        e.folder_id,
        e.project_id,
        e.schema_id,
        e.properties,
        e.source_path,
        e.created_at,
        e.updated_at,
        CASE st.workspace_id
            WHEN 'eln' THEN 'eln.notebookentry'
            WHEN 'lims' THEN 'lims.entity'
            WHEN 'results' THEN 'lims.result'
            ELSE st.workspace_id
        END AS schema_type_id,
        st.workspace_id
    FROM eln_entry e
    LEFT JOIN helix_schema s ON s.id = e.schema_id
    LEFT JOIN helix_schema_type st ON st.id = s.schema_type_id
    UNION ALL
    SELECT
        e.id,
        e.name,
        e.display_id,
        e.author_id,
        e.last_editor_id,
        e.status,
        e.folder_id,
        e.project_id,
        e.schema_id,
        e.properties,
        e.source_path,
        e.created_at,
        e.updated_at,
        CASE st.workspace_id
            WHEN 'eln' THEN 'eln.notebookentry'
            WHEN 'lims' THEN 'lims.entity'
            WHEN 'results' THEN 'lims.result'
            ELSE st.workspace_id
        END AS schema_type_id,
        st.workspace_id
    FROM lims_entity e
    LEFT JOIN helix_schema s ON s.id = e.schema_id
    LEFT JOIN helix_schema_type st ON st.id = s.schema_type_id;
"""


class Migration(migrations.Migration):
    dependencies = [("lims", "0011_source_fields")]

    operations = [
        migrations.RunSQL(
            sql="DROP VIEW IF EXISTS entity_hub_view;",
            reverse_sql=VIEW_SQL,
        ),
        migrations.AlterField(
            model_name="entity",
            name="source_entry",
            field=models.ForeignKey(
                blank=True,
                db_constraint=False,
                null=True,
                on_delete=models.DO_NOTHING,
                related_name="lims_entities",
                to="eln.notebookentry",
            ),
        ),
        migrations.RunSQL(
            sql=VIEW_SQL,
            reverse_sql="DROP VIEW IF EXISTS entity_hub_view;",
        ),
    ]
