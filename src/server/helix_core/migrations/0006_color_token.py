"""Create ColorToken model and seed the 6-token colour palette.

The seed data mirrors the current ``TAG_COLORS`` in
``src/mods/tags/constants.ts`` — the single source of truth for the
six colour hex values.  Repeated migration runs are safe
(idempotent: ``get_or_create`` on ``key``).

Admin deletions of seeds **stick** — there is no boot-time upsert.
"""

from django.db import migrations, models


COLORS = [
    ("enzyme", "Enzyme", "#D9B3E6"),
    ("flask", "Flask", "#B3D9E6"),
    ("solvent", "Solvent", "#B3E6C8"),
    ("warn", "Warn", "#E6D9B3"),
    ("muted", "Muted", "#D9D9D9"),
    ("success", "Success", "#B3E6B3"),
]


def seed_color_tokens(apps, schema_editor):
    """Insert the six palette colours if they don't already exist.

    Uses ``get_or_create(key=…)`` so repeated migration runs are safe
    (no duplicates) and previously-deleted seeds are re-created (dev
    convenience only — production migrations never re-run).
    """
    ColorToken = apps.get_model("helix_core", "ColorToken")
    for key, label, hex_val in COLORS:
        ColorToken.objects.get_or_create(
            key=key,
            defaults={"label": label, "hex": hex_val},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("helix_core", "0005_lowercase_column_types"),
    ]

    operations = [
        migrations.CreateModel(
            name="ColorToken",
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
                ("key", models.CharField(max_length=100, unique=True)),
                ("label", models.CharField(max_length=255)),
                ("hex", models.CharField(max_length=7)),
            ],
            options={
                "db_table": "helix_color_token",
                "ordering": ["label"],
            },
        ),
        migrations.RunPython(
            code=seed_color_tokens,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
