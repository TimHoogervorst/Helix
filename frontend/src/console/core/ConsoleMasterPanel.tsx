// ═══════════════════════════════════════════════════════════════════════════
// Re-export shim — the canonical file has moved to core/console/ConsoleMasterPanel.tsx.
// This shim exists so existing imports don't break during the migration.
// Once all consumers import from the new path, delete this file.
// ═══════════════════════════════════════════════════════════════════════════
export { default } from "../../core/console/ConsoleMasterPanel";
export type { MasterColumn, ConsoleMasterPanelProps } from "../../core/console/ConsoleMasterPanel";
