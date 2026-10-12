from django.db import migrations, models


def populate_schema_type_identity(apps, schema_editor):
    from helix_core.identity_migration import translate

    SchemaType = apps.get_model("helix_core", "SchemaType")
    for schema_type in SchemaType.objects.all().iterator():
        schema_type.identity = translate("models", schema_type.model)
        schema_type.save(update_fields=["identity"])

    Schema = apps.get_model("helix_core", "Schema")
    for schema in Schema.objects.all().iterator():
        schema.enabled_components = [
            translate("entity_tabs", component)
            for component in (schema.enabled_components or [])
        ]
        schema.save(update_fields=["enabled_components"])


class Migration(migrations.Migration):
    dependencies = [("helix_core", "0018_rewrite_bundled_model_paths")]

    operations = [
        migrations.AddField(
            model_name="schematype",
            name="identity",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Canonical Schema Type reference, e.g. 'helix.lims:entity'.",
                max_length=150,
            ),
        ),
        migrations.RunPython(populate_schema_type_identity, migrations.RunPython.noop),
    ]
