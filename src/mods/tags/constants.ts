import { Circle, Dna, Rat, Leaf, Cog, NotebookText, User, Folder } from "lucide-react";

// ── Tag colours ─────────────────────────────────────────────────────────────

interface TagColor {
  key: string;
  label: string;
  hex: string;
}

/**
 * Canonical eight-colour palette — single source of truth for tag colour tokens.
 * The CSS classes `.tag-pill.tag-{key}` and CSS variables are defined in styles.css.
 */
export const TAG_COLORS: TagColor[] = [
  { key: "enzyme",      label: "Enzyme",      hex: "#d9b3e6" },
  { key: "flask",       label: "Flask",       hex: "#b3d9e6" },
  { key: "solvent",     label: "Solvent",     hex: "#b3e6c8" },
  { key: "warn",        label: "Warn",        hex: "#e6d9b3" },
  { key: "primary",     label: "Primary",     hex: "#7fb3d9" },
  { key: "success",     label: "Success",     hex: "#b3e6b3" },
  { key: "destructive", label: "Destructive", hex: "#e6b3b3" },
  { key: "muted",       label: "Muted",       hex: "#d9d9d9" },
];

// ── Tag icons ───────────────────────────────────────────────────────────────

export interface TagIcon {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

/**
 * Canonical eight-icon set — single source of truth for tag icon tokens.
 */
export const TAG_ICONS: TagIcon[] = [
  { key: "circle",   label: "Circle",  Icon: Circle },
  { key: "dna",      label: "DNA",     Icon: Dna },
  { key: "rat",      label: "Rat",     Icon: Rat },
  { key: "leaf",     label: "Leaf",    Icon: Leaf },
  { key: "cog",      label: "Machine", Icon: Cog },
  { key: "notebook", label: "Entry",   Icon: NotebookText },
  { key: "user",     label: "Person",  Icon: User },
  { key: "folder",   label: "Folder",  Icon: Folder },
];

/** Look up an icon definition by key, falling back to "circle". */
export function getTagIcon(key: string): TagIcon {
  return TAG_ICONS.find((i) => i.key === key) ?? TAG_ICONS.find((i) => i.key === "circle")!;
}
