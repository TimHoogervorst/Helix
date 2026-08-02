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
  formatting: FormattingConfigInput;
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

// ── Formatting ─────────────────────────────────────────────────────────────

import type { FormattingConfig } from "./formatting";

export type FormattingConfigInput = FormattingConfig;

// ── Metric ─────────────────────────────────────────────────────────────────

/** A Metric as returned by GET /api/lims/metrics/ */
export interface MetricData {
  id: number;
  owner: number;
  owner_username: string;
  name: string;
  view: number;
  view_name: string;
  aggregate_function: string;
  column: string | null;
  created_at: string;
  updated_at: string;
}

/** Payload for creating a new Metric. */
export interface MetricCreatePayload {
  name?: string;
  view: number;
  aggregate_function: string;
  column?: string | null;
}

// ── Card CRUD ──────────────────────────────────────────────────────────────

/** Payload for creating/updating a card. */
export interface CardPayload {
  metric: number;
  surface: string;
  order?: number;
  label?: string;
  icon?: string;
  formatting?: FormattingConfig;
}
