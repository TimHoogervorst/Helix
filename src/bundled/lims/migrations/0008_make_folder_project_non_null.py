from django.db import migrations, models


def _recreate_constraints(apps, schema_editor):
    if schema_editor.connection.vendor == "sqlite":
        return
    schema_editor.execute("""
        DO $$
        DECLARE
            fk_name text;
        BEGIN
            SELECT conname INTO fk_name
            FROM pg_constraint
            WHERE conrelid = 'lims_entity'::regclass
              AND contype = 'f'
              AND conkey @> ARRAY[
                  (SELECT attnum FROM pg_attribute
                   WHERE attrelid = 'lims_entity'::regclass AND attname = 'folder_id')
              ];
            IF fk_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE lims_entity DROP CONSTRAINT ' || fk_name;
            END IF;
            EXECUTE 'ALTER TABLE lims_entity ADD CONSTRAINT '
                || COALESCE(fk_name, 'lims_entity_folder_id_fk_core_folder')
                || ' FOREIGN KEY (folder_id) REFERENCES core_folder(id)'
                || ' ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED';
        END $$;

        DO $$
        DECLARE
            fk_name text;
        BEGIN
            SELECT conname INTO fk_name
            FROM pg_constraint
            WHERE conrelid = 'lims_entity'::regclass
              AND contype = 'f'
              AND conkey @> ARRAY[
                  (SELECT attnum FROM pg_attribute
                   WHERE attrelid = 'lims_entity'::regclass AND attname = 'project_id')
              ];
            IF fk_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE lims_entity DROP CONSTRAINT ' || fk_name;
            END IF;
            EXECUTE 'ALTER TABLE lims_entity ADD CONSTRAINT '
                || COALESCE(fk_name, 'lims_entity_project_id_fk_core_project')
                || ' FOREIGN KEY (project_id) REFERENCES core_project(id)'
                || ' ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED';
        END $$;

        ALTER TABLE lims_entity ALTER COLUMN folder_id SET NOT NULL;
        ALTER TABLE lims_entity ALTER COLUMN project_id SET NOT NULL;

        DROP VIEW IF EXISTS entity_hub_view;
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
    """)


def _recreate_constraints_reverse(apps, schema_editor):
    if schema_editor.connection.vendor == "sqlite":
        return
    schema_editor.execute("""
        DO $$
        DECLARE
            fk_name text;
        BEGIN
            SELECT conname INTO fk_name
            FROM pg_constraint
            WHERE conrelid = 'lims_entity'::regclass
              AND contype = 'f'
              AND conkey @> ARRAY[
                  (SELECT attnum FROM pg_attribute
                   WHERE attrelid = 'lims_entity'::regclass AND attname = 'folder_id')
              ];
            IF fk_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE lims_entity DROP CONSTRAINT ' || fk_name;
            END IF;
            EXECUTE 'ALTER TABLE lims_entity ADD CONSTRAINT '
                || COALESCE(fk_name, 'lims_entity_folder_id_fk_core_folder')
                || ' FOREIGN KEY (folder_id) REFERENCES core_folder(id)'
                || ' ON DELETE SET_NULL DEFERRABLE INITIALLY DEFERRED';
        END $$;

        DO $$
        DECLARE
            fk_name text;
        BEGIN
            SELECT conname INTO fk_name
            FROM pg_constraint
            WHERE conrelid = 'lims_entity'::regclass
              AND contype = 'f'
              AND conkey @> ARRAY[
                  (SELECT attnum FROM pg_attribute
                   WHERE attrelid = 'lims_entity'::regclass AND attname = 'project_id')
              ];
            IF fk_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE lims_entity DROP CONSTRAINT ' || fk_name;
            END IF;
            EXECUTE 'ALTER TABLE lims_entity ADD CONSTRAINT '
                || COALESCE(fk_name, 'lims_entity_project_id_fk_core_project')
                || ' FOREIGN KEY (project_id) REFERENCES core_project(id)'
                || ' ON DELETE SET_NULL DEFERRABLE INITIALLY DEFERRED';
        END $$;

        ALTER TABLE lims_entity ALTER COLUMN folder_id DROP NOT NULL;
        ALTER TABLE lims_entity ALTER COLUMN project_id DROP NOT NULL;

        DROP VIEW IF EXISTS entity_hub_view;
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
    """)


class Migration(migrations.Migration):

    dependencies = [
        ("lims", "0007_metric_model"),
        ("eln", "0006_make_folder_project_non_null"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    _recreate_constraints,
                    reverse_code=_recreate_constraints_reverse,
                ),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name="entity",
                    name="folder",
                    field=models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="+",
                        to="core.folder",
                    ),
                ),
                migrations.AlterField(
                    model_name="entity",
                    name="project",
                    field=models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="+",
                        to="core.project",
                    ),
                ),
            ],
        ),
    ]
