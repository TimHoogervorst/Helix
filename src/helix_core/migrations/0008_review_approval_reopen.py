import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0007_review_participation_threads"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ReviewApproval",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("witness_stable_id", models.CharField(max_length=255)),
                ("witness_snapshot", models.JSONField(blank=True, default=dict)),
                ("assessment", models.TextField()),
                ("retained_evidence", models.JSONField(default=dict)),
                ("request_id", models.UUIDField()),
                ("request_fingerprint", models.CharField(max_length=64)),
                ("approved_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("participation", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="approvals", to="helix_core.reviewparticipation")),
                ("submission", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="approval", to="helix_core.reviewsubmission")),
                ("target", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="approvals", to="helix_core.reviewtarget")),
                ("witness", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="witness_approvals", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "helix_review_approval"},
        ),
        migrations.AddConstraint(
            model_name="reviewapproval",
            constraint=models.UniqueConstraint(fields=("witness_stable_id", "request_id"), name="helix_review_approval_request_uniq"),
        ),
        migrations.CreateModel(
            name="ReviewReopen",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("actor_stable_id", models.CharField(max_length=255)),
                ("actor_snapshot", models.JSONField(blank=True, default=dict)),
                ("reason", models.TextField()),
                ("reopened_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("actor", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="review_reopens", to=settings.AUTH_USER_MODEL)),
                ("approval", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reopens", to="helix_core.reviewapproval")),
                ("target", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reopens", to="helix_core.reviewtarget")),
            ],
            options={"db_table": "helix_review_reopen"},
        ),
    ]
