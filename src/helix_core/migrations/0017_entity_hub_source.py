"""Entity hub views are assembled from registered source kinds at runtime."""
from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [("helix_core", "0016_entity_hub_source_path")]
    operations = []
