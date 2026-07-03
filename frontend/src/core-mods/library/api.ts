import { get } from "../../api/client";
import type { LibraryContentsResponse } from "./types";

/**
 * Fetch mixed folder + entry contents at the given Library path.
 *
 * @param path  Folder path, e.g. ``""`` or ``"/"`` for root, ``"/Experiments"`` for nested.
 * @param page  Page number (1-based).
 */
export function getLibraryContents(
  path: string,
  page?: number,
): Promise<LibraryContentsResponse> {
  const params = new URLSearchParams({ path });
  if (page !== undefined) params.set("page", String(page));
  return get(`/library/contents/?${params.toString()}`);
}
