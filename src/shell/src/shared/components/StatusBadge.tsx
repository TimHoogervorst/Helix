/**
 * Colored pill for entry/entity status.
 *
 * Extracted from BaseCard — maps status keys to human-readable labels
 * and CSS classes.  Unknown statuses are formatted automatically
 * (underscores → spaces, title case).
 */

// ── Status helpers ──────────────────────────────────────────────────────────

/** Known status label overrides. Unknown statuses are auto-formatted. */
const STATUS_LABELS: Record<string, string> = {
  in_progress: "In Progress",
  finished: "Finished",
};

const STATUS_CLASSES: Record<string, string> = {
  in_progress: "status-warn",
  finished: "status-success",
};

/** Derive a human-readable label from a status key. */
function formatStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface StatusBadgeProps {
  /** Status key (e.g. "in_progress", "finished"). */
  status: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function StatusBadge({ status }: StatusBadgeProps) {
  const label = formatStatusLabel(status);
  const className = STATUS_CLASSES[status] ?? "";

  if (!label) return null;

  return (
    <span className={`card-status-chip ${className}`}>
      {label}
    </span>
  );
}
