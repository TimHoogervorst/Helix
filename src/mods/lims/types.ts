/** A column definition within an entity type schema. */
export interface ColumnDef {
  id?: string;
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
  content_hash: string;
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

/** Paginated response wrapper. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ── ELN Table v2 (AG Grid) types ──────────────────────────────────────
//
// Moved to shared/types/types.ts — re-exported here so existing consumers
// don't break.  New code should import from "shared/types/types".

export type { GridColumn, GridRow } from "../../shell/src/shared/types/types";
