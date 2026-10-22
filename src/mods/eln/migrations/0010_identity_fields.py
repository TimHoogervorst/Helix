from django.db import migrations


def migrate_documents_and_actions(apps, schema_editor):
    from mods.eln.identity_migration_support import migrate_json, translate

    NotebookEntry = apps.get_model("eln", "NotebookEntry")
    for entry in NotebookEntry.objects.all().iterator():
        entry.content = migrate_json(entry.content)
        entry.save(update_fields=["content"])

    ContentVersion = apps.get_model("eln", "ContentVersion")
    for version in ContentVersion.objects.all().iterator():
        version.content = migrate_json(version.content)
        version.save(update_fields=["content"])

    Action = apps.get_model("eln", "ElnAction")
    for action in Action.objects.all().iterator():
        action.action = translate("actions", action.action)
        action.target_type = translate("target_types", action.target_type)
        action.metadata = migrate_json(action.metadata)
        action.save(update_fields=["action", "target_type", "metadata"])


class Migration(migrations.Migration):
    dependencies = [("eln", "0009_remove_notebookentry_folder")]

    operations = [
        migrations.RunPython(migrate_documents_and_actions, migrations.RunPython.noop),
    ]
