from django.db import migrations, models


def _recreate_constraints(apps, schema_editor):
    # The state operations below are portable; no optional provider
    # tables or views are touched by this historical migration.
    return


def _recreate_constraints_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("lims", "0007_metric_model"),
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
