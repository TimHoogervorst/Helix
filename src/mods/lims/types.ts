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
  schema_type_id: string;
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

// ── Entities Hub ─────────────────────────────────────────────────────────

/** A row from the entity_hub_view as returned by GET /api/registry/entities. */
export interface EntityHubItem {
  id: number;
  display_id: string;
  name: string;
  schema_type_id: string;
  schema_type_display: string;
  schema_id: number;
  schema_name: string;
  schema_prefix: string;
  status: string;
  author: number | null;
  author_username: string | null;
  created_at: string;
  updated_at: string;
  workspace_id: string;
  /** Schema properties columns extracted from the properties JSON.
   * Only populated when a specific Schema is selected. */
  _expanded: Record<string, unknown> | null;
}

/** Available column descriptor returned by the API. */
export interface AvailableColumn {
  key: string;
  label: string;
  source: "common" | "schema_type" | "schema";
}

/** Paginated response from GET /api/registry/entities. */
export interface EntityHubResponse {
  results: EntityHubItem[];
  total: number;
  page: number;
  size: number;
  available_columns: AvailableColumn[];
}

// ── ELN Table v2 (AG Grid) types ──────────────────────────────────────
//
// Moved to shared/types/types.ts — re-exported here so existing consumers
// don't break.  New code should import from "shared/types/types".

export type { GridColumn, GridRow } from "../../shell/src/shared/types/types";

// ── Saved Views ────────────────────────────────────────────────────────────

/** Filter state stored in a saved View, mirroring URL params. */
export interface ViewFilterState {
  search: string;
  schema_type: string;
  schema: string;
  status: string;
  sort: string;
  fields: string[];
  columns: string[];
  viewMode: "list" | "compact";
}

/** A saved Entity Hub View (from GET /api/lims/views/). */
export interface LimsViewItem {
  id: number;
  owner: number;
  owner_username: string;
  name: string;
  filter_state: ViewFilterState;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

/** Payload for creating a new View. */
export interface LimsViewCreatePayload {
  name: string;
  filter_state: ViewFilterState;
  is_public?: boolean;
}

/** Payload for updating a View. */
export interface LimsViewUpdatePayload {
  name?: string;
  filter_state?: ViewFilterState;
  is_public?: boolean;
}
