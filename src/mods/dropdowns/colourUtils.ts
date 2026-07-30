/**
 * Deterministic colour derivation for dropdown option values.
 *
 * Uses a simple synchronous djb2 hash so colour computation stays fast
 * in the render path.  The same option value always maps to the same
 * palette index — stable per value, no stored colour data.
 *
 * Palette: 12 OKLCH colours with evenly-spaced hues, matching the
 * Python implementation in ``colour_utils.py``.
 */

import type { DropdownOptionColor } from "./types";

// ── Palette ─────────────────────────────────────────────────────────────
//
// 12 colours with hues at 30° intervals (offset 15°).  Same values as
// the Python _DROPDOWN_COLOR_PALETTE.

const DROPDOWN_COLOR_PALETTE: DropdownOptionColor[] = [
  { index: 0, bg: "oklch(0.88 0.08 15)", fg: "oklch(0.42 0.10 15)", hex: "#e6c8c0" },
  { index: 1, bg: "oklch(0.88 0.08 45)", fg: "oklch(0.42 0.10 45)", hex: "#e6d9b3" },
  { index: 2, bg: "oklch(0.88 0.08 75)", fg: "oklch(0.42 0.10 75)", hex: "#c8d9b3" },
  { index: 3, bg: "oklch(0.88 0.08 105)", fg: "oklch(0.42 0.10 105)", hex: "#b3e6b3" },
  { index: 4, bg: "oklch(0.88 0.08 135)", fg: "oklch(0.42 0.10 135)", hex: "#b3e6c8" },
  { index: 5, bg: "oklch(0.88 0.08 165)", fg: "oklch(0.42 0.10 165)", hex: "#b3e6da" },
  { index: 6, bg: "oklch(0.88 0.08 195)", fg: "oklch(0.42 0.10 195)", hex: "#ccf0f5" },
  { index: 7, bg: "oklch(0.88 0.08 225)", fg: "oklch(0.42 0.10 225)", hex: "#b3c8e6" },
  { index: 8, bg: "oklch(0.88 0.08 255)", fg: "oklch(0.42 0.10 255)", hex: "#c0b3e6" },
  { index: 9, bg: "oklch(0.88 0.08 285)", fg: "oklch(0.42 0.10 285)", hex: "#d0b3e6" },
  { index: 10, bg: "oklch(0.88 0.08 315)", fg: "oklch(0.42 0.10 315)", hex: "#e6b3d9" },
  { index: 11, bg: "oklch(0.88 0.08 345)", fg: "oklch(0.42 0.10 345)", hex: "#e6b3c0" },
];

const PALETTE_SIZE = DROPDOWN_COLOR_PALETTE.length;

// ── hash ────────────────────────────────────────────────────────────────

/**
 * djb2 string hash — fast, deterministic, synchronous.
 *
 * Returns an unsigned 32-bit integer for the given string.
 * Well-distributed enough for palette index derivation.
 */
function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // force 32-bit
  }
  return hash >>> 0; // unsigned
}

// ── public API ──────────────────────────────────────────────────────────

/**
 * Return the deterministic colour for an option value.
 *
 * ``djb2(optionValue) % 12`` picks a stable palette index.
 * Same value → same colour every time.
 */
export function deriveDropdownColor(optionValue: string): DropdownOptionColor {
  const index = djb2(optionValue) % PALETTE_SIZE;
  return DROPDOWN_COLOR_PALETTE[index];
}

/** Return the full palette for UI previews. */
export function getPalette(): DropdownOptionColor[] {
  return DROPDOWN_COLOR_PALETTE;
}

/** Return the number of colours in the palette (12). */
export function getPaletteSize(): number {
  return PALETTE_SIZE;
}
