"""Add the Result icon and the hazard colour to the standard libraries."""

from django.db import migrations


def seed_standard_library_entries(apps, schema_editor):
    IconLibraryEntry = apps.get_model("helix_core", "IconLibraryEntry")
    ColorToken = apps.get_model("helix_core", "ColorToken")

    IconLibraryEntry.objects.get_or_create(
        key="chart-column",
        defaults={
            "label": "Chart Column",
            "kind": "lucide",
            "token": "chart-column",
            "svg": "",
        },
    )
    ColorToken.objects.get_or_create(
        key="hazard",
        defaults={
            "label": "Hazard",
            "hex": "#E6B3B3",
            "hex_dark": "#E16E6E",
            "hex_light": "#E6B3B3",
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0012_entity_hub_schema_type"),
    ]

    operations = [
        migrations.RunPython(
            seed_standard_library_entries,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
