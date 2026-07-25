import { get, post, put, patch, del } from "../../shell/src/api/client";
import type { Dropdown } from "./types";

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
 * List all dropdowns.
 */
export async function listDropdowns(): Promise<Dropdown[]> {
  const data = await get<PaginatedResponse<Dropdown>>("/dropdowns/");
  return data.results ?? (Array.isArray(data) ? (data as unknown as Dropdown[]) : []);
}

/**
 * Create a new dropdown.
 */
export function createDropdown(
  name: string,
  options: string[],
): Promise<Dropdown> {
  return post<Dropdown>("/dropdowns/", { name, options });
}

/**
 * Full-update an existing dropdown.
 */
export function updateDropdown(
  dropdownId: number,
  data: { name: string; options: string[] },
): Promise<Dropdown> {
  return put<Dropdown>(`/dropdowns/${dropdownId}/`, data);
}

/**
 * Partial-update an existing dropdown (e.g. add/remove options).
 */
export function patchDropdown(
  dropdownId: number,
  data: { name?: string; options?: string[] },
): Promise<Dropdown> {
  return patch<Dropdown>(`/dropdowns/${dropdownId}/`, data);
}

/**
 * Delete a dropdown by ID.
 */
export function deleteDropdown(dropdownId: number): Promise<void> {
  return del<void>(`/dropdowns/${dropdownId}/`);
}
