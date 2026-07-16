import { get, post, patch, del } from "../../shell/src/api/client";
import type { Tag } from "./types";

/**
 * DRF paginated response wrapper.
 */
interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * List or search tags.
 *
 * @param query  Optional search string for filtering by name.
 */
export async function listTags(query?: string): Promise<Tag[]> {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  const data = await get<PaginatedResponse<Tag>>(`/tags/${params}`);
  return data.results ?? (Array.isArray(data) ? (data as unknown as Tag[]) : []);
}

/**
 * Create a new tag with the given name, colour, and optional icon.
 */
export function createTag(name: string, color: string, icon?: string): Promise<Tag> {
  return post<Tag>("/tags/", { name, color, icon: icon ?? "circle" });
}

/**
 * Update an existing tag's colour and/or icon.
 */
export function updateTag(tagId: number, data: { color?: string; icon?: string }): Promise<Tag> {
  return patch<Tag>(`/tags/${tagId}/`, data);
}

/**
 * Delete a tag by ID.  Django cascades through-table rows; entries survive.
 */
export function deleteTag(tagId: number): Promise<void> {
  return del<void>(`/tags/${tagId}/`);
}
