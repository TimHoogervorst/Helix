"""Create IconLibraryEntry model and seed ~110 curated Lucide icons.

The seed data mirrors the current ``TAG_ICON_CHOICES`` (8 icons) and
``CARD_ICONS`` (13 icons) plus ~90 curated science glyphs.  Repeated
migration runs are safe (idempotent: ``get_or_create`` on ``key``).

Admin deletions of seeds **stick** — there is no boot-time upsert.
"""

from django.db import migrations, models


_LABEL_TWEAKS = {
    "Dna": "DNA",
    "Cpu": "CPU",
    "Wifi": "WiFi",
}


def _token_to_label(token):
    words = token.split("-")
    label = " ".join(w.capitalize() for w in words)
    return _LABEL_TWEAKS.get(label, label)


# ── 8 tag icons ────────────────────────────────────────────────────────
_TAG_ICONS = [
    "circle",
    "dna",
    "rat",
    "leaf",
    "cog",
    "notebook",
    "user",
    "folder",
]

# ── 13 metric-card icons ───────────────────────────────────────────────
_CARD_ICONS = [
    "flask-conical",
    "scroll-text",
    "test-tubes",
    "alert-triangle",
    "activity",
    "bar-chart-3",
    "beaker",
    "circle-dollar-sign",
    "clock",
    "file-text",
    "thermometer",
    "trending-up",
    "check-circle",
]

# ── ~90 curated science glyphs ─────────────────────────────────────────
_CURATED_ICONS = [
    # Bench / glassware
    "flask-round", "test-tube", "test-tube-2", "test-tube-diagonal",
    "pipette", "microscope", "atom", "orbit",
    # Measurement
    "scale", "gauge", "ruler", "calculator", "timer", "hourglass",
    "magnet", "lightbulb",
    # Safety
    "biohazard", "radiation", "shield-check", "hard-hat",
    "fire-extinguisher", "siren", "glasses",
    # Organisms
    "bug", "worm", "snail", "turtle", "rabbit", "mouse",
    "cat", "dog", "bird", "fish", "egg", "paw-print",
    "bone", "brain",
    # Plants
    "sprout", "leafy-green", "flower", "flower-2",
    "trees", "tree-pine", "wheat", "cannabis",
    # Medical
    "syringe", "pill", "tablets", "pill-bottle",
    "stethoscope", "bandage", "hospital",
    # Storage / cold-chain
    "refrigerator", "snowflake", "thermometer-snowflake",
    "warehouse", "container", "boxes", "package",
    "archive", "inbox", "barrel",
    # Documents / workflow
    "notebook-text", "notebook-pen", "book-open",
    "clipboard-list", "clipboard-check", "file-spreadsheet",
    "presentation", "calendar-days", "list-todo",
    # Infrastructure
    "database", "server", "hard-drive", "microchip",
    "cpu", "printer", "webcam", "wifi",
    # Misc science
    "telescope", "satellite", "rocket", "compass",
    "target", "graduation-cap", "recycle",
]

ALL_ICONS = list(dict.fromkeys(_TAG_ICONS + _CARD_ICONS + _CURATED_ICONS))


def seed_icon_library(apps, schema_editor):
    IconLibraryEntry = apps.get_model("helix_core", "IconLibraryEntry")
    for token in ALL_ICONS:
        label = _token_to_label(token)
        IconLibraryEntry.objects.get_or_create(
            key=token,
            defaults={"label": label, "kind": "lucide", "token": token, "svg": ""},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("helix_core", "0006_color_token"),
    ]

    operations = [
        migrations.CreateModel(
            name="IconLibraryEntry",
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
                (
                    "kind",
                    models.CharField(
                        choices=[("lucide", "Lucide"), ("custom", "Custom")],
                        max_length=20,
                    ),
                ),
                (
                    "token",
                    models.CharField(
                        blank=True,
                        default="",
                        help_text="Lucide kebab-case icon name (e.g. 'test-tube-2'). Only when kind=lucide.",
                        max_length=255,
                    ),
                ),
                (
                    "svg",
                    models.TextField(
                        blank=True,
                        default="",
                        help_text="Sanitized SVG markup. Only when kind=custom.",
                    ),
                ),
            ],
            options={
                "db_table": "helix_icon_library_entry",
                "ordering": ["label"],
            },
        ),
        migrations.RunPython(
            code=seed_icon_library,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
