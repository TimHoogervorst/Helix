import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0002_revision_group_owner"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PlatformDiscussion",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("origin_id", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("created_by_snapshot", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("resolved_by_snapshot", models.JSONField(blank=True, default=dict)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="platform_discussions_opened", to=settings.AUTH_USER_MODEL)),
                ("record", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="discussions", to="helix_core.platformrecord")),
                ("resolved_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="platform_discussions_resolved", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "helix_platform_discussion", "ordering": ("-created_at", "id")},
        ),
        migrations.CreateModel(
            name="PlatformDiscussionMessage",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("author_snapshot", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("author", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="platform_discussion_messages", to=settings.AUTH_USER_MODEL)),
                ("discussion", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="messages", to="helix_core.platformdiscussion")),
                ("parent", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="replies", to="helix_core.platformdiscussionmessage")),
            ],
            options={"db_table": "helix_platform_discussion_message", "ordering": ("created_at", "id")},
        ),
        migrations.CreateModel(
            name="PlatformDiscussionMessageRevision",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("sequence", models.PositiveIntegerField()),
                ("action", models.CharField(choices=[("create", "Create"), ("amend", "Amend"), ("retract", "Retract")], max_length=10)),
                ("body", models.TextField(blank=True, default="")),
                ("actor_snapshot", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("actor", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="platform_discussion_message_changes", to=settings.AUTH_USER_MODEL)),
                ("message", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="history", to="helix_core.platformdiscussionmessage")),
            ],
            options={"db_table": "helix_platform_discussion_message_revision", "ordering": ("sequence",)},
        ),
        migrations.AddConstraint(
            model_name="platformdiscussionmessagerevision",
            constraint=models.UniqueConstraint(fields=("message", "sequence"), name="helix_discussion_message_seq_uniq"),
        ),
    ]
