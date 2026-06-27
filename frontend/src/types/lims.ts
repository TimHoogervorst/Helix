/** A column definition within an entity type schema. */
export interface ColumnDef {
  name: string;
  type: "Text" | "Number" | "Date" | "Boolean" | "Reference";
  required?: boolean;
  default?: string;
  units?: string;
  description?: string;
}

/** An entity type (schema) as returned by the API. */
export interface EntityType {
  id: number;
  name: string;
  prefix: string;
  icon: string;
  columns: ColumnDef[];
  is_active: boolean;
}

/** Payload for creating/updating an entity type. */
export interface EntityTypePayload {
  name: string;
  prefix: string;
  icon?: string;
  columns: ColumnDef[];
}

/** An entity as returned by the list endpoint. */
export interface EntityListItem {
  id: number;
  display_id: string;
  name: string;
  entity_type: number;
  entity_type_name: string;
  entity_type_prefix: string;
  entity_type_icon: string;
  properties: Record<string, unknown>;
  source_entry: number | null;
  source_entry_display_id: string | null;
  folder: number | null;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
}

/** An entity as returned by the batch resolve endpoint. */
export interface EntityBatchResult {
  id: number;
  display_id: string;
  name: string;
  entity_type_id: number;
  entity_type_name: string;
  properties: Record<string, unknown>;
  folder_id: number | null;
  created_at: string;
}

/** Paginated response wrapper. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ── ELN Table v2 (AG Grid) types ──────────────────────────────────────

/** A column definition for the ELN table grid. Mirrors LIMS ColumnDef but
 *  adds grid-only metadata like width and pinned. */
export interface GridColumn {
  name: string;
  type: "Text" | "Number" | "Date" | "Boolean" | "Reference";
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
}

// ── LIMS Page View State ──────────────────────────────────────────────

// Re-exported from shared console types for backward compatibility.
export type { ViewState } from "./console";

/** The full table data stored in the limsTable node attribute. */
export interface GridTableData {
  schemaId: number | null;
  title: string;
  columns: GridColumn[];
  rows: GridRow[];
}
