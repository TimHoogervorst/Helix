/**
 * Colored pill for entry/entity status.
 *
 * Extracted from BaseCard — maps status keys to human-readable labels
 * and CSS classes. Unknown statuses render a neutral fallback.
 */

// ── Status maps ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In Progress",
  finished: "Finished",
};

const STATUS_CLASSES: Record<string, string> = {
  in_progress: "status-warn",
  finished: "status-success",
};

// ── Types ──────────────────────────────────────────────────────────────────

export interface StatusBadgeProps {
  /** Status key (e.g. "in_progress", "finished"). */
  status: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = STATUS_LABELS[status] ?? status;
  const className = STATUS_CLASSES[status] ?? "";

  if (!label) return null;

  return (
    <span className={`card-status-chip ${className}`}>
      {label}
    </span>
  );
}
