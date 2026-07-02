import { get, post, patch, del } from "./client";
import type { EntryDetail, Tag } from "../types/eln";

/**
 * List or search tags.
 *
 * @param query  Optional search string for filtering by name.
 */
/**
 * DRF paginated response wrapper.
 */
interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

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
