// ── ELN Table v2 (AG Grid) types ──────────────────────────────────────
//
// These describe the grid data model used by the ELN editor's limsTable
// node.  They live in shared/ because both the ELN editor and the LIMS
// module reference them, but they are not LIMS domain concepts — they
// are presentation-level grid types.

/** The valid column types for ELN table grid columns. */
export type GridColumnType = "Text" | "Number" | "Date" | "Boolean" | "Reference";

/** A column definition for the ELN table grid. Mirrors LIMS ColumnDef but
 *  adds grid-only metadata like width and pinned. */
export interface GridColumn {
  /** Stable UUID from the server-side column definition (#252). */
  id?: string;
  name: string;
  type: GridColumnType;
  required?: boolean;
  default?: string;
  units?: string;
  description?: string;
  /** Pixel width; undefined means auto-size. */
  width?: number;
  /** Whether this column came from the schema or was added locally. */
  isCustom?: boolean;
}

/** A single row of data in the ELN table grid. */
export interface GridRow {
  /** LIMS entity ID — null for unsaved rows and plain tables. */
  entityId: number | null;
  /** Display ID like BLOOD1, or placeholder like "#new". */
  displayId: string;
  /** Cell values keyed by column name. */
  values: Record<string, unknown>;
  /** Entity name — stored at row level (not inside values), only meaningful
   *  for schema-backed tables.  Read/written by the Name pseudo-column. */
  __name?: string;
}

