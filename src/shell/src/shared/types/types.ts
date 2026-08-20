// ── ELN Table / Registry Table grid types ─────────────────────────────
//
// These describe the grid data model used by Registry Table blocks.
// They live in shared/ because both the ELN editor and the LIMS
// module reference them, but they are not LIMS domain concepts — they
// are presentation-level grid types.

/** A column definition for the ELN table grid. Mirrors LIMS ColumnDef but
 *  adds grid-only metadata like width and pinned. */
export interface GridColumn {
  /** Stable UUID from the server-side column definition (#252). */
  id?: string;
  name: string;
  /** Column type identifier string — matches the registry's lowercase type IDs. */
  type: string;
  required?: boolean;
  default?: string;
  units?: string;
  description?: string;
  /** ID of the Dropdown (controlled vocabulary) to use when type is "dropdown". */
  dropdownId?: number;
  /** ID of the target Schema when type is "reference". */
  referenceSchemaId?: number;
  /** ID of the target Schema Type when type is "reference". */
  referenceSchemaTypeId?: number;
  expression?: string;
  resultType?: string;
  expression_version?: number;
  /** Pixel width; undefined means auto-size. */
  width?: number;
  /** Whether this column came from the schema or was added locally. */
  isCustom?: boolean;
}

/** A single row of data in the ELN table grid. */
export interface GridRow {
  /** Entity ID — null for unsaved rows and plain tables. */
  entityId: number | null;
  /** Display ID like BLOOD1, or placeholder like "#new". */
  displayId: string;
  /** Cell values keyed by column name. */
  values: Record<string, unknown>;
  /** Entity name — stored at row level (not inside values), only meaningful
   *  for schema-backed tables.  Read/written by the Name pseudo-column. */
  __name?: string;
}

