import { get, post, patch, del } from "../../shell/src/api/client";
import type {
  CardData,
  CardPayload,
  MetricValueResponse,
  MetricData,
  MetricCreatePayload,
} from "./types";

// ── Cards ──────────────────────────────────────────────────────────────────

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

/** Create a new personal Metric Card. */
export function createCard(payload: CardPayload): Promise<CardData> {
  return post<CardData>("/home/cards/", payload);
}

/** Update a personal Metric Card. */
export function updateCard(
  id: number,
  payload: Partial<CardPayload>,
): Promise<CardData> {
  return patch<CardData>(`/home/cards/${id}/`, payload);
}

/** Delete a personal Metric Card. */
export function deleteCard(id: number): Promise<void> {
  return del<void>(`/home/cards/${id}/`);
}

/** Fork a global card into a personal copy. */
export function forkCard(id: number): Promise<CardData> {
  return post<CardData>(`/home/cards/${id}/fork/`);
}

// ── Metrics ────────────────────────────────────────────────────────────────

/** Fetch readable Metrics (own + on public Views). */
export function getMetrics(): Promise<MetricData[]> {
  return get<MetricData[]>("/lims/metrics/");
}

/** Create a new Metric. */
export function createMetric(
  payload: MetricCreatePayload,
): Promise<MetricData> {
  return post<MetricData>("/lims/metrics/", payload);
}

// ── Metric Values ──────────────────────────────────────────────────────────

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
