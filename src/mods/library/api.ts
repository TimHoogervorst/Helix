import { get } from "../../shell/src/api/client";
import type { LibraryContentsResponse, LibraryProjectItem } from "./types";
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
