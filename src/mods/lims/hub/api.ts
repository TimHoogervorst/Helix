import { get } from "../../../shell/src/api/client";
import type { EntityHubResponse, Schema, SchemaTypeItem } from "../types";

// ── Query params accepted by GET /api/registry/entities/ ──────────────────

export interface EntityHubFilters {
  search?: string;
  schema_type?: string;
  schema?: string;
  status?: string;
  sort?: string;
  /** Repeatable field filters in "key:value" format. */
  f?: string[];
  page?: number;
  size?: number;
}

/**
 * Fetch entities from the entity_hub_view via the registry endpoint.
 */
export function getEntities(filters?: EntityHubFilters): Promise<EntityHubResponse> {
  const params = new URLSearchParams();
  if (filters) {
    if (filters.search) params.set("search", filters.search);
    if (filters.schema_type) params.set("schema_type", filters.schema_type);
    if (filters.schema) params.set("schema", filters.schema);
    if (filters.status) params.set("status", filters.status);
    if (filters.sort) params.set("sort", filters.sort);
    if (filters.f) {
      for (const ff of filters.f) {
        params.append("f", ff);
      }
    }
    if (filters.page !== undefined) params.set("page", String(filters.page));
    if (filters.size !== undefined) params.set("size", String(filters.size));
  }
  const qs = params.toString();
  return get(`/registry/entities/${qs ? `?${qs}` : ""}`);
}

// ── Schema & SchemaType lookups (for dropdown population) ─────────────────

/** Fetch all active SchemaTypes (for optgroup headers). */
export function getSchemaTypes(): Promise<SchemaTypeItem[]> {
  return get("/schema-types/");
}

/** Fetch all active Schemas (for the dropdown options). */
export function getSchemas(): Promise<Schema[]> {
  return get("/schemas/");
}
