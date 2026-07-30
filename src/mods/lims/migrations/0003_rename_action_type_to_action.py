# Generated manually — rename action_type → action, add new action_type.

from django.db import migrations, models


def backfill_action_type(apps, schema_editor):
    """Extract core CRUD verb from the action column's last segment."""
    Action = apps.get_model("lims", "Action")
    CORE_VERBS = {"created", "edited", "deleted"}
    for row in Action.objects.all():
        action = getattr(row, "action", "") or ""
        verb = action.rsplit(".", 1)[-1]
        row.action_type = verb if verb in CORE_VERBS else "edited"
        row.save(update_fields=["action_type"])


class Migration(migrations.Migration):
    dependencies = [
        ("lims", "0002_lims_view"),
    ]

    operations = [
        migrations.RenameField(
            model_name="action",
            old_name="action_type",
            new_name="action",
        ),
        migrations.AddField(
            model_name="action",
            name="action_type",
            field=models.CharField(
                max_length=16,
                default="edited",
                help_text="Core CRUD verb: 'created', 'edited', or 'deleted'.",
            ),
            preserve_default=True,
        ),
        migrations.RunPython(
            backfill_action_type,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
