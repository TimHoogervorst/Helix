from django.db import migrations


def collapse_hidden_roots(apps, schema_editor):
    Folder = apps.get_model("core", "Folder")
    Entity = apps.get_model("lims", "Entity")

    for root in Folder.objects.filter(parent__isnull=True, name="root").iterator():
        Folder.objects.filter(parent_id=root.pk).update(parent_id=None)
        Entity.objects.filter(folder_id=root.pk).update(
            folder_id=None,
            project_id=root.project_id,
        )
        root.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_folder_sibling_name_constraints"),
        ("lims", "0009_make_folder_nullable"),
    ]

    operations = [
        migrations.RunPython(
            collapse_hidden_roots,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
