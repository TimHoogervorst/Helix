import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("access", "0003_grant"),
        ("core", "0005_make_folder_project_non_null"),
    ]

    operations = [
        migrations.CreateModel(
            name="FolderShare",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "level",
                    models.CharField(
                        choices=[("read", "Read"), ("read_write", "Read + Write")],
                        max_length=15,
                    ),
                ),
                (
                    "source_folder",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="outgoing_shares",
                        to="core.folder",
                    ),
                ),
                (
                    "target_project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="incoming_shares",
                        to="core.project",
                    ),
                ),
            ],
            options={
                "db_table": "access_folder_share",
            },
        ),
        migrations.AddConstraint(
            model_name="foldershare",
            constraint=models.UniqueConstraint(
                fields=["source_folder", "target_project"],
                name="uq_folder_share_source_target",
            ),
        ),
    ]
