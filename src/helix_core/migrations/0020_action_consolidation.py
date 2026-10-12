from django.db import migrations, models
from django.utils import timezone


def consolidate_legacy_actions(apps, schema_editor):
    ActionLogEntry = apps.get_model("helix_core", "ActionLogEntry")
    ContentVersion = apps.get_model("eln", "ContentVersion")
    legacy_models = (
        ("eln", "ElnAction"),
        ("lims", "Action"),
        ("tags", "TagsAction"),
        ("core_mods_users", "CoreAction"),
        ("access", "AccessAction"),
        ("dropdowns", "DropdownsAction"),
        ("helix_core", "ModLifecycleAction"),
    )
    rows = []
    for label, model_name in legacy_models:
        try:
            model = apps.get_model(label, model_name)
        except LookupError:
            continue
        for row in model.objects.order_by("created_at", "pk").iterator():
            version = (
                ContentVersion.objects.filter(pk=row.version_id)
                .values("version_number", "content_hash")
                .first()
                if getattr(row, "version_id", None)
                else None
            )
            rows.append(
                (
                    row.created_at,
                    row._meta.db_table,
                    row.pk,
                    {
                        "performed_by_id": row.performed_by_id,
                        "action": row.action,
                        "action_type": row.action_type,
                        "target_model_reference": row.target_type,
                        "target_object_id": str(row.target_id),
                        "target_version_reference": (
                            "eln:content-version" if version else None
                        ),
                        "target_version_object_id": (
                            str(row.version_id) if version else None
                        ),
                        "target_version_label": (
                            str(version["version_number"]) if version else None
                        ),
                        "target_version_hash": (
                            version["content_hash"] if version else None
                        ),
                        # Legacy rows do not contain trustworthy initiator data.
                        "initiating_mod_id": "unknown",
                        "initiating_mod_version": "unknown",
                        "request_id": getattr(row, "request_id", None),
                        "client_ip": getattr(row, "client_ip", None),
                        "metadata": row.metadata or {},
                        "created_at": row.created_at,
                    },
                )
            )

    for created_at, legacy_table, legacy_id, defaults in sorted(
        rows, key=lambda item: (item[0], item[1], item[2])
    ):
        ActionLogEntry.objects.update_or_create(
            legacy_table=legacy_table,
            legacy_id=legacy_id,
            defaults=defaults,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0019_platform_owned_actions"),
        ("helix_core", "0019_schema_type_identity"),
    ]

    operations = [
        migrations.AlterField(
            model_name="actionlogentry",
            name="created_at",
            field=models.DateTimeField(default=timezone.now),
        ),
        migrations.AddConstraint(
            model_name="actionlogentry",
            constraint=models.UniqueConstraint(
                fields=["legacy_table", "legacy_id"],
                name="helix_action_legacy_source_uniq",
            ),
        ),
        migrations.RunPython(consolidate_legacy_actions, migrations.RunPython.noop),
    ]
