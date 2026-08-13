import { get, patch, del } from "../../shell/src/api/client";
import type { LibraryContentsResponse, LibraryProjectItem, LibraryFolderPath, LibraryFolderItem } from "./types";
import type { Project } from "../access/types";

/**
 * Fetch accessible Projects for the Library root listing.
 */
export function getAccessibleProjects(): Promise<Project[]> {
  return get<Project[]>("/access/projects/?accessible=1&with_role=1");
}

/**
 * Fetch mixed folder + entry contents scoped to a Project.
 *
 * @param projectUid  The Project's immutable UID.
 * @param path        Folder path beneath the Project root (empty for root).
 * @param page        Page number (1-based).
 */
export function getLibraryContents(
  projectUid: string,
  path?: string,
  page?: number,
): Promise<LibraryContentsResponse> {
  const params = new URLSearchParams({ project: projectUid });
  if (path) params.set("path", path);
  if (page !== undefined) params.set("page", String(page));
  return get(`/library/contents/?${params.toString()}`);
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
