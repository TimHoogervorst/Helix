// ═══════════════════════════════════════════════════════════════════════════
// Re-export shim — the canonical file has moved to core/console/useConsoleView.ts.
// This shim exists so existing imports don't break during the migration.
// Once all consumers import from the new path, delete this file.
// ═══════════════════════════════════════════════════════════════════════════
export { useConsoleView } from "../../core/console/useConsoleView";
export type { ConsoleViewState } from "../../core/console/useConsoleView";
