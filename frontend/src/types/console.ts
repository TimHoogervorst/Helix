// ═══════════════════════════════════════════════════════════════════════════
// Re-export shim — the canonical file has moved to core/types/console.ts.
// This shim exists so existing imports don't break during the migration.
// Once all consumers import from the new path, delete this file.
// ═══════════════════════════════════════════════════════════════════════════
export type { ViewState, ConsoleContextValue } from "../core/types/console";
