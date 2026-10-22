import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("helix_core", "0026_action_invocation_receipts")]

    operations = [
        migrations.AlterField(
            model_name="actionparticipant",
            name="record",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="action_participations",
                to="helix_core.platformrecord",
            ),
        ),
        migrations.AlterField(
            model_name="recordrevisiongroup",
            name="record",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="revision_groups",
                to="helix_core.platformrecord",
            ),
        ),
    ]
