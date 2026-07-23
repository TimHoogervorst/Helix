/** A column definition within a schema. */
export interface ColumnDef {
  id?: string;
  name: string;
  type: "Text" | "Number" | "Date" | "Boolean" | "Reference";
  required?: boolean;
  default?: string;
  units?: string;
  description?: string;
}

/** An entity type (legacy, from the old EntityType model). */
export interface EntityType {
  id: number;
  name: string;
  prefix: string;
  icon: string;
  columns: ColumnDef[];
  is_active: boolean;
  content_hash: string;
}

/** Payload for creating/updating an entity type (legacy). */
export interface EntityTypePayload {
  name: string;
  prefix: string;
  icon?: string;
  columns: ColumnDef[];
}

// ── Schema (new shared model) ───────────────────────────────────────────

/** A Schema row as returned by the API. */
export interface Schema {
  id: number;
  name: string;
  prefix: string;
  schema_type: number;
  schema_type_display: string;
  columns: ColumnDef[];
  is_default: boolean;
  is_active: boolean;
  content_hash: string;
}

/** Payload for creating/updating a Schema. */
export interface SchemaPayload {
  name: string;
  prefix: string;
  schema_type: number;
  columns: ColumnDef[];
}

/** A SchemaType as returned by the list endpoint. */
export interface SchemaTypeItem {
  id: number;
  display_name: string;
  workspace_id: string;
  is_active: boolean;
}

/** An entity as returned by the list endpoint. */
export interface EntityListItem {
  id: number;
  display_id: string;
  name: string;
  schema: number;
  schema_name: string;
  schema_prefix: string;
  properties: Record<string, unknown>;
  source_entry: number | null;
  source_entry_display_id: string | null;
  folder: number | null;
  author: number | null;
  author_username: string | null;
  status: string;
  updated_at: string;
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
