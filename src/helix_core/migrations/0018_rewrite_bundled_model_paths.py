"""Update persisted model paths after moving bundled mods."""

from django.db import migrations, models


def rewrite_bundled_model_paths(apps, schema_editor):
    SchemaType = apps.get_model("helix_core", "SchemaType")
    SchemaType.objects.filter(model="mods.lims.models.Entity").update(
        model="bundled.lims.models.Entity"
    )


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0017_entity_hub_source"),
    ]

    operations = [
        migrations.AlterField(
            model_name="schematype",
            name="model",
            field=models.CharField(
                help_text="Dotted Python path to the model class, e.g. 'bundled.lims.models.Entity'.",
                max_length=500,
            ),
        ),
        migrations.RunPython(
            rewrite_bundled_model_paths,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
