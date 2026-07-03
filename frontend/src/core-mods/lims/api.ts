/**
 * LIMS API — thin wrappers around the core API client for LIMS endpoints.
 *
 * Centralises all API calls used by the LIMS console, workspace, and settings
 * so that components don't reach for the raw client directly.
 */
import { get, post, put, del } from "../../core/api/client";
import type { EntityListItem, EntityType, EntityTypePayload, PaginatedResponse } from "./types";

// ── Entity browsing ──────────────────────────────────────────────────────────

/** Fetch a paginated list of entities, optionally filtered by type. */
export function fetchEntities(
  typeFilter: string,
  url?: string,
): Promise<PaginatedResponse<EntityListItem>> {
  const path = url
    ? url.replace("/api", "")
    : `/lims/entities/?type=${typeFilter}`;
  return get<PaginatedResponse<EntityListItem>>(path);
}

/** Fetch a single entity by its display ID. */
export function fetchEntity(
  displayId: string,
): Promise<EntityListItem> {
  return get<EntityListItem>(
    `/lims/entities/${encodeURIComponent(displayId)}/`,
  );
}

// ── Entity-type CRUD ─────────────────────────────────────────────────────────

/** Fetch all entity types (schemas). */
export function fetchEntityTypes(): Promise<EntityType[]> {
  return get<EntityType[]>("/lims/entity-types/");
}

/** Create a new entity type. */
export function createEntityType(
  payload: EntityTypePayload,
): Promise<unknown> {
  return post("/lims/entity-types/", payload);
}

/** Update an existing entity type. */
export function updateEntityType(
  id: number,
  payload: EntityTypePayload,
): Promise<unknown> {
  return put(`/lims/entity-types/${id}/`, payload);
}

/** Soft-delete (deactivate) an entity type. */
export function deactivateEntityType(id: number): Promise<unknown> {
  return del(`/lims/entity-types/${id}/`);
}

// ── Danger-zone bulk deletes ─────────────────────────────────────────────────

export function deleteAllElns(): Promise<unknown> {
  return del("/eln/entries/delete_all/");
}

export function deleteAllEntities(): Promise<unknown> {
  return del("/lims/entities/delete_all/");
}

export function deleteEverything(): Promise<unknown> {
  return del("/delete-everything/");
}
