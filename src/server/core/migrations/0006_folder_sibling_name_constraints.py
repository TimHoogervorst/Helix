from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0005_make_folder_project_non_null"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="folder",
            name="uq_one_root_per_project",
        ),
        migrations.AddConstraint(
            model_name="folder",
            constraint=models.UniqueConstraint(
                condition=models.Q(parent__isnull=True),
                fields=("project", "name"),
                name="uq_project_root_folder_name",
            ),
        ),
        migrations.AddConstraint(
            model_name="folder",
            constraint=models.UniqueConstraint(
                condition=models.Q(parent__isnull=False),
                fields=("project", "parent", "name"),
                name="uq_folder_sibling_name",
            ),
        ),
    ]
