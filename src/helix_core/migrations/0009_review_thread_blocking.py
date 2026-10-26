from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("helix_core", "0008_review_approval_reopen"),
    ]

    operations = [
        migrations.AddField(
            model_name="reviewthread",
            name="blocking",
            field=models.BooleanField(default=True),
        ),
    ]
