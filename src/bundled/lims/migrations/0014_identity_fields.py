from django.db import migrations


def migrate_saved_views_and_actions(apps, schema_editor):
    from helix_core.identity_migration import migrate_json, translate

    LimsView = apps.get_model("lims", "LimsView")
    for view in LimsView.objects.all().iterator():
        view.filter_state = migrate_json(view.filter_state)
        view.save(update_fields=["filter_state"])

    Action = apps.get_model("lims", "Action")
    for action in Action.objects.all().iterator():
        action.action = translate("actions", action.action)
        action.target_type = translate("target_types", action.target_type)
        action.metadata = migrate_json(action.metadata)
        action.save(update_fields=["action", "target_type", "metadata"])


class Migration(migrations.Migration):
    dependencies = [("lims", "0013_remove_action_source_entry_remove_entity_folder_and_more")]

    operations = [
        migrations.RunPython(migrate_saved_views_and_actions, migrations.RunPython.noop),
    ]
