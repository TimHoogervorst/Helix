"""Derive Entity Hub type identity from each row's SchemaType."""

from django.db import migrations


VIEW_SQL = """
    DROP VIEW IF EXISTS entity_hub_view;
    CREATE VIEW entity_hub_view AS
    SELECT
        e.id,
        e.name,
        e.display_id,
        e.author_id,
        e.last_editor_id,
        e.status,
        e.project_id,
        e.schema_id,
        e.properties,
        e.source_type_id,
        e.source_id,
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
        e.project_id,
        e.schema_id,
        e.properties,
        e.source_type_id,
        e.source_id,
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
    dependencies = [
        ("helix_core", "0011_schema_type_tags"),
        ("eln", "0002_initial"),
        ("lims", "0009_make_folder_nullable"),
    ]

    operations = [
        migrations.RunSQL(sql=VIEW_SQL, reverse_sql=VIEW_SQL),
    ]
