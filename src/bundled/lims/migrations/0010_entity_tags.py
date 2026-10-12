from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("lims", "0009_make_folder_nullable"),
        ("tags", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="entity",
            name="tags",
            field=models.ManyToManyField(
                db_table="lims_tag_entities",
                related_name="+",
                to="tags.tag",
            ),
        ),
    ]
