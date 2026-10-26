from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('helix_core', '0008_review_approval_reopen')]
    operations = [
        migrations.AddField('reviewthread', 'suggestion', models.JSONField(blank=True, default=dict)),
        migrations.AddField('reviewthread', 'suggestion_disposition', models.CharField(choices=[('pending', 'Pending'), ('applied', 'Applied'), ('rejected', 'Rejected')], default='pending', max_length=12)),
        migrations.AddField('reviewthread', 'suggestion_actor_snapshot', models.JSONField(blank=True, default=dict)),
        migrations.AddField('reviewthread', 'suggestion_result_revision', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='review_suggestions', to='helix_core.scientificrevision')),
    ]
