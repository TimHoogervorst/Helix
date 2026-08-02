import { get } from "../../shell/src/api/client";
import type { CardData, MetricValueResponse } from "./types";

/**
 * Fetch Metric Cards for a surface.
 *
 * Returns global cards plus the current user's personal cards,
 * ordered by surface and order.
 */
export function getCards(surface: string): Promise<CardData[]> {
  return get<CardData[]>(
    `/home/cards/?surface=${encodeURIComponent(surface)}`,
  );
}

/**
 * Evaluate a Metric to its live scalar value.
 *
 * The optional `identity` parameter resolves ``is_me`` filters
 * to the supplied user identity (typically the current username).
 */
export function getMetricValue(
  metricId: number,
  identity?: string,
): Promise<MetricValueResponse> {
  const params = identity
    ? `?me=${encodeURIComponent(identity)}`
    : "";
  return get<MetricValueResponse>(
    `/lims/metrics/${metricId}/value/${params}`,
  );
}
