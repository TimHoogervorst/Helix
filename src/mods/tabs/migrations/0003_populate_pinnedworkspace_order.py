from django.db import migrations


def populate_tab_order(apps, schema_editor):
    PinnedWorkspace = apps.get_model("tabs", "PinnedWorkspace")
    user_ids = PinnedWorkspace.objects.values_list("user_id", flat=True).distinct()
    for user_id in user_ids:
        pins = PinnedWorkspace.objects.filter(user_id=user_id).order_by(
            "-created_at", "-id"
        )
        for position, pin in enumerate(pins):
            PinnedWorkspace.objects.filter(pk=pin.pk).update(order=position)


class Migration(migrations.Migration):
    dependencies = [
        ("tabs", "0002_tabfolder_pinnedworkspace_layout"),
    ]

    operations = [
        migrations.RunPython(populate_tab_order, migrations.RunPython.noop),
    ]
