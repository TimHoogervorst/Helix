from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("tabs", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="TabFolder",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=255)),
                ("order", models.PositiveIntegerField(default=0)),
                ("expanded", models.BooleanField(default=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="tab_folders",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "core_tab_folder",
                "ordering": ["order", "id"],
            },
        ),
        migrations.AddField(
            model_name="pinnedworkspace",
            name="order",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="pinnedworkspace",
            name="folder",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="tabs",
                to="tabs.tabfolder",
            ),
        ),
        migrations.AlterModelOptions(
            name="pinnedworkspace",
            options={"db_table": "core_pinned_workspace", "ordering": ["order", "id"]},
        ),
    ]
