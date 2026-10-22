from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("eln", "0010_identity_fields"),
        ("helix_core", "0029_platformattachment_attachmentrevisionlink_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="notebookentry",
            name="platform_record",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="eln_entry",
                to="helix_core.platformrecord",
            ),
        ),
    ]
