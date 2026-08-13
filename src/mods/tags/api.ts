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
 * Update an existing tag's name, colour, and/or icon.
 */
export function updateTag(
  tagId: number,
  data: { name?: string; color?: string; icon?: string },
): Promise<Tag> {
  return patch<Tag>(`/tags/${tagId}/`, data);
}

/**
 * Delete a tag by ID.  Django cascades through-table rows; entries survive.
 */
export function deleteTag(tagId: number): Promise<void> {
  return del<void>(`/tags/${tagId}/`);
}

// ── Colour token API ────────────────────────────────────────────────────────

export interface ColorToken {
  id: number;
  key: string;
  label: string;
  hex: string;
  hex_dark: string;
  hex_light: string;
}

export interface DeleteResponse {
  detail: string;
  usage_count: number;
}

export function listColors(): Promise<ColorToken[]> {
  return get<ColorToken[]>("/colors/");
}

export function createColor(data: {
  key: string;
  label: string;
  hex: string;
}): Promise<ColorToken> {
  return post<ColorToken>("/colors/", data);
}

export function deleteColor(id: number): Promise<DeleteResponse> {
  return del<DeleteResponse>(`/colors/${id}/`);
}

// ── Icon library API ────────────────────────────────────────────────────────

export interface IconLibraryEntry {
  id: number;
  key: string;
  label: string;
  kind: "lucide" | "custom";
  token: string;
  svg: string;
}

export function listIcons(): Promise<IconLibraryEntry[]> {
  return get<IconLibraryEntry[]>("/icons/");
}

export function createIcon(data: {
  key: string;
  label: string;
  kind: "lucide" | "custom";
  token?: string;
  svg?: string;
}): Promise<IconLibraryEntry> {
  return post<IconLibraryEntry>("/icons/", data);
}

export function deleteIcon(id: number): Promise<DeleteResponse> {
  return del<DeleteResponse>(`/icons/${id}/`);
}
