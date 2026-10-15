from django.db import migrations


class Migration(migrations.Migration):
    """Join the discovery and capability migration branches."""

    dependencies = [
        ("helix_core", "0018_remove_entity_hub_view"),
        ("helix_core", "0021_schema_type_capabilities"),
    ]

    operations = []
