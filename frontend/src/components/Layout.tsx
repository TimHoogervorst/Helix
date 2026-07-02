// ═══════════════════════════════════════════════════════════════════════════
// Re-export shim — the canonical file has moved to core/shell/Layout.tsx.
// This shim exists so existing imports don't break during the migration.
// Once all consumers import from the new path, delete this file.
// ═══════════════════════════════════════════════════════════════════════════
export { default } from "../core/shell/Layout";
