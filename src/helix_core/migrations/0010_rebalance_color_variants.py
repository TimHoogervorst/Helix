"""Re-derive hex_dark with improved algorithm that avoids wash-out.

The original algorithm boosted lightness unconditionally (+30 %),
which made already-light colours nearly white on dark backgrounds.
The improved algorithm darkens all colours for depth on dark
backgrounds with a stronger saturation boost.
"""

from django.db import migrations


def _derive_variants(hex_color: str):
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

    if l < 0.30:
        l_dark = l * 1.1
    else:
        l_dark = l * 0.82

    s_dark = min(1.0, s * 1.3)
    rd, gd, bd = colorsys.hls_to_rgb(h, l_dark, s_dark)
    hex_dark = "#{:02X}{:02X}{:02X}".format(
        round(rd * 255), round(gd * 255), round(bd * 255)
    )

    hex_light = "#{:02X}{:02X}{:02X}".format(
        round(r * 255), round(g * 255), round(b * 255)
    )

    return hex_dark, hex_light


def rebalance_variants(apps, schema_editor):
    ColorToken = apps.get_model("helix_core", "ColorToken")
    for ct in ColorToken.objects.all():
        ct.hex_dark, ct.hex_light = _derive_variants(ct.hex)
        ct.save(update_fields=["hex_dark", "hex_light"])


class Migration(migrations.Migration):

    dependencies = [
        ("helix_core", "0009_color_token_variants"),
    ]

    operations = [
        migrations.RunPython(
            code=rebalance_variants,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
