from django.db import migrations, models


def mark_existing_history_unverified(apps, schema_editor):
    # Existing targets predate durable, complete attribution coverage. Do not
    # infer completeness from a snapshot or the currently retained editor.
    ReviewTarget = apps.get_model("helix_core", "ReviewTarget")
    ReviewTarget.objects.all().update(contributor_history_complete=False)


class Migration(migrations.Migration):
    dependencies = [("helix_core", "0009_review_suggestion")]

    operations = [
        migrations.RunPython(mark_existing_history_unverified, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="reviewtarget",
            name="contributor_history_complete",
            field=models.BooleanField(default=False),
        ),
    ]
