import { get, post, patch, del } from "../../core/api/client";
import type { EntryDetail, EntryListItem, Tag, ElnAction } from "./types";

/**
 * DRF paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** List ELN entries with optional pagination. */
export async function listEntries(url?: string): Promise<PaginatedResponse<EntryListItem>> {
  const path = url
    ? url.replace("/api", "")
    : "/eln/entries/";
  return get<PaginatedResponse<EntryListItem>>(path);
}

/**
 * List or search tags.
 *
 * @param query  Optional search string for filtering by name.
 */

// Unwrap DRF paginated list endpoint — backend wraps responses in { count, results, ... }
export async function listTags(query?: string): Promise<Tag[]> {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  const data = await get<PaginatedResponse<Tag>>(`/eln/tags/${params}`);
  // Unwrap paginated response — the backend always paginates list endpoints
  return data.results ?? (Array.isArray(data) ? data : []);
}

/**
 * Create a new tag with the given name, colour, and icon.
 */
export function createTag(name: string, color: string, icon?: string): Promise<Tag> {
  return post<Tag>("/eln/tags/", { name, color, icon: icon || "circle" });
}

/**
 * Update an existing tag's colour and/or icon.
 */
export function updateTag(tagId: number, data: { color?: string; icon?: string }): Promise<Tag> {
  return patch<Tag>(`/eln/tags/${tagId}/`, data);
}

/**
 * Attach one or more tags to a notebook entry.
 * Returns the full updated entry.
 */
export function attachTags(
  displayId: string,
  tagIds: number[],
): Promise<EntryDetail> {
  return post<EntryDetail>(`/eln/entries/${displayId}/tags/`, { tag_ids: tagIds });
}

/**
 * Detach a single tag from a notebook entry.
 * Returns the full updated entry.
 */
export function detachTag(
  displayId: string,
  tagId: number,
): Promise<EntryDetail> {
  return del<EntryDetail>(`/eln/entries/${displayId}/tags/${tagId}/`);
}

/**
 * Fetch actions for an entry, optionally filtered by action_type and/or since.
 *
 * @param displayId  The entry's display_id (e.g. "E-0001").
 * @param actionType Optional filter, e.g. "edited" or "created".
 * @param since      Optional ISO 8601 datetime to filter actions after.
 *                    Defaults to one week ago when fetching edited actions for
 *                    the avatar row.
 */
export async function fetchActions(
  displayId: string,
  actionType?: string,
  since?: string,
): Promise<ElnAction[]> {
  const params = new URLSearchParams();
  if (actionType) params.set("action_type", actionType);
  if (since) params.set("since", since);

  const qs = params.toString();
  const path = `/eln/entries/${displayId}/actions/${qs ? `?${qs}` : ""}`;
  const data = await get<{ results: ElnAction[] }>(path);
  return data.results ?? [];
}

/**
 * Log a custom action against an entry.
 */
export function createAction(
  displayId: string,
  actionType: string,
  metadata?: Record<string, unknown>,
): Promise<ElnAction> {
  return post<ElnAction>(`/eln/entries/${displayId}/actions/`, {
    action_type: actionType,
    metadata: metadata || {},
  });
}
