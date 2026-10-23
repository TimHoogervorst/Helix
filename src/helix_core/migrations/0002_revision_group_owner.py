from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("helix_core", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="recordrevisiongroup",
            name="owner_mod_id",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
