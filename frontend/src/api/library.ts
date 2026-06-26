import { get } from "./client";
import type { LibraryContentsResponse } from "../types/library";

/**
 * Fetch mixed folder + entry contents at the given Library path.
 *
 * @param path  Folder path, e.g. ``""`` or ``"/"`` for root, ``"/Experiments"`` for nested.
 * @param page  Page number (1-based).
 * @param search Optional search query filtering by name/display_id.
 */
export function getLibraryContents(
  path: string,
  page?: number,
  search?: string,
): Promise<LibraryContentsResponse> {
  const params = new URLSearchParams({ path });
  if (page !== undefined) params.set("page", String(page));
  if (search) params.set("search", search);
  return get(`/library/contents/?${params.toString()}`);
}
