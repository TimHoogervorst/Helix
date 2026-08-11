from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_project_enrichment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="folder",
            name="project",
            field=models.ForeignKey(
                on_delete=models.deletion.CASCADE,
                related_name="folders",
                to="core.project",
            ),
        ),
    ]
