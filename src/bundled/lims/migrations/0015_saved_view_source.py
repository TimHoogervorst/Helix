from django.db import migrations, models


def copy_legacy_filter_state(apps, schema_editor):
    LimsView = apps.get_model("lims", "LimsView")
    for view in LimsView.objects.all().iterator():
        state = view.filter_state if isinstance(view.filter_state, dict) else {}
        view.spec = {
            "filter": {
                key: state[key]
                for key in ("search", "schema_type", "schema", "status", "fields")
                if key in state
            },
            "sort": ([{"field": state["sort"]}] if state.get("sort") else []),
            "columns": state.get("columns", []),
        }
        view.save(update_fields=["spec"])


class Migration(migrations.Migration):
    dependencies = [("lims", "0014_identity_fields")]

    operations = [
        migrations.AddField(
            model_name="limsview",
            name="source_kind",
            field=models.CharField(
                default="entity",
                help_text="Registry content-source kind, not a model or mod identifier.",
                max_length=255,
            ),
        ),
        migrations.AddField(
            model_name="limsview",
            name="spec",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Portable filter, sort, and column specification for the source.",
            ),
        ),
        migrations.RunPython(copy_legacy_filter_state, migrations.RunPython.noop),
    ]
