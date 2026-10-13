from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("lims", "0011_source_fields")]

    operations = [
        migrations.RunSQL(
            sql="DROP VIEW IF EXISTS entity_hub_view;",
            reverse_sql="DROP VIEW IF EXISTS entity_hub_view;",
        ),
        migrations.AddField(
            model_name="entity",
            name="source_entry",
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.RunSQL(
            sql="DROP VIEW IF EXISTS entity_hub_view;",
            reverse_sql="DROP VIEW IF EXISTS entity_hub_view;",
        ),
    ]
