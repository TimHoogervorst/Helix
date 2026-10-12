from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0018_rewrite_bundled_model_paths"),
        ("helix_core", "0019_mod_lifecycle"),
        ("eln", "0009_remove_notebookentry_folder"),
        ("lims", "0013_remove_action_source_entry_remove_entity_folder_and_more"),
        ("tags", "0003_alter_tagsaction_action_alter_tagsaction_action_type"),
        ("core_mods_users", "0005_alter_coreaction_action_alter_coreaction_action_type"),
        ("access", "0005_access_action"),
    ]

    operations = [
        migrations.CreateModel(
            name="ActionDefinition",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("identity", models.CharField(max_length=255, unique=True)),
                ("label", models.CharField(max_length=255)),
                ("core_action", models.CharField(max_length=16)),
                ("target_model_reference", models.CharField(max_length=255)),
                ("provider_mod_id", models.CharField(max_length=255)),
                ("provider_mod_version", models.CharField(max_length=64)),
            ],
            options={"db_table": "helix_action_definition", "ordering": ["identity"]},
        ),
        migrations.CreateModel(
            name="ActionLogEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("action", models.CharField(max_length=255)),
                ("action_type", models.CharField(max_length=16)),
                ("target_model_reference", models.CharField(max_length=255)),
                ("target_object_id", models.CharField(max_length=255)),
                ("target_version_reference", models.CharField(blank=True, max_length=255, null=True)),
                ("target_version_object_id", models.CharField(blank=True, max_length=255, null=True)),
                ("target_version_label", models.CharField(blank=True, max_length=255, null=True)),
                ("target_version_hash", models.CharField(blank=True, max_length=128, null=True)),
                ("initiating_mod_id", models.CharField(default="unknown", max_length=255)),
                ("initiating_mod_version", models.CharField(default="unknown", max_length=64)),
                ("request_id", models.UUIDField(blank=True, null=True)),
                ("client_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("legacy_table", models.CharField(blank=True, max_length=255, null=True)),
                ("legacy_id", models.PositiveBigIntegerField(blank=True, null=True)),
                ("performed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="action_log_entries", to="core.user")),
            ],
            options={"db_table": "helix_action_log_entry", "ordering": ["-created_at", "-id"]},
        ),
        migrations.AddIndex(model_name="actionlogentry", index=models.Index(fields=["target_model_reference", "target_object_id"], name="helix_action_target_75f3c0_idx")),
        migrations.AddIndex(model_name="actionlogentry", index=models.Index(fields=["action", "created_at"], name="helix_action_action_0d1d0d_idx")),
        migrations.AddIndex(model_name="actionlogentry", index=models.Index(fields=["initiating_mod_id", "created_at"], name="helix_action_initia_4b48a1_idx")),
    ]
