import { get, patch, del } from "../../shell/src/api/client";
import type { LibraryContentsResponse, LibraryFolderPath, LibraryFolderItem } from "./types";
import type { Project } from "../access/types";

/**
 * Fetch accessible Projects for the Library root listing.
 */
export function getAccessibleProjects(): Promise<Project[]> {
  return get<Project[]>("/access/projects/?accessible=1&with_role=1");
}

/**
 * Fetch mixed direct children of a Source.
 *
 * @param sourceType  The Source kind.
 * @param sourceId    The Source primary key, or Project UID.
 * @param recursive   Whether to include the complete descendant subtree.
 * @param page        Page number (1-based).
 */
export function getLibraryChildren(
  sourceType: "project" | "folder" | "entry" | "entity",
  sourceId: number | string,
  recursive = false,
  page?: number,
): Promise<LibraryContentsResponse> {
  const params = new URLSearchParams({
    source_type: sourceType,
    source_id: String(sourceId),
  });
  if (recursive) params.set("recursive", "1");
  if (page !== undefined) params.set("page", String(page));
  return get(`/library/children/?${params.toString()}`);
}

/**
 * Fetch a flat list of folder paths for a Project (for the move picker).
 */
export function getFolders(projectUid: string): Promise<LibraryFolderPath[]> {
  return get<LibraryFolderPath[]>(`/library/folders/?project=${projectUid}`);
}

/**
 * Rename a folder.
 */
export function patchFolder(
  folderId: number,
  payload: { name: string },
): Promise<LibraryFolderItem> {
  return patch<LibraryFolderItem>(`/core/folders/${folderId}/`, payload);
}

/**
 * Delete a folder (recursive CASCADE — child folders, entries, entities).
 */
export function deleteFolder(folderId: number): Promise<void> {
  return del(`/core/folders/${folderId}/`);
}

/**
 * Delete an entry.
 */
export function deleteEntry(displayId: string): Promise<void> {
  return del(`/eln/entries/${displayId}/`);
}

/**
 * Delete an entity by its display ID.
 */
export function deleteEntity(displayId: string): Promise<void> {
  return del(`/lims/entities/${displayId}/`);
}
