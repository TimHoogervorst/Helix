// ═══════════════════════════════════════════════════════════════════════════
// Re-export shim — the canonical file has moved to core/console/ConsolePage.tsx.
// This shim exists so existing imports don't break during the migration.
// Once all consumers import from the new path, delete this file.
// ═══════════════════════════════════════════════════════════════════════════
export { default } from "../../core/console/ConsolePage";
export type { ConsolePageProps } from "../../core/console/ConsolePage";
