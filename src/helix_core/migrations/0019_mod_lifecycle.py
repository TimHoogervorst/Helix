import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0018_rewrite_bundled_model_paths"),
        ("eln", "0006_make_folder_project_non_null"),
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
        migrations.CreateModel(
            name="ModLifecycleAction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(help_text="Triple-dotted action identifier, e.g. 'eln.entry.created'.", max_length=128)),
                ("action_type", models.CharField(help_text="Core CRUD verb: 'created', 'edited', or 'deleted'.", max_length=16)),
                ("target_type", models.CharField(help_text="Namespaced target type, e.g. 'eln.entry' or 'lims.entity'.", max_length=100)),
                ("target_id", models.IntegerField(help_text="PK of the target record.")),
                ("request_id", models.UUIDField(blank=True, help_text="Correlation ID tying together action rows from the same HTTP request.", null=True)),
                ("client_ip", models.GenericIPAddressField(blank=True, help_text="Client IP auto-captured from the request.", null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("performed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="%(class)s_actions", to=settings.AUTH_USER_MODEL)),
                ("version", models.ForeignKey(blank=True, help_text="Content version produced by this action. Null for non-versioned targets.", null=True, on_delete=django.db.models.deletion.SET_NULL, to="eln.contentversion")),
            ],
            options={"db_table": "helix_mod_lifecycle_action"},
        ),
    ]
