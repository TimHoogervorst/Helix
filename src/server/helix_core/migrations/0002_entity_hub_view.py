# Creates the entity_hub_view — a UNION ALL across all AbstractEntity tables.
#
# This VIEW powers GET /api/registry/entities so the Entities Hub can
# list all entities across the system in a single paginated response.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("helix_core", "0001_initial"),
        ("eln", "0002_initial"),
        ("lims", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
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
            reverse_sql="DROP VIEW IF EXISTS entity_hub_view;",
        ),
    ]
