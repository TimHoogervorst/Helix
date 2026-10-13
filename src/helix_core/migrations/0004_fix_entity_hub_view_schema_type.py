# Fix schema_type_id in entity_hub_view to match SchemaType convention.
#
# The entity hub is assembled from registered source kinds at runtime.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("helix_core", "0003_entityhubview"),
    ]

    operations = []
