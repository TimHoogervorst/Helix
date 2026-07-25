"""Deterministic colour derivation for dropdown option values.

Uses a hash-based approach to assign stable colours to option values
without storing colour data.  The same option value always maps to the
same colour — across Python and TypeScript, across boots.

Palette: 12 OKLCH colours derived from evenly-spaced hues with
consistent lightness and chroma.  Each colour produces a background
token and a darker foreground token for text contrast.
"""

from __future__ import annotations

import hashlib

# ── Palette ────────────────────────────────────────────────────────────────────
#
# 12 colours with hues evenly spaced at 30° intervals, high lightness
# (0.88) for soft backgrounds and moderate chroma (0.08) for saturation.
# The hue offset (15°) avoids primary/secondary and leans into pastels.
#
# Each entry is a dict with:
#   bg  — OKLCH string for the background (light, high L)
#   fg  — OKLCH string for the foreground (darker, lower L, higher C)
#   hex — approximate hex fallback for environments that don't support OKLCH

_DROPDOWN_COLOR_PALETTE: list[dict[str, str]] = [
    # Hue 15  — warm coral
    {"bg": "oklch(0.88 0.08 15)", "fg": "oklch(0.42 0.10 15)", "hex": "#e6c8c0"},
    # Hue 45  — amber/gold
    {"bg": "oklch(0.88 0.08 45)", "fg": "oklch(0.42 0.10 45)", "hex": "#e6d9b3"},
    # Hue 75  — yellow-green
    {"bg": "oklch(0.88 0.08 75)", "fg": "oklch(0.42 0.10 75)", "hex": "#c8d9b3"},
    # Hue 105 — green
    {"bg": "oklch(0.88 0.08 105)", "fg": "oklch(0.42 0.10 105)", "hex": "#b3e6b3"},
    # Hue 135 — mint/teal-green
    {"bg": "oklch(0.88 0.08 135)", "fg": "oklch(0.42 0.10 135)", "hex": "#b3e6c8"},
    # Hue 165 — teal
    {"bg": "oklch(0.88 0.08 165)", "fg": "oklch(0.42 0.10 165)", "hex": "#b3e6da"},
    # Hue 195 — cyan/primary (matches the existing --color-primary family)
    {"bg": "oklch(0.88 0.08 195)", "fg": "oklch(0.42 0.10 195)", "hex": "#ccf0f5"},
    # Hue 225 — blue
    {"bg": "oklch(0.88 0.08 225)", "fg": "oklch(0.42 0.10 225)", "hex": "#b3c8e6"},
    # Hue 255 — indigo
    {"bg": "oklch(0.88 0.08 255)", "fg": "oklch(0.42 0.10 255)", "hex": "#c0b3e6"},
    # Hue 285 — violet
    {"bg": "oklch(0.88 0.08 285)", "fg": "oklch(0.42 0.10 285)", "hex": "#d0b3e6"},
    # Hue 315 — magenta
    {"bg": "oklch(0.88 0.08 315)", "fg": "oklch(0.42 0.10 315)", "hex": "#e6b3d9"},
    # Hue 345 — rose
    {"bg": "oklch(0.88 0.08 345)", "fg": "oklch(0.42 0.10 345)", "hex": "#e6b3c0"},
]

_PALETTE_SIZE = len(_DROPDOWN_COLOR_PALETTE)


def derive_dropdown_color(option_value: str) -> dict[str, str]:
    """Return the deterministic colour for *option_value*.

    Computes ``hash(option_value) % palette_size`` to pick a stable
    palette index.  The hash function is SHA-256, truncated to 64 bits
    for a uniform modulus distribution.

    Returns a dict with keys ``"bg"``, ``"fg"``, ``"hex"``, and
    ``"index"`` (the 0-based palette index).
    """
    digest = hashlib.sha256(option_value.encode("utf-8")).digest()
    # Take the first 8 bytes as an unsigned 64-bit integer.
    num = int.from_bytes(digest[:8], "big")
    index = num % _PALETTE_SIZE
    entry = dict(_DROPDOWN_COLOR_PALETTE[index])
    entry["index"] = index
    return entry


def get_palette_size() -> int:
    """Return the number of colours in the palette (12)."""
    return _PALETTE_SIZE


def get_palette() -> list[dict[str, str]]:
    """Return the full palette for serialisation to the frontend."""
    return [
        dict(entry, index=i) for i, entry in enumerate(_DROPDOWN_COLOR_PALETTE)
    ]
