from django.db import migrations, models


def populate_workspace_identity(apps, schema_editor):
    from helix_core.identity_migration import migrate_workspace_url

    PinnedWorkspace = apps.get_model("tabs", "PinnedWorkspace")
    for pinned in PinnedWorkspace.objects.all().iterator():
        reference, url = migrate_workspace_url(pinned.url)
        pinned.workspace_reference = reference
        pinned.url = url
        pinned.save(update_fields=["workspace_reference", "url"])


class Migration(migrations.Migration):
    dependencies = [("tabs", "0003_populate_pinnedworkspace_order")]

    operations = [
        migrations.AddField(
            model_name="pinnedworkspace",
            name="workspace_reference",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Canonical Workspace reference used independently of the URL.",
                max_length=150,
            ),
        ),
        migrations.RunPython(populate_workspace_identity, migrations.RunPython.noop),
    ]
