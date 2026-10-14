"""Remove the legacy hard-coded Entity Hub database view."""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("helix_core", "0017_entity_hub_source")]

    operations = [
        migrations.RunSQL(
            sql="DROP VIEW IF EXISTS entity_hub_view;",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
