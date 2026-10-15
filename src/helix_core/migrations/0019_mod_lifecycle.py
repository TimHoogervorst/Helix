import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0018_rewrite_bundled_model_paths"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ModInstallation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("mod_id", models.CharField(max_length=255, unique=True)),
                ("display_name", models.CharField(max_length=255)),
                ("version", models.CharField(max_length=64)),
                ("requires_helix", models.CharField(max_length=255)),
                ("artifacts", models.JSONField(default=list)),
                ("dependencies", models.JSONField(default=list)),
                ("tier", models.CharField(max_length=20)),
                ("locator", models.CharField(blank=True, default="", max_length=500)),
                ("state", models.CharField(choices=[("installed", "Installed"), ("inactive", "Inactive"), ("active", "Active"), ("removed", "Removed")], max_length=20)),
                ("desired_state", models.CharField(choices=[("inactive", "Inactive"), ("active", "Active")], default="inactive", max_length=20)),
                ("manifest", models.JSONField(default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "helix_mod_installation", "ordering": ["mod_id"]},
        ),
    ]
