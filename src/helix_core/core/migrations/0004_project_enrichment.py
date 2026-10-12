import uuid

from django.db import migrations, models


def populate_project_uids(apps, schema_editor):
    Project = apps.get_model("core", "Project")
    for project in Project.objects.all():
        if not project.uid:
            project.uid = uuid.uuid4()
            project.save(update_fields=["uid"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_project"),
    ]

    operations = [
        # ── Project enrichments ────────────────────────────────────────────
        migrations.AddField(
            model_name="project",
            name="uid",
            field=models.UUIDField(null=True, unique=False),
        ),
        migrations.RunPython(
            populate_project_uids,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name="project",
            name="uid",
            field=models.UUIDField(default=uuid.uuid4, unique=True, editable=False),
        ),
        migrations.AddField(
            model_name="project",
            name="icon_key",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="project",
            name="color_key",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="project",
            name="is_archived",
            field=models.BooleanField(default=False),
        ),
        # ── Folder: add project FK ─────────────────────────────────────────
        migrations.AddField(
            model_name="folder",
            name="project",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="folders",
                to="core.project",
            ),
        ),
        migrations.AddConstraint(
            model_name="folder",
            constraint=models.UniqueConstraint(
                fields=["project"],
                condition=models.Q(parent__isnull=True),
                name="uq_one_root_per_project",
            ),
        ),
    ]
