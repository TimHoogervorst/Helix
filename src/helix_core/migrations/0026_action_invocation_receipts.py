import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("helix_core", "0025_generic_record_targets"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ActionInvocationReceipt",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("invocation_id", models.CharField(max_length=255)),
                ("actor_stable_id", models.CharField(max_length=255)),
                ("fingerprint", models.CharField(max_length=64)),
                ("request_fingerprint", models.CharField(max_length=64)),
                ("target_ids", models.JSONField(default=dict)),
                ("outcome", models.JSONField()),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("actor", models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="action_invocation_receipts",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"db_table": "helix_action_invocation_receipt"},
        ),
        migrations.AddConstraint(
            model_name="actioninvocationreceipt",
            constraint=models.UniqueConstraint(
                fields=("actor_stable_id", "invocation_id"),
                name="helix_action_invocation_actor_id_uniq",
            ),
        ),
    ]
