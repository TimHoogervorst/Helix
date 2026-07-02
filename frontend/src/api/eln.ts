import { get, post, del } from "./client";
import type { EntryDetail, Tag } from "../types/eln";

/**
 * List or search tags.
 *
 * @param query  Optional search string for filtering by name.
 */
export function listTags(query?: string): Promise<Tag[]> {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return get<Tag[]>(`/eln/tags/${params}`);
}

/**
 * Create a new tag with the given name and colour.
 */
export function createTag(name: string, color: string): Promise<Tag> {
  return post<Tag>("/eln/tags/", { name, color });
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
