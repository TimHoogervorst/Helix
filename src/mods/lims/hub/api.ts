import { get } from "../../../shell/src/api/client";
import type { EntityHubResponse } from "../types";

/**
 * Fetch entities from the entity_hub_view via the registry endpoint.
 *
 * @param page  Page number (1-based).
 * @param size  Page size (50, 100, or 200).
 */
export function getEntities(
  page?: number,
  size?: number,
): Promise<EntityHubResponse> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set("page", String(page));
  if (size !== undefined) params.set("size", String(size));
  const qs = params.toString();
  return get(`/registry/entities/${qs ? `?${qs}` : ""}`);
}
