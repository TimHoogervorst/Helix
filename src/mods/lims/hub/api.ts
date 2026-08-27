import { get, post, patch, del } from "../../../shell/src/api/client";
import type {
  EntityHubResponse,
  EntityListItem,
  Schema,
  SchemaTypeItem,
  LimsViewItem,
  LimsViewCreatePayload,
  LimsViewUpdatePayload,
  LimsAction,
  PaginatedResponse,
} from "../types";

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

/** Fetch one page of actions for an entity, or follow a DRF next URL. */
export function fetchEntityActions(
  entityId: string,
  url?: string,
): Promise<PaginatedResponse<LimsAction>> {
  if (url) {
    const path = url
      .replace(/^(?:https?:)?\/\/[^/]+/, "")
      .replace(/^\/api(?=\/)/, "");
    return get(path);
  }

  const params = new URLSearchParams({
    target_type: "lims.entity",
    target_id: entityId,
  });
  return get(`/lims/actions/?${params.toString()}`);
}

export function attachEntityTags(
  displayId: string,
  tagIds: number[],
): Promise<EntityListItem> {
  return post<EntityListItem>(`/lims/entities/${displayId}/tags/`, {
    tag_ids: tagIds,
  });
}

/** Move an entity while retaining its legacy folder representation. */
export function patchEntity(
  displayId: string,
  payload: {
    status?: string;
    folder?: number | null;
    source_type?: number;
    source_id?: number;
  },
): Promise<EntityListItem> {
  return patch<EntityListItem>(`/lims/entities/${displayId}/`, payload);
}

export function detachEntityTag(
  displayId: string,
  tagId: number,
): Promise<EntityListItem> {
  return del<EntityListItem>(`/lims/entities/${displayId}/tags/${tagId}/`);
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

// ── Saved Views ──────────────────────────────────────────────────────────────

/** Fetch the current user's saved Views. */
export function getMyViews(): Promise<LimsViewItem[]> {
  return get<LimsViewItem[]>("/lims/views/");
}

/** Fetch public Views from all users (excluding own). */
export function getPublicViews(): Promise<LimsViewItem[]> {
  return get<LimsViewItem[]>("/lims/views/?public=true");
}

/** Create a new saved View. */
export function createView(
  payload: LimsViewCreatePayload,
): Promise<LimsViewItem> {
  return post<LimsViewItem>("/lims/views/", payload);
}

/** Update a saved View (rename, change filters, toggle public). */
export function updateView(
  viewId: number,
  payload: LimsViewUpdatePayload,
): Promise<LimsViewItem> {
  return patch<LimsViewItem>(`/lims/views/${viewId}/`, payload);
}

/** Delete a saved View. */
export function deleteView(viewId: number): Promise<void> {
  return del<void>(`/lims/views/${viewId}/`);
}
