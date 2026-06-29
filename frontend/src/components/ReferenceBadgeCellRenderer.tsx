/**
 * AG Grid cell renderers that wrap ReferenceBadge for table display.
 *
 * Two use cases:
 *   displayId column  — IF value matches /^[A-Z]\\d+$/ → clickable badge; else plain text
 *   Reference column  — clickable badge with auto-resolve
 *
 * Requires ReferenceProvider to be in the component tree (provided at Layout level).
 */
import ReferenceBadge from "./ReferenceBadge";
import type { CustomCellRendererProps } from "ag-grid-react";

/**
 * Cell renderer for the ``displayId`` index column.
 *
 * - Real display IDs (e.g. "BLOOD1") → clickable blue badge
 * - Placeholder IDs (e.g. "#new-1")   → plain text, no badge
 */
export function DisplayIdCellRenderer({ value }: CustomCellRendererProps) {
  const displayId = String(value ?? "");

  // Placeholder rows get plain text
  if (!displayId || displayId.startsWith("#new")) {
    return (
      <span
        style={{
          fontSize: "0.82em",
          fontFamily: "var(--font-mono, monospace)",
          color: "#52525b",
        }}
      >
        {displayId}
      </span>
    );
  }

  // Real display IDs get clickable badges
  return <ReferenceBadge displayId={displayId} clickable compact={true} />;
}

/**
 * Cell renderer for Reference-type columns.
 *
 * Renders a clickable blue badge that auto-resolves via ReferenceProvider.
 */
export function ReferenceCellRenderer({ value }: CustomCellRendererProps) {
  const displayId = String(value ?? "");

  if (!displayId) {
    return <span style={{ color: "var(--gray-400)" }}>—</span>;
  }

  return <ReferenceBadge displayId={displayId} clickable />;
}
