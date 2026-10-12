from django.db import migrations, models


def rename_constraint(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(
        "ALTER INDEX "
        "uq_project_root_folder_name RENAME TO uq_project_top_level_folder_name"
    )


def restore_constraint(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(
        "ALTER INDEX "
        "uq_project_top_level_folder_name RENAME TO uq_project_root_folder_name"
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0007_project_root_cutover"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(rename_constraint, restore_constraint),
            ],
            state_operations=[
                migrations.RemoveConstraint(
                    model_name="folder",
                    name="uq_project_root_folder_name",
                ),
                migrations.AddConstraint(
                    model_name="folder",
                    constraint=models.UniqueConstraint(
                        condition=models.Q(parent__isnull=True),
                        fields=("project", "name"),
                        name="uq_project_top_level_folder_name",
                    ),
                ),
            ],
        ),
    ]
