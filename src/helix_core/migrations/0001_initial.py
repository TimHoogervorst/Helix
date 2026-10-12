# Generated manually — helix_core SchemaType + Schema models

from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="SchemaType",
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
                ("display_name", models.CharField(max_length=255)),
                ("workspace_id", models.CharField(max_length=100)),
                (
                    "model",
                    models.CharField(
                        help_text="Dotted Python path to the model class, e.g. 'mods.lims.models.Entity'.",
                        max_length=500,
                    ),
                ),
                (
                    "columns",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="Ordered array of column definitions: {id, name, type, required, default, units, description}.",
                    ),
                ),
                (
                    "is_active",
                    models.BooleanField(
                        default=True,
                        help_text="Soft-delete flag. Inactive schema types are hidden from dropdowns.",
                    ),
                ),
                (
                    "content_hash",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="SHA-256 hash of column definitions (id, name, type, required, default, units). Computed on every save.",
                        max_length=64,
                    ),
                ),
            ],
            options={
                "db_table": "helix_schema_type",
                "ordering": ["display_name"],
            },
        ),
        migrations.CreateModel(
            name="Schema",
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
                ("name", models.CharField(max_length=255)),
                (
                    "prefix",
                    models.CharField(
                        help_text="Uppercase letters, e.g. BLOOD. Used to generate display IDs like BLOOD1.",
                        max_length=50,
                        unique=True,
                    ),
                ),
                (
                    "columns",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="Ordered array of column definitions.",
                    ),
                ),
                (
                    "is_default",
                    models.BooleanField(
                        default=False,
                        help_text="Whether this is the default schema for its SchemaType.",
                    ),
                ),
                (
                    "is_active",
                    models.BooleanField(
                        default=True,
                        help_text="Soft-delete flag. Inactive schemas are hidden from dropdowns.",
                    ),
                ),
                (
                    "content_hash",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="SHA-256 hash of column definitions.",
                        max_length=64,
                    ),
                ),
                (
                    "schema_type",
                    models.ForeignKey(
                        on_delete=models.CASCADE,
                        related_name="schemas",
                        to="helix_core.schematype",
                    ),
                ),
            ],
            options={
                "db_table": "helix_schema",
                "ordering": ["schema_type", "name"],
            },
        ),
    ]
