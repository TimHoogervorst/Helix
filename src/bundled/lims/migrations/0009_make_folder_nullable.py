from django.db import migrations, models


def _make_folder_nullable(apps, schema_editor):
    if schema_editor.connection.vendor == "sqlite":
        return
    model = apps.get_model("lims", "Entity")
    old_field = model._meta.get_field("folder")
    new_field = old_field.clone()
    new_field.model = model
    new_field.set_attributes_from_name(old_field.name)
    new_field.remote_field.model = apps.get_model("core", "Folder")
    new_field.null = True
    new_field.blank = True
    schema_editor.alter_field(model, old_field, new_field)


def _make_folder_required(apps, schema_editor):
    if schema_editor.connection.vendor == "sqlite":
        return
    model = apps.get_model("lims", "Entity")
    old_field = model._meta.get_field("folder")
    new_field = old_field.clone()
    new_field.model = model
    new_field.set_attributes_from_name(old_field.name)
    new_field.remote_field.model = apps.get_model("core", "Folder")
    new_field.null = False
    new_field.blank = False
    schema_editor.alter_field(model, old_field, new_field)


class Migration(migrations.Migration):
    dependencies = [
        ("lims", "0008_make_folder_project_non_null"),
        ("eln", "0007_make_folder_nullable"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    _make_folder_nullable,
                    reverse_code=_make_folder_required,
                ),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name="entity",
                    name="folder",
                    field=models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.CASCADE,
                        related_name="+",
                        to="core.folder",
                    ),
                ),
            ],
        ),
    ]
