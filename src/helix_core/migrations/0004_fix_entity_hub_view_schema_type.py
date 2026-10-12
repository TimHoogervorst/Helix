# Fix schema_type_id in entity_hub_view to match SchemaType convention.
#
# The original VIEW used 'eln.entry' but the SchemaType serializer derives
# 'eln.notebookentry' from the model path (mods.eln.models.NotebookEntry).
# This mismatch caused the "All ELN Entry" schema_type filter to return
# zero results on the Entities Hub.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("helix_core", "0003_entityhubview"),
        ("eln", "0002_initial"),
        ("lims", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                DROP VIEW IF EXISTS entity_hub_view;
                CREATE VIEW entity_hub_view AS
                SELECT
                    id,
                    name,
                    display_id,
                    author_id,
                    last_editor_id,
                    status,
                    folder_id,
                    project_id,
                    schema_id,
                    properties,
                    created_at,
                    updated_at,
                    'eln.notebookentry' AS schema_type_id,
                    'eln' AS workspace_id
                FROM eln_entry
                UNION ALL
                SELECT
                    id,
                    name,
                    display_id,
                    author_id,
                    last_editor_id,
                    status,
                    folder_id,
                    project_id,
                    schema_id,
                    properties,
                    created_at,
                    updated_at,
                    'lims.entity' AS schema_type_id,
                    'lims' AS workspace_id
                FROM lims_entity;
            """,
            reverse_sql="""
                DROP VIEW IF EXISTS entity_hub_view;
                CREATE VIEW entity_hub_view AS
                SELECT
                    id,
                    name,
                    display_id,
                    author_id,
                    last_editor_id,
                    status,
                    folder_id,
                    project_id,
                    schema_id,
                    properties,
                    created_at,
                    updated_at,
                    'eln.entry' AS schema_type_id,
                    'eln' AS workspace_id
                FROM eln_entry
                UNION ALL
                SELECT
                    id,
                    name,
                    display_id,
                    author_id,
                    last_editor_id,
                    status,
                    folder_id,
                    project_id,
                    schema_id,
                    properties,
                    created_at,
                    updated_at,
                    'lims.entity' AS schema_type_id,
                    'lims' AS workspace_id
                FROM lims_entity;
            """,
        ),
    ]
