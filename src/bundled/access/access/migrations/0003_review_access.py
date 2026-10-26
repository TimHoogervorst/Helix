from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("access", "0002_initial")]

    operations = [
        migrations.AlterField(
            model_name="grant",
            name="role",
            field=models.CharField(
                choices=[("read", "Read"), ("review", "Review"), ("edit", "Edit")],
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="foldershare",
            name="level",
            field=models.CharField(
                choices=[("read", "Read"), ("review", "Review"), ("read_write", "Read + Write")],
                max_length=15,
            ),
        ),
    ]
