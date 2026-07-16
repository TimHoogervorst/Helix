# Generated manually — removes Tag from ELN state, adds M2M on NotebookEntry side.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("eln", "0011_remove_mention_context_elnaction"),
        ("tags", "0001_initial"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                # Remove Tag from ELN's state — the model lives in core_mods.tags now.
                migrations.DeleteModel(name="Tag"),
                # Add the M2M on the consumer side (NotebookEntry), reusing the
                # existing through table so existing tag assignments are preserved.
                migrations.AddField(
                    model_name="notebookentry",
                    name="tags",
                    field=models.ManyToManyField(
                        "tags.Tag",
                        related_name="+",
                        db_table="eln_tag_entries",
                    ),
                ),
            ],
            database_operations=[
                # No DB changes — the through table already exists from when
                # Tag.entries was the M2M owner.  The columns are identical
                # (tag_id, notebookentry_id); only the model declaring the
                # relationship changes.
            ],
        ),
    ]
