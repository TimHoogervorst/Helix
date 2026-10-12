"""Add capability tags to schema types and seed table eligibility."""

from django.db import migrations, models


def seed_schema_type_tags(apps, schema_editor):
    SchemaType = apps.get_model("helix_core", "SchemaType")

    SchemaType.objects.filter(model="mods.lims.models.Entity").update(
        tags=["RegistrationTable"]
    )
    SchemaType.objects.filter(model="mods.eln.models.NotebookEntry").update(
        tags=[]
    )


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0010_rebalance_color_variants"),
    ]

    operations = [
        migrations.AddField(
            model_name="schematype",
            name="tags",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="Capability tags declared by the owning mod.",
            ),
        ),
        migrations.RunPython(
            seed_schema_type_tags,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
