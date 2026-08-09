"""Add hex_dark and hex_light fields to ColorToken and backfill existing rows.

Adds two new char columns (``hex_dark``, ``hex_light``) that are
auto-derived from ``hex`` on every model save.  The backfill data
migration derives the values for any existing rows.
"""

from django.db import migrations, models


def _derive_variants(hex_color: str):
    """Derive dark-theme and light-theme hex variants.

    ``hex_dark`` boosts lightness and saturation so the colour stands
    out on dark backgrounds.  ``hex_light`` is the original colour
    (assumed to have been chosen for light-background contexts).
    """
    import colorsys

    hex_color = hex_color.lstrip("#")
    if len(hex_color) not in (3, 6):
        return hex_color, hex_color

    if len(hex_color) == 3:
        hex_color = "".join(c * 2 for c in hex_color)

    r = int(hex_color[0:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0

    h, l, s = colorsys.rgb_to_hls(r, g, b)

    l_dark = min(0.88, l * 1.3)
    s_dark = min(1.0, s * 1.15)
    rd, gd, bd = colorsys.hls_to_rgb(h, l_dark, s_dark)
    hex_dark = "#{:02X}{:02X}{:02X}".format(
        round(rd * 255), round(gd * 255), round(bd * 255)
    )

    hex_light = "#{:02X}{:02X}{:02X}".format(
        round(r * 255), round(g * 255), round(b * 255)
    )

    return hex_dark, hex_light


def backfill_variants(apps, schema_editor):
    ColorToken = apps.get_model("helix_core", "ColorToken")
    for ct in ColorToken.objects.all():
        ct.hex_dark, ct.hex_light = _derive_variants(ct.hex)
        ct.save(update_fields=["hex_dark", "hex_light"])


class Migration(migrations.Migration):

    dependencies = [
        ("helix_core", "0008_add_schema_icon_color"),
    ]

    operations = [
        migrations.AddField(
            model_name="colortoken",
            name="hex_dark",
            field=models.CharField(max_length=7, default=""),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="colortoken",
            name="hex_light",
            field=models.CharField(max_length=7, default=""),
            preserve_default=False,
        ),
        migrations.RunPython(
            code=backfill_variants,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
