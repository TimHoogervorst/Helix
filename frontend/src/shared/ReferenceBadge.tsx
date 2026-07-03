/**
 * Unified badge component for rendering any display ID as a pill.
 *
 * Two visual modes:
 *   Clickable (blue)    — navigates on click (inline mentions, Reference cells)
 *   Non-clickable (gray) — decorative, no navigation (list rows, detail cards, headers)
 *
 * Three resolution states:
 *   Loading  — plain text displayId
 *   Resolved — icon + displayId + title
 *   Broken   — red pill, displayId only (clickable mode only)
 */
import { useEffect, useRef } from "react";
import { useReferenceContext } from "../core/references/ReferenceProvider";
import type { ResolvedRef } from "../types/references";

// ── Public type ──────────────────────────────────────────────────────────

export interface BadgeResolved {
  displayId: string;
  title: string;
  type: "entry" | "entity";
  id: number;
  icon: string;
}

export interface ReferenceBadgeProps {
  /** Required — e.g. "E1", "BLOOD5" */
  displayId: string;
  /** default false → gray, true → blue */
  clickable?: boolean;
  /** Pre-resolved data (skips auto-resolve) */
  resolved?: BadgeResolved | null;
  /** When true and resolved data exists, omit the title span.
   *  Silently ignored when no resolved title is present (loading/broken/bare). */
  compact?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Map an API ResolvedRef (snake_case) to a BadgeResolved (camelCase). */
function toBadgeResolved(r: ResolvedRef): BadgeResolved {
  return {
    displayId: r.display_id,
    title: r.title,
    type: r.type as "entry" | "entity",
    id: r.id,
    icon: r.icon,
  };
}

/** Build the navigation href for a resolved badge. */
function badgeHref(resolved: BadgeResolved): string {
  if (resolved.type === "entity") {
    return `/lims/${resolved.displayId}`;
  }
  return `/eln/${resolved.displayId}`;
}

// ── Component ────────────────────────────────────────────────────────────

function ReferenceBadge({
  displayId,
  clickable = false,
  resolved,
  compact = false,
}: ReferenceBadgeProps) {
  const { resolutionMap, resolveIds } = useReferenceContext();

  // Stable reference to resolveIds so that resolutionMap changes don't
  // re-trigger every badge's effect (prevents O(N²) re-renders).
  const resolveIdsRef = useRef(resolveIds);
  resolveIdsRef.current = resolveIds;

  // Auto-resolve when clickable and no pre-resolved data provided
  useEffect(() => {
    if (clickable && resolved === undefined) {
      resolveIdsRef.current([displayId]);
    }
  }, [clickable, resolved, displayId]); // resolveIds intentionally omitted

  // ── Non-clickable + omitted/null resolved → bare displayId, minimal styling ──
  if (!clickable && (resolved === undefined || resolved === null)) {
    return (
      <span className="reference-badge is-nonclickable">
        <span className="ref-badge-id">{displayId}</span>
      </span>
    );
  }

  // ── Non-clickable + pre-resolved data → gray pill with icon + title ──
  if (!clickable && resolved) {
    return (
      <span className="reference-badge is-nonclickable is-resolved">
        <span className="ref-badge-icon">{resolved.icon}</span>
        <span className="ref-badge-id">{displayId}</span>
        {!compact && <span className="ref-badge-title">{resolved.title}</span>}
      </span>
    );
  }

  // ── Clickable + pre-resolved null → broken (red pill) ──
  if (clickable && resolved === null) {
    return (
      <span className="reference-badge is-clickable is-broken" title="Reference not found">
        <span className="ref-badge-id">{displayId}</span>
      </span>
    );
  }

  // ── Clickable + pre-resolved data → blue pill with link ──
  if (clickable && resolved) {
    return (
      <a
        className="reference-badge is-clickable is-resolved"
        href={badgeHref(resolved)}
      >
        <span className="ref-badge-icon">{resolved.icon}</span>
        <span className="ref-badge-id">{displayId}</span>
        {!compact && <span className="ref-badge-title">{resolved.title}</span>}
      </a>
    );
  }

  // ── Clickable + auto-resolve → loading / resolved / broken ──
  const autoResolved = resolutionMap.get(displayId);

  // Loading
  if (autoResolved === undefined) {
    return (
      <span className="reference-badge is-clickable">
        {displayId}
      </span>
    );
  }

  // Broken
  if (autoResolved === null) {
    return (
      <span className="reference-badge is-clickable is-broken" title="Reference not found">
        <span className="ref-badge-id">{displayId}</span>
      </span>
    );
  }

  // Resolved via context — map snake_case ResolvedRef to camelCase BadgeResolved
  const resolvedData = toBadgeResolved(autoResolved);
  return (
    <a
      className="reference-badge is-clickable is-resolved"
      href={badgeHref(resolvedData)}
    >
      <span className="ref-badge-icon">{resolvedData.icon}</span>
      <span className="ref-badge-id">{displayId}</span>
      {!compact && <span className="ref-badge-title">{resolvedData.title}</span>}
    </a>
  );
}

export default ReferenceBadge;
