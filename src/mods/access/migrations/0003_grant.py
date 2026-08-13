# Generated manually for Grant model

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("access", "0002_team"),
        ("core", "0005_make_folder_project_non_null"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Grant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "role",
                    models.CharField(
                        choices=[("read", "Read"), ("edit", "Edit")],
                        max_length=10,
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="grants",
                        to="core.project",
                    ),
                ),
                (
                    "team",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="grants",
                        to="access.team",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="grants",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "access_grant",
            },
        ),
        migrations.AddConstraint(
            model_name="grant",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(("team__isnull", True), ("user__isnull", False)),
                    models.Q(("team__isnull", False), ("user__isnull", True)),
                    _connector="OR",
                ),
                name="chk_grant_exactly_one_grantee",
            ),
        ),
        migrations.AddConstraint(
            model_name="grant",
            constraint=models.UniqueConstraint(
                fields=["project", "user"],
                condition=models.Q(("user__isnull", False)),
                name="uq_grant_project_user",
            ),
        ),
        migrations.AddConstraint(
            model_name="grant",
            constraint=models.UniqueConstraint(
                fields=["project", "team"],
                condition=models.Q(("team__isnull", False)),
                name="uq_grant_project_team",
            ),
        ),
    ]
