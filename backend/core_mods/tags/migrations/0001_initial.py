# Generated manually — moves Tag model from eln to tags, renames DB table.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("eln", "0010_add_tag_icon"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name="Tag",
                    fields=[
                        (
                            "id",
                            models.BigAutoField(
                                auto_created=True,
                                primary_key=True,
                                serialize=False,
                                verbose_name="ID",
                            ),
                        ),
                        ("name", models.CharField(max_length=100, unique=True)),
                        (
                            "color",
                            models.CharField(
                                choices=[
                                    ("enzyme", "Enzyme"),
                                    ("flask", "Flask"),
                                    ("solvent", "Solvent"),
                                    ("warn", "Warn"),
                                    ("primary", "Primary"),
                                    ("success", "Success"),
                                    ("destructive", "Destructive"),
                                    ("muted", "Muted"),
                                ],
                                default="muted",
                                max_length=50,
                            ),
                        ),
                        (
                            "icon",
                            models.CharField(
                                choices=[
                                    ("circle", "Circle"),
                                    ("dna", "DNA"),
                                    ("rat", "Rat"),
                                    ("leaf", "Leaf"),
                                    ("cog", "Machine"),
                                    ("notebook", "Entry"),
                                    ("user", "Person"),
                                    ("folder", "Folder"),
                                ],
                                default="circle",
                                max_length=50,
                            ),
                        ),
                    ],
                    options={
                        "db_table": "tags_tag",
                        "ordering": ["name"],
                    },
                ),
            ],
            database_operations=[
                migrations.RunSQL(
                    sql="ALTER TABLE eln_tag RENAME TO tags_tag;",
                    reverse_sql="ALTER TABLE tags_tag RENAME TO eln_tag;",
                ),
            ],
        ),
    ]
