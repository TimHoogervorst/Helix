/** A Metric Card as returned by GET /api/home/cards/ */
export interface CardData {
  id: number;
  owner: number | null;
  owner_username: string | null;
  is_global: boolean;
  metric: number;
  metric_name: string;
  surface: string;
  order: number;
  label: string;
  icon: string;
  formatting: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Response from GET /api/lims/metrics/{id}/value/ */
export interface MetricValueResponse {
  value: number;
}

/** Internal state for a card plus its live value. */
export interface CardState {
  card: CardData;
  value: number | null;
  valueLoading: boolean;
  valueError: boolean;
}
