// Re-export shim — the canonical file has moved to core-mods/lims/types.ts.
// Prefer importing from the canonical location in new code.
export type {
  ColumnDef,
  EntityType,
  EntityTypePayload,
  EntityListItem,
  EntityBatchResult,
  PaginatedResponse,
  GridColumn,
  GridRow,
  GridTableData,
} from "../core-mods/lims/types";
