/** A named, ordered list of options for dropdown columns. */
export interface Dropdown {
  id: number;
  name: string;
  options: string[];
  created_at: string;
  updated_at: string;
}

/** Colour derived from a dropdown option value. */
export interface DropdownOptionColor {
  /** The palette index (0-based) used for this option. */
  index: number;
  /** OKLCH background colour string. */
  bg: string;
  /** OKLCH foreground colour string. */
  fg: string;
  /** Approximate hex fallback. */
  hex: string;
}
