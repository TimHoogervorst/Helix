import type { Tag } from "../tags/types";

export interface SourcePathSegment {
  kind: "project" | "folder" | "entry" | "entity";
  id: number;
  name: string;
  uid?: string;
  display_id?: string;
}

/** A column definition within a schema. */
export interface ColumnDef {
  id?: string;
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  default?: string;
  units?: string;
  description?: string;
  /** ID of the Dropdown (controlled vocabulary) to use when type is "dropdown". */
  dropdownId?: number;
  /** ID of the target Schema when type is "reference". */
  referenceSchemaId?: number;
  /** ID of the target Schema Type when type is "reference". */
  referenceSchemaTypeId?: number;
  /** Formula expression, using sibling columns in [Column Name] form. */
  expression?: string;
  /** Result type for a formula column. */
  resultType?: string;
  /** Monotonic version of the expression used for stored computed values. */
  expression_version?: number;
}

// ── Schema (new shared model) ───────────────────────────────────────────

/** A Schema row as returned by the API. */
export interface Schema {
  id: number;
  name: string;
  description?: string;
  prefix: string;
  schema_type: number;
  schema_type_display: string;
  tags: string[];
  columns: ColumnDef[];
  is_default: boolean;
  is_active: boolean;
  content_hash: string;
  icon: string;
  color: string;
  enabled_components: string[];
}

/** Payload for creating/updating a Schema. */
export interface SchemaPayload {
  name: string;
  description?: string;
  prefix: string;
  schema_type: number;
  columns: ColumnDef[];
  icon?: string;
  color?: string;
  enabled_components?: string[];
}

/** A SchemaType as returned by the list endpoint. */
export interface SchemaTypeItem {
  id: number;
  display_name: string;
  workspace_id: string;
  is_active: boolean;
  schema_type_id: string;
  tags: string[];
}

/** An entity as returned by the entity API. */
export interface EntityListItem {
  id: number;
  display_id: string;
  name: string;
  schema: number;
  schema_name: string;
  schema_prefix: string;
  schema_columns: ColumnDef[];
  schema_icon: string;
  schema_color: string;
  enabled_components: string[];
  properties: Record<string, unknown>;
  author: number | null;
  author_username: string | null;
  last_editor: number | null;
  last_editor_username: string | null;
  source_path: SourcePathSegment[];
  project_uid: string | null;
  status: string;
  updated_at: string;
  created_at: string;
  tags: Tag[];
  effective_role: "read" | "edit";
}

/** Paginated response wrapper. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** User summary embedded in a LIMS action response. */
export interface LimsActionUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  color: string;
}

/** An action log entry returned by the LIMS actions endpoint. */
export interface LimsAction {
  id: number;
  action: string;
  action_type: string;
  target_type: string;
  target_id: number;
  request_id?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  performed_by: LimsActionUser | null;
}

// ── Entities Hub ─────────────────────────────────────────────────────────

export interface EntityHubSource {
  kind: "project" | "folder" | "entry" | "entity";
  id: number;
  name: string;
  display_id?: string;
  icon: string;
  color: string;
  uid?: string;
  path?: string;
}

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
  icon: string;
  color: string;
  workspace_id: string;
  project_id: number;
  project_uid: string;
  project_name: string;
  project_icon: string;
  project_color: string;
  source: EntityHubSource | null;
  /** Schema properties columns extracted from the properties JSON.
   * Only populated when a specific Schema is selected. */
  _expanded: Record<string, unknown> | null;
}

/** Available column descriptor returned by the API. */
export interface AvailableColumn {
  key: string;
  label: string;
  source: "common" | "schema_type" | "schema";
  /** Column type ID from the column type registry (e.g. "text", "number"). */
  type: string;
  /** Declared operand type for formula columns. */
  resultType?: string;
  /** Whether this column can be filtered by its type's operators. */
  filterable: boolean;
  /** Default pixel width for the column header, or null for auto-size. */
  width: number | null;
  /** ID of the Dropdown (controlled vocabulary) to use when type is "dropdown". */
  dropdownId?: number;
  /** ID of the target Schema when type is "reference". */
  referenceSchemaId?: number;
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
